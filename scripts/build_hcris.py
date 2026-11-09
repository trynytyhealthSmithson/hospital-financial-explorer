"""Detail from the full CMS HCRIS hospital cost report files (form 2552-10).

Adds what the cost report PUF leaves out:
  * Payer mix with Medicare Advantage and Medicaid managed care days (Worksheet S-3 Part I)
  * Department cost and charges (Worksheet C Part I, labels from Worksheet A)
  * Medicare add-on payments: IME (fee-for-service and Medicare Advantage), DSH, uncompensated care,
    outliers (Worksheet E Part A) and direct GME (Worksheet E-4)
  * Home office (chain) from Worksheet S-2 Part I, and report status from the report file

Input: data/raw/hcris/HOSP10_<fy>_{rpt,nmrc,alpha}.csv from downloads.cms.gov/files/hcris/HOSP10FY<fy>.zip
       (converted once to Parquet in data/raw/hcris/pq). Needs: pip install duckdb
Output: public/data/hcris/<ST>.json  per-hospital detail by year
        public/data/hcris_idx.json    compact shares for maps and the screener, home offices
Run after build_hospitals.py (uses hospitals.json for state and the list of hospitals).
"""
import json
from collections import defaultdict
from pathlib import Path

import duckdb
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/hcris'
PQ = RAW / 'pq'
OUT = ROOT / 'public/data/hcris'
YEARS = list(range(2016, 2025))  # matches the cost report years in the app
STATUS = {'1': 'As submitted', '2': 'Settled without audit', '3': 'Settled with audit', '4': 'Reopened', '5': 'Amended'}

con = duckdb.connect()
con.execute('SET enable_progress_bar=false')
PQ.mkdir(parents=True, exist_ok=True)
for y in YEARS:
    p = RAW / f'HOSP10_{y}'
    if not (PQ / f'nmrc_{y}.parquet').exists():
        con.execute(f"COPY (SELECT * FROM read_csv('{p}_nmrc.csv', header=false, columns={{'rpt':'BIGINT','ws':'VARCHAR','line':'VARCHAR','col':'VARCHAR','v':'DOUBLE'}})) TO '{PQ}/nmrc_{y}.parquet'")
        con.execute(f"COPY (SELECT * FROM read_csv('{p}_alpha.csv', header=false, columns={{'rpt':'BIGINT','ws':'VARCHAR','line':'VARCHAR','col':'VARCHAR','v':'VARCHAR'}})) TO '{PQ}/alpha_{y}.parquet'")
        con.execute(f"COPY (SELECT * FROM read_csv('{p}_rpt.csv', header=false, all_varchar=true)) TO '{PQ}/rpt_{y}.parquet'")

hosp = json.load(open(ROOT / 'public/data/hospitals.json'))
STATE = {h['c']: h['s'] for h in hosp}

# Department families by the standard 2552-10 line number (first three digits; subscripts stay with their parent line)
def family(line):
    n = int(line[:3])
    if n == 30: return 'Routine inpatient'
    if 31 <= n <= 35: return 'Intensive care'
    if 40 <= n <= 42: return 'Psych and rehab units'
    if n == 43: return 'Nursery'
    if 44 <= n <= 46: return 'Skilled nursing and long-term care'
    if n in (50, 51, 53): return 'Surgery and anesthesia'
    if n == 52: return 'Labor and delivery'
    if 54 <= n <= 58: return 'Imaging and radiation therapy'
    if n in (59, 69, 70): return 'Cardiology and neuro diagnostics'
    if 60 <= n <= 63: return 'Lab and blood'
    if n in (64, 73): return 'Drugs and infusion'
    if 65 <= n <= 68: return 'Respiratory and rehab therapy'
    if n in (71, 72): return 'Supplies and implants'
    if n == 74: return 'Dialysis'
    if n == 75: return 'Ambulatory surgery'
    if 88 <= n <= 90: return 'Clinics'
    if n == 91: return 'Emergency'
    if n == 92: return 'Observation'
    if n == 95: return 'Ambulance'
    if 105 <= n <= 112: return 'Organ acquisition'
    if n == 101: return 'Home health'
    return 'Other'

S3 = {  # (line, col) -> key; days then discharges
    ('01400', '00600'): 'mcr', ('00200', '00600'): 'ma', ('01400', '00700'): 'mcd', ('00200', '00700'): 'mcdmc', ('01400', '00800'): 'tot',
    ('01400', '01300'): 'mcr_d', ('00200', '01300'): 'ma_d', ('01400', '01400'): 'mcd_d', ('00200', '01400'): 'mcdmc_d', ('01400', '01500'): 'tot_d'}
EA = {'00101': 'drg', '00102': 'drg', '00100': 'drg', '00200': 'out', '00201': 'out', '00203': 'out', '00204': 'out',
      '02900': 'ime', '02901': 'ime_ma', '03400': 'dsh', '03600': 'ucp'}

idx = {'years': {}, 'ho': {}, 'hos': {}}
per_state = defaultdict(lambda: defaultdict(dict))
for y in YEARS:
    rpt = con.execute(f"SELECT column00::BIGINT rpt, lpad(trim(column02),6,'0') ccn, column04 st, strptime(column05,'%m/%d/%Y') b, strptime(column06,'%m/%d/%Y') e, column07 proc FROM '{PQ}/rpt_{y}.parquet'").df()
    rpt = rpt[rpt.ccn.isin(STATE)]
    rpt['months'] = ((rpt.e - rpt.b).dt.days + 1) / 30.4375
    keep = []  # same rule as build_hospitals: two full-year reports keep the latest; short periods are summed
    for ccn, g in rpt.sort_values('e').groupby('ccn'):
        if len(g) > 1 and g.months.sum() > 13.5:
            g = g[g.e > g.e.iloc[-1] - pd.Timedelta(days=380)]
            while len(g) > 1 and g.months.sum() > 13.5: g = g.iloc[1:]
        keep.append(g)
    rpt = pd.concat(keep)
    con.register('k', rpt[['rpt', 'ccn']])
    last = rpt.sort_values('e').groupby('ccn').tail(1).set_index('ccn')

    s3 = con.execute(f"SELECT k.ccn, n.line, n.col, sum(n.v) v FROM '{PQ}/nmrc_{y}.parquet' n JOIN k USING(rpt) WHERE n.ws='S300001' AND n.line IN ('00200','01400') GROUP BY 1,2,3").df()
    ea = con.execute(f"SELECT k.ccn, n.line, sum(n.v) v FROM '{PQ}/nmrc_{y}.parquet' n JOIN k USING(rpt) WHERE n.ws='E00A18A' AND n.col IN ('00100','00101','00102') AND n.line IN ({','.join(repr(l) for l in EA)}) GROUP BY 1,2").df()
    gme = con.execute(f"SELECT k.ccn, sum(n.v) v FROM '{PQ}/nmrc_{y}.parquet' n JOIN k USING(rpt) WHERE n.ws='E40A180' AND n.line='04800' AND n.col='00100' GROUP BY 1").df()
    # Medicare fee-for-service inpatient: cost (D-1 Part II line 49) and PPS payments (E Part A line 47 operating, line 50 capital)
    mm = con.execute(f"""SELECT k.ccn, sum(CASE WHEN n.ws='D10A181' AND n.line='04900' AND n.col='00100' THEN n.v END) cost,
                         sum(CASE WHEN n.ws='E00A18A' AND n.line='04700' AND n.col IN ('00100','00101','00102') THEN n.v END) op,
                         sum(CASE WHEN n.ws='E00A18A' AND n.line='05000' AND n.col IN ('00100','00101','00102') THEN n.v END) cap
                         FROM '{PQ}/nmrc_{y}.parquet' n JOIN k USING(rpt) WHERE n.ws IN ('D10A181','E00A18A') GROUP BY 1""").df().set_index('ccn')
    # Balance sheet detail (Worksheet G, general fund): accumulated depreciation, depreciable assets, debt, fund balance
    gl = con.execute(f"""SELECT k.ccn, n.line, sum(n.v) v FROM '{PQ}/nmrc_{y}.parquet' n JOIN k USING(rpt)
                         WHERE n.ws='G000000' AND n.col='00100' AND n.line IN ('01300','01400','01500','01600','01700','01800','01900','02000','02100','02200','02300','02400','02500','02600','02700','02800','04600','04700','04800','05000','05900')
                         GROUP BY 1,2""").df()
    c = con.execute(f"""SELECT k.ccn, n.line, sum(CASE WHEN n.col='00100' THEN n.v END) cost, sum(CASE WHEN n.col='00600' THEN n.v END) ipc,
                         sum(CASE WHEN n.col='00700' THEN n.v END) opc FROM '{PQ}/nmrc_{y}.parquet' n JOIN k USING(rpt)
                         WHERE n.ws='C000001' AND n.line < '20000' GROUP BY 1,2""").df()
    lbl = con.execute(f"""SELECT k.ccn, a.line, any_value(a.v) v FROM '{PQ}/alpha_{y}.parquet' a JOIN k USING(rpt)
                          WHERE a.ws='A000000' AND a.col='00000' GROUP BY 1,2""").df()
    ho = con.execute(f"""SELECT k.ccn, a.line, a.col, a.v FROM '{PQ}/alpha_{y}.parquet' a JOIN k USING(rpt)
                         WHERE a.ws='S200001' AND a.line IN ('14000','14100','14300')""").df()

    rec = defaultdict(dict)
    for r in s3.itertuples():
        k = S3.get((r.line, r.col))
        if k: rec[r.ccn][k] = r.v
    add = defaultdict(lambda: defaultdict(float))
    for r in ea.itertuples(): add[r.ccn][EA[r.line]] += r.v
    for r in gme.itertuples(): add[r.ccn]['dgme'] += r.v
    labels = {(r.ccn, r.line): r.v[5:].strip().title() for r in lbl.itertuples() if isinstance(r.v, str)}
    dept = defaultdict(list)
    for r in c.itertuples():
        cost = None if r.line[:3] == '092' else r.cost  # observation cost is already in routine inpatient (line 201 removes it)
        vals = [None if v is None or pd.isna(v) else round(float(v)) for v in (cost, r.ipc, r.opc)]
        if any(vals): dept[r.ccn].append([r.line, labels.get((r.ccn, r.line), ''), family(r.line)] + vals)
    hoinfo = defaultdict(dict)
    for r in ho.itertuples(): hoinfo[r.ccn][(r.line, r.col)] = (r.v or '').strip()

    G = defaultdict(dict)
    for r in gl.itertuples(): G[r.ccn][r.line] = r.v
    yi = {}
    for ccn in rpt.ccn.unique():
        p = rec.get(ccn, {})
        o = {}
        days = [p.get(k) for k in ('mcr', 'ma', 'mcd', 'mcdmc', 'tot')]
        dis = [p.get(k) for k in ('mcr_d', 'ma_d', 'mcd_d', 'mcdmc_d', 'tot_d')]
        if days[4]: o['pd'] = [None if v is None else round(v) for v in days]
        if dis[4]: o['pc'] = [None if v is None else round(v) for v in dis]
        a = {k: round(v) for k, v in add.get(ccn, {}).items() if v}
        if a: o['a'] = a
        if dept.get(ccn):
            fam = defaultdict(lambda: [0, 0, 0])
            for row in dept[ccn]:
                for i in range(3): fam[row[2]][i] += row[3 + i] or 0
            o['f'] = sorted([[k] + v for k, v in fam.items()], key=lambda r: -(r[1] or 0))
            if y == YEARS[-1]: o['dl'] = sorted(dept[ccn], key=lambda r: -(r[3] or 0))
        # Maryland hospitals are paid under the state's all-payer model, not the inpatient PPS, so they get no PPS margin
        if ccn in mm.index and add.get(ccn, {}).get('drg') and not ccn.startswith('21'):
            r = mm.loc[ccn]
            if pd.notna(r.cost) and r.cost > 0 and pd.notna(r.op) and r.op > 0:
                o['mm'] = [round(r.op), round(r.cap) if pd.notna(r.cap) else 0, round(r.cost)]
        g = G.get(ccn)
        if g:
            acc = -sum(g.get(l, 0) for l in ('01400', '01600', '01800', '02000', '02200', '02400', '02600', '02800'))
            gross = sum(g.get(l, 0) for l in ('01300', '01500', '01700', '01900', '02100', '02300', '02500', '02700'))
            o['bs'] = [round(acc), round(gross)] + [round(g[l]) if l in g else None for l in ('04600', '04700', '04800', '05000', '05900')]
        L = last.loc[ccn]
        o['st'] = STATUS.get(str(L.st), str(L.st)); o['proc'] = L.proc; o['n_rep'] = int((rpt.ccn == ccn).sum())
        hi = hoinfo.get(ccn, {})
        if hi.get(('14000', '00100')) == 'Y' and hi.get(('14000', '00200')):
            hid = hi[('14000', '00200')].upper()
            o['ho'] = hid
            idx['ho'][ccn] = hid  # later years overwrite earlier ones
            idx['hos'][hid] = [hi.get(('14100', '00100'), ''), hi.get(('14300', '00100'), ''), hi.get(('14300', '00200'), '')]
        per_state[STATE[ccn]][ccn][y] = o
        # Compact shares: all Medicare (FFS + MA), MA, all Medicaid (FFS + managed care), Medicaid managed care, MA share of Medicare
        tot = days[4]
        if tot and tot > 0:
            sh = lambda v: None if v is None else round(v / tot, 4)
            mall = (days[0] or 0) + (days[1] or 0); dall = (days[2] or 0) + (days[3] or 0)
            yi[ccn] = [sh(mall), sh(days[1] or 0), sh(dall), sh(days[3] or 0), round((days[1] or 0) / mall, 4) if mall else None,
                       round(sum(a.get(k, 0) for k in ('out', 'ime', 'ime_ma', 'dsh', 'ucp', 'dgme'))) or None,
                       round((o['mm'][0] + o['mm'][1] - o['mm'][2]) / (o['mm'][0] + o['mm'][1]), 4) if 'mm' in o else None]
    idx['years'][y] = yi
    print(y, 'reports', len(rpt), 'hospitals', rpt.ccn.nunique(), 'with payer mix', len(yi), flush=True)

OUT.mkdir(parents=True, exist_ok=True)
for st, d in per_state.items():
    json.dump(d, open(OUT / f'{st}.json', 'w'), separators=(',', ':'), allow_nan=False)
# Pooled share of Medicare days that are Medicare Advantage, among hospitals that report any MA days
ma_pen = {}
for y in YEARS:
    m = a = 0
    for v in per_state.values():
        for o in v.values():
            p = o.get(y, {}).get('pd')
            if p and p[1]: m += p[0] or 0; a += p[1]
    ma_pen[y] = round(a / (a + m), 4) if a + m else None
mm_agg = {}
for y in YEARS:
    p = c_ = 0
    for v in per_state.values():
        for o in v.values():
            m = o.get(y, {}).get('mm')
            if m and abs((m[0] + m[1] - m[2]) / (m[0] + m[1])) <= 1: p += m[0] + m[1]; c_ += m[2]
    mm_agg[y] = round((p - c_) / p, 4) if p else None
idx['meta'] = {'ma_pen': ma_pen, 'mm_margin': mm_agg, 'years': YEARS, 'source': 'CMS HCRIS hospital cost report files (form 2552-10), October 2026 refresh',
               'status': STATUS, 'n_home_offices': len(idx['hos'])}
json.dump(idx, open(ROOT / 'public/data/hcris_idx.json', 'w'), separators=(',', ':'), allow_nan=False)
print('idx KB', (ROOT / 'public/data/hcris_idx.json').stat().st_size // 1024, 'states', len(per_state),
      'state KB total', sum(f.stat().st_size for f in OUT.glob('*.json')) // 1024)
