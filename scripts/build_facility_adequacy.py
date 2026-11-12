"""
Medicare Advantage facility network adequacy, market view: can each county's market support an adequate facility network?

Applies the CMS 2026 HSD Reference File facility standards (minimum number, maximum distance) to every Medicare-certified
facility of each type, county by county. This tests the whole market (every facility that could be contracted), not a plan.

Facility types scored (the rest of the HSD facility types need data the public files do not carry):
  040 Acute inpatient hospitals   short-term acute and critical access hospitals; the minimum is a number of BEDS
  041 Cardiac surgery program     POS open heart surgery service by the hospital's staff, or Medicare discharges for cardiac valve or bypass surgery (MS-DRG 216 to 236), 2022 to 2024
  042 Cardiac catheterization     POS cardiac cath lab service by staff, a cardiac catheterization cost center on the cost report, or Medicare discharges for PCI or cardiac cath DRGs, 2022 to 2024
  043 Critical care / ICU         ICU, CCU, burn, surgical or other special care beds on the cost report, or POS ICU service by staff
  045 Outpatient surgery          ambulatory surgical centers (iQIES POS) and hospitals with operating rooms or an outpatient surgery unit
  046 Skilled nursing facilities  facilities with Medicare SNF beds (iQIES POS)
  052 Inpatient psychiatric       psychiatric hospitals, hospital psychiatric units (POS) and IPF subprovider beds (cost report)

Inputs:
  data/raw/pos/qies_utf8.csv            POS file, QIES hospitals (Q3 2026), converted to UTF-8
  data/raw/pos/POS_iQIES.DATA.Q3_2026.csv   POS file, iQIES (ASCs, SNFs and others, Q3 2026)
  /home/claude/hcris_pq                 HCRIS parquet (beds, ICU beds, IPF beds, cath cost center), latest report per hospital
  public/data/hospitals.json            hospital list (type, ZIP, county, system)
  ../physician-explorer/data/raw/na/hsd_2026.xlsx and the physician explorer's na/<state>.json (counties, tract centers)

Method (same as the physician explorer, labeled in the app): straight-line distance from Census 2020 tract population centers
to facility ZIP code centers; coverage = share of county population within the maximum distance of at least one facility;
count = facilities (or beds) within the maximum distance of at least one tract, against the minimum. Fails: coverage under 90%
or count under the minimum. Thin: coverage under 95% or count under twice the minimum.

Outputs (public/data/):
  fa_meta.json            facility types, summary, source
  fa/<state>.json         per county: name, designation, beneficiaries, per type [coverage, count in reach, minimum, max miles, ids in reach]
  fa_fac.json             facilities: id -> [name, kind, city, state, ZIP, CCN or POS number, beds, system id, types]
  fa_status.json          county -> one status character per type
"""
import json, re, glob, csv
from collections import defaultdict
from pathlib import Path
import numpy as np, openpyxl, duckdb, zipcodes
from sklearn.neighbors import BallTree

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'public' / 'data'
PHYS = ROOT.parent / 'physician-explorer'
PQ = Path('/home/claude/hcris_pq')
EARTH_MI = 3958.8
con = duckdb.connect(); con.execute('SET enable_progress_bar=false')

TYPES = [('040', 'Acute Inpatient Hospitals', 'beds'), ('041', 'Cardiac Surgery Program', 'facilities'), ('042', 'Cardiac Catheterization Services', 'facilities'),
         ('043', 'Critical Care Services (ICU)', 'facilities'), ('045', 'Outpatient Surgery (ASC or hospital)', 'facilities'),
         ('046', 'Skilled Nursing Facilities', 'facilities'), ('052', 'Inpatient Psychiatric Facility Services', 'facilities')]
NOT_SCORED = ['Diagnostic Radiology', 'Mammography', 'Physical Therapy', 'Occupational Therapy', 'Speech Therapy', 'Outpatient Infusion/Chemotherapy', 'Outpatient Behavioral Health']
CODES = [t[0] for t in TYPES]

# ---------- HSD facility standards ----------
wb = openpyxl.load_workbook(PHYS / 'data/raw/na/hsd_2026.xlsx', read_only=True, data_only=True)
def hdr(ws, row): return [str(c).strip().zfill(3) if c is not None else None for c in next(ws.iter_rows(min_row=row, max_row=row, values_only=True))]
CTY = {}
ws = wb['Minimum Facility #s']; hc = hdr(ws, 3)
for r in ws.iter_rows(min_row=4, values_only=True):
    if not r[3]: continue
    CTY[str(r[3]).zfill(5)] = {'n': r[0], 'st': r[1], 'des': r[5], 'b': r[4], 'min': {hc[i]: r[i] for i in range(8, len(r)) if hc[i] in CODES and r[i] is not None}, 'td': {}}
ws = wb['Facility Time & Distance']; hc = hdr(ws, 3)
for r in ws.iter_rows(min_row=5, values_only=True):
    if not r[3]: continue
    c = CTY.get(str(r[3]).zfill(5))
    if not c: continue
    for i in range(5, len(r) - 1):
        if hc[i] in CODES and r[i + 1] is not None: c['td'][hc[i]] = (r[i], r[i + 1])
print('HSD counties', len(CTY))

# SSA -> FIPS, the same way as the physician explorer
ssa2fips = {}
for f in sorted(glob.glob(str(ROOT.parent / 'ma-enrollment-explorer/data/raw/State_County_Penetration_MA_*.csv'))):
    for r in csv.DictReader(open(f, encoding='utf-8-sig', errors='replace')):
        s, fp = (r.get('SSA') or '').strip(), (r.get('FIPS') or '').strip()
        if re.fullmatch(r'\d{5}', s) and re.fullmatch(r'\d{5}', fp) and fp != '00000': ssa2fips[s] = fp
mac = json.load(open(ROOT.parent / 'ma-enrollment-explorer/public/data/counties.json'))['counties']
norm = lambda s: re.sub(r'[^a-z]', '', str(s).lower().replace('county', '').replace('borough', '').replace('censusarea', ''))
name2f = {(norm(v.get('n', '')), v.get('s')): f for f, v in mac.items()}
for s_, c in CTY.items():
    if s_ not in ssa2fips and (norm(c['n']), c['st']) in name2f: ssa2fips[s_] = name2f[(norm(c['n']), c['st'])]

# tract centers from the physician explorer's county files
TRACTS = {}
for f in glob.glob(str(PHYS / 'public/data/na/*.json')):
    for fips, v in json.load(open(f)).items():
        if v.get('t'): TRACTS[fips] = np.array(v['t'], dtype=float)
print('counties with tracts', len(TRACTS))

ZC = {z['zip_code']: (float(z['lat']), float(z['long'])) for z in zipcodes.list_all() if z.get('lat') and z.get('long')}

# ---------- facilities ----------
H = {h['c']: h for h in json.load(open(OUT / 'hospitals.json'))}
# latest cost report per hospital
beds, icu, ipf, cath = {}, {}, {}, set()
for y in ['2022', '2023', '2024', '2025']:
    rp = f"(SELECT column00::BIGINT rpt, lpad(trim(column02),6,'0') ccn, strptime(column06,'%m/%d/%Y') e FROM '{PQ}/rpt_{y}.parquet')"
    q = con.execute(f"""WITH r AS (SELECT * FROM {rp} QUALIFY row_number() OVER (PARTITION BY ccn ORDER BY e DESC) = 1)
        SELECT r.ccn, sum(CASE WHEN n.line IN ('00700') THEN n.v END) ap, sum(CASE WHEN n.line IN ('00800','00900','01000','01100','01200') THEN n.v END) icu,
               sum(CASE WHEN n.line = '01600' THEN n.v END) ipf
        FROM '{PQ}/nmrc_{y}.parquet' n JOIN r USING (rpt) WHERE n.ws = 'S300001' AND n.col = '00200' GROUP BY 1""").fetchall()
    for ccn, ap, ic, ip in q:
        beds[ccn] = (ap or 0) + (ic or 0); icu[ccn] = ic or 0; ipf[ccn] = ip or 0
    for (ccn,) in con.execute(f"""WITH r AS (SELECT * FROM {rp} QUALIFY row_number() OVER (PARTITION BY ccn ORDER BY e DESC) = 1)
        SELECT DISTINCT r.ccn FROM '{PQ}/alpha_{y}.parquet' a JOIN r USING (rpt) JOIN '{PQ}/nmrc_{y}.parquet' n ON n.rpt = a.rpt AND n.ws = 'A000000' AND n.line = a.line
        WHERE a.ws = 'A000000' AND a.col = '00000' AND upper(a.v) LIKE '%CATH%' AND n.v > 0""").fetchall():
        cath.add(ccn)
print('cost report beds', len(beds), 'cath', len(cath))
# Medicare inpatient discharges by hospital and MS-DRG, 2022 to 2024 (rows under 11 discharges are suppressed by CMS)
SURG_DRG = ['216','217','218','219','220','221','228','229','231','232','233','234','235','236']
CATH_DRG = ['246','247','248','249','250','251','273','274','286','287']
inp = ','.join(f"'{f}'" for f in sorted(glob.glob(str(RAW / 'inpatient/MUP_INP_*_DY2[234]_PrvSvc.CSV'))))
drg = con.execute(f"""SELECT DISTINCT lpad(Rndrng_Prvdr_CCN, 6, '0'), DRG_Cd FROM read_csv([{inp}], all_varchar=true, header=true, union_by_name=true)
     WHERE DRG_Cd IN ({','.join(repr(d) for d in SURG_DRG + CATH_DRG)})""").fetchall()
surg_drg = {c for c, d in drg if d in SURG_DRG}; cath_drg = {c for c, d in drg if d in CATH_DRG}
print('inpatient DRG evidence: cardiac surgery', len(surg_drg), 'cath or PCI', len(cath_drg))

pos = {r[0]: r for r in con.execute(f"""SELECT PRVDR_NUM, FAC_NAME, CITY_NAME, STATE_CD, left(ZIP_CD, 5), try_cast(BED_CNT AS INT), CRDC_CTHRTZTN_LAB_SRVC_CD, OPEN_HRT_SRGRY_SRVC_CD,
        ICU_SRVC_CD, OPRTG_ROOM_SRVC_CD, OP_SRGRY_UNIT_SRVC_CD, PSYCH_UNIT_SW, try_cast(PSYCH_UNIT_BED_CNT AS INT), PRVDR_CTGRY_SBTYP_CD
        FROM read_csv('{RAW}/pos/qies_utf8.csv', all_varchar=true, header=true) WHERE PGM_TRMNTN_CD = '00'""").fetchall()}
staff = lambda v: v in ('1', '3')
FAC = {}   # id -> [name, kind, city, st, zip, ccn/pos, beds, system, types]
for ccn, h in H.items():
    if h['yr'][-1] < 2022: continue
    p = pos.get(ccn)
    if p is None: continue   # not an active Medicare-certified hospital in the POS file
    z = (h.get('z') or p[4] or '')[:5]
    if z not in ZC: continue
    t = []
    if h['t'] in ('STH', 'CAH'): t.append('040')
    if h['t'] in ('STH', 'CAH') and (staff(p[7]) or ccn in surg_drg): t.append('041')
    if h['t'] in ('STH', 'CAH') and (staff(p[6]) or ccn in cath or ccn in cath_drg): t.append('042')
    if h['t'] in ('STH', 'CAH') and (icu.get(ccn, 0) > 0 or staff(p[8])): t.append('043')
    if h['t'] in ('STH', 'CAH') and (staff(p[9]) or staff(p[10])): t.append('045')
    if h['t'] == 'PH' or ipf.get(ccn, 0) > 0 or p[11] == 'Y': t.append('052')
    if not t: continue
    b = beds.get(ccn) or p[5] or 0
    FAC[ccn] = [h['n'], 'hospital', h.get('ci'), h['s'], z, ccn, int(b), h.get('sy'), t]
nh = len(FAC)
for pid, name, typ, city, st, z, b1, b2 in con.execute(f"""SELECT prvdr_num, fac_name, prvdr_type_id, city_name, state_cd, left(zip_cd, 5),
        try_cast(mdcr_snf_bed_cnt AS INT), try_cast(mdcr_mdcd_snf_bed_cnt AS INT)
        FROM read_csv('{RAW}/pos/POS_iQIES.DATA.Q3_2026.csv', all_varchar=true, header=true)
        WHERE prvdr_type_id IN ('11', '20') AND coalesce(trim(pgm_trmntn_cd), '00') = '00'""").fetchall():
    if z not in ZC: continue
    if typ == '11': FAC['A' + pid] = [name, 'asc', city, st, z, pid, None, None, ['045']]
    elif (b1 or 0) + (b2 or 0) > 0: FAC['S' + pid] = [name, 'snf', city, st, z, pid, (b1 or 0) + (b2 or 0), None, ['046']]
print('facilities: hospitals', nh, 'total', len(FAC))

# ---------- scoring ----------
res = defaultdict(dict)
for code, name, unit in TYPES:
    ids = [i for i, f in FAC.items() if code in f[8]]
    by_zip = defaultdict(list)
    for i in ids: by_zip[FAC[i][4]].append(i)
    zl = list(by_zip)
    tree = BallTree(np.radians(np.array([ZC[z] for z in zl])), metric='haversine')
    for ssa, c in CTY.items():
        f = ssa2fips.get(ssa); T = TRACTS.get(f) if f else None
        if T is None or code not in c['td']: continue
        dmax = c['td'][code][1]
        idx = tree.query_radius(np.radians(T[:, :2]), r=dmax / EARTH_MI)
        pop = T[:, 2]
        cov = float(sum(pop[k] for k, ix in enumerate(idx) if len(ix)) / pop.sum())
        inr = sorted({i for ix in idx for j in ix for i in by_zip[zl[j]]})
        n = sum(FAC[i][6] or 0 for i in inr) if unit == 'beds' else len(inr)
        res[f][code] = [round(cov, 4), n, c['min'].get(code), dmax, inr]
    print(code, 'scored')

def status_of(v):
    if not v: return '-'
    cov, n, mn = v[0], v[1], v[2]
    if cov < 0.9 or (mn is not None and n < mn): return 'F'
    if cov < 0.95 or (mn is not None and n < 2 * mn): return 'T'
    return 'P'

(OUT / 'fa').mkdir(exist_ok=True)
for f in glob.glob(str(OUT / 'fa/*.json')): Path(f).unlink()
by_st, summary = defaultdict(dict), {c: {'F': 0, 'T': 0, 'P': 0} for c in CODES}
for ssa, c in CTY.items():
    f = ssa2fips.get(ssa)
    if not f or f not in res: continue
    by_st[c['st']][f] = {'n': c['n'], 'des': c['des'], 'b': c['b'], 's': res[f]}
    for code in CODES:
        s = status_of(res[f].get(code))
        if s in summary[code]: summary[code][s] += 1
dump = lambda o, p: json.dump(o, open(p, 'w'), separators=(',', ':'))
for st, v in by_st.items(): dump(v, OUT / 'fa' / f'{st}.json')
dump({f: ''.join(status_of(r.get(c)) for c in CODES) for f, r in res.items()}, OUT / 'fa_status.json')
dump(FAC, OUT / 'fa_fac.json')
dump({'types': TYPES, 'not_scored': NOT_SCORED, 'summary': summary, 'counts': {c: sum(1 for f in FAC.values() if c in f[8]) for c in CODES},
      'source': 'CMS 2026 HSD Reference File (contract year 2027 applications); CMS Provider of Services files Q3 2026; HCRIS cost reports'}, OUT / 'fa_meta.json')
print('summary', summary)
