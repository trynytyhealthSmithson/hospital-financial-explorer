"""Outpatient procedures from CMS Medicare Outpatient Hospitals by Provider and Service (data.cms.gov).

The file covers comprehensive APCs only: major outpatient procedures (surgery, device implants, endovascular,
endoscopy, radiation therapy) and comprehensive observation stays, for Original Medicare Part B patients at
hospitals paid under the outpatient PPS. Imaging, clinic and ED visits and drugs are not in it. Rows with fewer
than 11 beneficiaries are suppressed by CMS. 2016 covers only 35 APCs, so trends start in 2017.

Input: data/raw/outpatient/*Prov_Svc.csv (one per calendar year, DY in the file name)
Output: public/data/op/<ST>.json  {ccn: {y: [[line, services, payment, beneficiaries]...], apc: [[code, desc, line, svcs, pay, avg_chg]...]}}
        public/data/op_idx.json   {meta, lines, h: {ccn: {line: [services latest, payment latest, services 2019]}}}
"""
import json, re
from collections import defaultdict
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/outpatient'
OUT = ROOT / 'public/data/op'

LINES = [  # (key, label, pattern on the APC description)
    ('ortho', 'Orthopedic and spine', r'Musculoskeletal'),
    ('rhythm', 'Cardiac rhythm and devices', r'Electrophysiolog|Pacemaker|ICD|Wireless PA|Cardiac'),
    ('vasc', 'Vascular and endovascular', r'Vascular|Endovascular'),
    ('gi', 'GI and endoscopy', r'Upper GI|Lower GI|Complex GI|GI Procedures'),
    ('gensurg', 'General and breast surgery', r'Laparoscopy|Abdominal|Excision|Breast|Skin|Hernia'),
    ('uro', 'Urology', r'Urology'),
    ('eye', 'Eye', r'Intraocular|Extraocular|Eye'),
    ('ent', 'ENT and airway', r'ENT|Airway|Cochlear'),
    ('gyn', 'Gynecology', r'Gynecolog'),
    ('neuro', 'Nerve and neurostimulator', r'Nerve|Neurostimulator|Drug Infusion|Spinal'),
    ('rad', 'Radiation therapy', r'Radiation|Brachytherapy|Radiosurgery|Proton'),
    ('obs', 'Observation stays', r'Observation'),
]
def line_of(desc):
    for k, _, p in LINES:
        if re.search(p, desc or '', re.I): return k
    return 'other'

hosp = json.load(open(ROOT / 'public/data/hospitals.json'))
STATE = {h['c']: h['s'] for h in hosp}
files = {}
for f in RAW.glob('*Prov_Svc.csv'):
    m = re.search(r'_D[Y]?(\d\d)_Prov', f.name)
    if m: files[2000 + int(m.group(1))] = f
YEARS = sorted(files)
per = defaultdict(dict)
apc_latest = {}
nat = {}
for y in YEARS:
    d = pd.read_csv(files[y], dtype=str, encoding='latin-1')
    d['ccn'] = d.Rndrng_Prvdr_CCN.str.strip().str.zfill(6)
    d['s'] = pd.to_numeric(d.CAPC_Srvcs, errors='coerce')
    d['b'] = pd.to_numeric(d.Bene_Cnt, errors='coerce')
    d['p'] = d.s * pd.to_numeric(d.Avg_Mdcr_Pymt_Amt, errors='coerce')
    d['c'] = pd.to_numeric(d.Avg_Tot_Sbmtd_Chrgs, errors='coerce')
    d = d[d.s.notna()]
    d['line'] = d.APC_Desc.map(line_of)
    nat[y] = {'svcs': int(d.s.sum()), 'pay': round(float(d.p.sum())), 'n_apc': int(d.APC_Cd.nunique()), 'n_hosp': int(d.ccn.nunique())}
    g = d.groupby(['ccn', 'line'])[['s', 'p', 'b']].sum()
    for (c, l), r in g.iterrows():
        per[c].setdefault(str(y), []).append([l, int(r.s), round(float(r.p)), int(r.b)])
    if y == YEARS[-1]:
        for c, gg in d.groupby('ccn'):
            apc_latest[c] = [[r.APC_Cd, r.APC_Desc, r.line, int(r.s), round(float(r.p)), round(float(r.c)) if pd.notna(r.c) else None]
                             for r in gg.sort_values('p', ascending=False).itertuples()]
    print(y, nat[y], flush=True)

# National totals by line for context
OUT.mkdir(parents=True, exist_ok=True)
by_state = defaultdict(dict)
idx = {}
Ly = str(YEARS[-1])
for c, v in per.items():
    st = STATE.get(c)
    if not st: continue  # hospital not in the cost report files
    for y in v: v[y].sort(key=lambda r: -r[2])
    o = dict(v)
    if c in apc_latest: o['apc'] = apc_latest[c]
    by_state[st][c] = o
    if Ly in v:
        base = {r[0]: r[1] for r in v.get('2019', [])}
        idx[c] = {r[0]: [r[1], r[2], base.get(r[0])] for r in v[Ly]}
for st, d in by_state.items():
    json.dump(d, open(OUT / f'{st}.json', 'w'), separators=(',', ':'), allow_nan=False)
meta = {'years': YEARS, 'trend_from': 2017, 'latest': YEARS[-1], 'nat': nat,
        'source': 'CMS Medicare Outpatient Hospitals by Provider and Service (comprehensive APCs), data.cms.gov'}
json.dump({'meta': meta, 'lines': [[k, l] for k, l, _ in LINES] + [['other', 'Other procedures']], 'h': idx},
          open(ROOT / 'public/data/op_idx.json', 'w'), separators=(',', ':'), allow_nan=False)
print('hospitals', len(idx), 'unmatched', len([c for c in per if c not in STATE]), 'idx KB', (ROOT / 'public/data/op_idx.json').stat().st_size // 1024,
      'state KB', sum(f.stat().st_size for f in OUT.glob('*.json')) // 1024)
print('UC', idx.get('360003'))
