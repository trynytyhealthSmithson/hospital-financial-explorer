"""Independent check of the Hospital Financial Explorer against the raw HCRIS cost report files (form 2552-10).

The app is built from the CMS Hospital Provider Cost Report PUF. This script re-reads the same reports from the
raw HCRIS worksheets, matched by CCN and fiscal year end, and compares the core figures for a random sample of
single-report hospital years plus named hospitals. Usage: python3 scripts/audit/audit_hcris.py
"""
import json, glob, random
from collections import defaultdict, Counter
from pathlib import Path
import duckdb

ROOT = Path(__file__).resolve().parents[2]
PQ = ROOT / 'data/raw/hcris/pq'
APP = ROOT / 'public/data'
random.seed(1112)

# Worksheet cells (2552-10): worksheet, line, column
CELLS = {
    'npr': ('G300000', '00300', '00100'), 'opex': ('G300000', '00400', '00100'), 'nisp': ('G300000', '00500', '00100'),
    'oth': ('G300000', '02500', '00100'), 'ni': ('G300000', '02900', '00100'), 'gpr': ('G300000', '00100', '00100'),
    'cash': ('G000000', '00100', '00100'), 'ca': ('G000000', '01100', '00100'), 'ta': ('G000000', '03600', '00100'),
    'cl_': ('G000000', '04500', '00100'), 'tl': ('G000000', '05100', '00100'), 'fb': ('G000000', '05900', '00100'),
    'beds': ('S300001', '01400', '00200'), 'dis': ('S300001', '01400', '01500'),
}

con = duckdb.connect(); con.execute('SET enable_progress_bar=false')
rpt = con.execute(f"""SELECT CAST(column00 AS BIGINT) rpt, column02 ccn, strptime(column05, '%m/%d/%Y')::DATE b, strptime(column06, '%m/%d/%Y')::DATE e, column04 status
                      FROM read_parquet('{PQ}/rpt_*.parquet')""").df()
# latest report record per CCN and period end (amended or reopened reports replace earlier ones)
rpt = rpt.sort_values('rpt').groupby(['ccn', 'e']).tail(1)
key = {(r.ccn, str(r.e)[:10]): r.rpt for r in rpt.itertuples()}

app = {}
for f in glob.glob(str(APP / 'hosp/*.json')):
    for ccn, h in json.load(open(f)).items():
        for y, v in h['years'].items(): app[(ccn, y)] = v

named = ['330125', '330285', '330164', '360163', '140281', '450023', '140208', '360003']   # Rochester General, Strong, Highland, The Christ Hospital, Northwestern Memorial, Citizens Medical Center (Victoria TX), Advocate Christ
pool = [k for k, v in app.items() if v['n_rep'] == 1 and k[1] in ('2022', '2023', '2024')]
sample = [k for k in pool if k[0] in named] + random.sample(pool, 400)
ids = {}
for k in sample:
    r = key.get((k[0], app[k]['end']))
    if r: ids[r] = k
vals = defaultdict(dict)
cells = ' OR '.join(f"(ws='{w}' AND line='{l}' AND col='{c}')" for w, l, c in CELLS.values())
inv = {v: k for k, v in CELLS.items()}
rl = ','.join(str(r) for r in ids)
for r, w, l, c, v in con.execute(f"SELECT rpt, ws, line, col, v FROM read_parquet('{PQ}/nmrc_*.parquet') WHERE rpt IN ({rl}) AND ({cells})").fetchall():
    vals[r][inv[(w, l, c)]] = v

checked, diffs, nomatch = Counter(), defaultdict(list), [k for k in sample if not key.get((k[0], app[k]['end']))]
for r, k in ids.items():
    a = app[k]
    for f in CELLS:
        av, hv = a.get(f), vals[r].get(f)
        if av is None and hv is None: continue
        checked[f] += 1
        if av is None or hv is None or abs(av - hv) > max(1.0, 0.0005 * abs(hv)):
            diffs[f].append((k[0], k[1], av, hv))
out = {'hospital_years_checked': len(ids), 'no_hcris_match': len(nomatch), 'fields_checked': dict(checked),
       'differences': {f: (len(v), v[:8]) for f, v in diffs.items()}}
# derived ratios: recompute from the stored detail
bad = 0
for k in sample:
    a = app[k]; m = a['m']
    if a['npr'] and a['nisp'] is not None and m.get('pm') is not None and abs(m['pm'] - a['nisp'] / a['npr']) > 0.0002: bad += 1
out['operating_margin_recompute_mismatch'] = bad
print(json.dumps(out, indent=1, default=str))
json.dump(out, open(ROOT / 'scripts/audit/hcris_result.json', 'w'), indent=1, default=str)
