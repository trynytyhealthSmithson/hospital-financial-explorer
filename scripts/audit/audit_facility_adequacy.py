"""Independent recomputation of the facility adequacy results for a sample of counties, plus facility classification checks.
Scoring is redone with plain numpy haversine (no BallTree) from fa_fac.json, the physician explorer's tract centers and
the HSD workbook read by header. Usage: python3 scripts/audit/audit_facility_adequacy.py"""
import json, glob, random
from collections import Counter
from pathlib import Path
import numpy as np, openpyxl, zipcodes, duckdb

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / 'public/data'
PHYS = ROOT.parent / 'physician-explorer'
random.seed(11)
R = 3958.8
FAC = json.load(open(APP / 'fa_fac.json'))
meta = json.load(open(APP / 'fa_meta.json')); CODES = [t[0] for t in meta['types']]; UNIT = {t[0]: t[2] for t in meta['types']}
app = {}
for f in glob.glob(str(APP / 'fa/*.json')):
    st = Path(f).stem
    for fips, v in json.load(open(f)).items(): v['st'] = st; app[fips] = v
tracts = {}
for f in glob.glob(str(PHYS / 'public/data/na/*.json')):
    for fips, v in json.load(open(f)).items():
        if v.get('t'): tracts[fips] = np.array(v['t'], dtype=float)
ZC = {z['zip_code']: (float(z['lat']), float(z['long'])) for z in zipcodes.list_all() if z.get('lat') and z.get('long')}

wb = openpyxl.load_workbook(PHYS / 'data/raw/na/hsd_2026.xlsx', read_only=True, data_only=True)
ws = wb['Facility Time & Distance']
h3 = [str(c).strip().zfill(3) if c is not None else None for c in next(ws.iter_rows(min_row=3, max_row=3, values_only=True))]
h4 = list(next(ws.iter_rows(min_row=4, max_row=4, values_only=True)))
dist = {}
for r in ws.iter_rows(min_row=5, values_only=True):
    if not r[3]: continue
    for i, code in enumerate(h3):
        if code in CODES and i + 1 < len(r) and str(h4[i + 1]).startswith('Dist') and r[i + 1] is not None: dist[(r[0], r[1], code)] = r[i + 1]

def hav(a, b, c, d):
    a, b, c, d = map(np.radians, (a, b, c, d))
    return 2 * R * np.arcsin(np.sqrt(np.sin((c - a) / 2) ** 2 + np.cos(a) * np.cos(c) * np.sin((d - b) / 2) ** 2))

fixed = ['36055', '39061', '48469', '17031', '06037', '30005', '48301']
sample = fixed + random.sample([f for f in app if f not in fixed], 18)
checked, mism = 0, []
for fips in sample:
    a = app[fips]; T = tracts[fips]
    for code in CODES:
        v = a['s'].get(code)
        if not v: continue
        dmax = dist.get((a['n'], a['st'], code))
        ids = [i for i, f in FAC.items() if code in f[8]]
        zz = np.array([ZC[FAC[i][4]] for i in ids])
        D = hav(T[:, 0][:, None], T[:, 1][:, None], zz[None, :, 0], zz[None, :, 1]) <= dmax + 1e-9
        cov = float((T[:, 2] * D.any(axis=1)).sum() / T[:, 2].sum())
        inr = [ids[j] for j in np.where(D.any(axis=0))[0]]
        n = sum(FAC[i][6] or 0 for i in inr) if UNIT[code] == 'beds' else len(inr)
        checked += 1
        if abs(cov - v[0]) > 0.005 or n != v[1] or dmax != v[3] or sorted(inr) != sorted(v[4]):
            mism.append((fips, a['n'], code, round(cov, 4), v[0], n, v[1], dmax, v[3]))
print('county-type results checked', checked, 'mismatches', len(mism)); [print(m) for m in mism[:20]]

# classification: Monroe County NY and Hamilton County OH hospitals and their types
for st, city_counties in (('NY', ('ROCHESTER',)), ('OH', ('CINCINNATI',))):
    print(st, [(f[0], f[8], f[6]) for f in FAC.values() if f[1] == 'hospital' and f[3] == st and (f[2] or '').upper() in city_counties])
# counts against the raw POS file
con = duckdb.connect()
asc = con.execute(f"""SELECT count(*) FROM read_csv('{ROOT}/data/raw/pos/POS_iQIES.DATA.Q3_2026.csv', all_varchar=true, header=true)
                     WHERE prvdr_type_id='11' AND coalesce(trim(pgm_trmntn_cd),'00')='00'""").fetchone()[0]
print('active ASCs in POS', asc, 'ASCs in app', sum(1 for f in FAC.values() if f[1] == 'asc'))
json.dump({'checked': checked, 'mismatches': mism}, open(ROOT / 'scripts/audit/fa_result.json', 'w'), default=str)
