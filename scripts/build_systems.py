"""Health systems from the AHRQ Compendium of U.S. Health Systems, 2023 (hospital linkage file).

Hospitals are grouped by their corporate parent (the operating parent organization from the linkage file),
named with the AHRQ health system name most of the parent's hospitals carry. Only parents with two or more
hospitals count as systems. Writes:
  systems.json   {id: {n: name, ci, s (HQ city, state), h: [ccn...], st: [states], y: {year: rollup}}}
  hospitals.json  adds 'sy' (system id) to each hospital, in place
Run after build_hospitals.py and before build_markets.py / build_overview.py.
"""
import json, re
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]; OUT = ROOT / 'public' / 'data'
d = pd.read_csv(ROOT / 'data/raw/systems/chsp-hospital-linkage-2023.csv', dtype=str, encoding='latin-1')
d['ccn'] = d.ccn.str.strip().str.zfill(6)
d = d.drop_duplicates('ccn')
H = json.load(open(OUT / 'hospitals.json')); idx = {h['c']: i for i, h in enumerate(H)}
meta = json.load(open(OUT / 'meta.json'))

def nice(s):
    if not isinstance(s, str): return None
    s = s.title()
    for w in ['Inc', 'Llc', 'Of', 'And', 'The']: s = re.sub(rf'\b{w}\b', w.lower() if w in ('Of', 'And', 'The') else w.upper() if w == 'Llc' else w, s)
    return re.sub(r'\b(Hca|Uc|Ucla|Ucsf|Nyu|Ssm|Upmc|Osf|Ohsu|Uab|Musc|Unc|Vcu|Usa|Chi|Lcmc|Bjc|Hsc)\b', lambda m: m.group(0).upper(), s[0].upper() + s[1:])

sysd = {}
for pid, g in d.dropna(subset=['corp_parent_id']).groupby('corp_parent_id'):
    ccns = [c for c in g.ccn if c in idx]
    if len(g) < 2 or not ccns: continue
    ahrq = Counter(n for n in g.health_sys_name.dropna())
    name = ahrq.most_common(1)[0][0] if ahrq and ahrq.most_common(1)[0][1] >= len(g) / 2 else nice(g.corp_parent_name.iloc[0])
    hq = g.dropna(subset=['health_sys_city']).health_sys_city.mode()
    hqs = g.dropna(subset=['health_sys_state']).health_sys_state.mode()
    sysd['S' + pid] = {'n': name, 'ci': hq.iloc[0] if len(hq) else None, 's': hqs.iloc[0] if len(hqs) else None, 'h': sorted(ccns),
                       'st': sorted({H[idx[c]]['s'] for c in ccns if H[idx[c]]['s']}), 'type': g.corp_parent_type.iloc[0].title() if isinstance(g.corp_parent_type.iloc[0], str) else None}
for h in H: h.pop('sy', None)
for sid, s in sysd.items():
    for c in s['h']: H[idx[c]]['sy'] = sid

# Yearly rollups (same rules as the app: usable reports only for margins and medians)
def rollup(rows):
    ok = [r for r in rows if not r['flag']]
    rev = sum(r['rev'] or 0 for r in ok); npr = sum(r['npr'] or 0 for r in ok)
    tms = [r['tm'] for r in ok if r['tm'] is not None]
    return {'n': len(rows), 'beds': int(sum(r['beds'] or 0 for r in rows)), 'npr': int(sum(r['npr'] or 0 for r in rows)),
            'ni': int(sum(r['ni'] or 0 for r in ok)), 'tm': round(sum(r['ni'] or 0 for r in ok) / rev, 4) if rev else None,
            'pm': round(sum(r['nisp'] or 0 for r in ok) / npr, 4) if npr else None, 'tm_med': round(float(np.median(tms)), 4) if tms else None,
            'dis': int(sum(r['dis'] or 0 for r in rows))}
for y in meta['years']:
    Y = json.load(open(OUT / 'year' / f'{y}.json')); F = Y['fields']; by = defaultdict(list)
    for row in Y['rows']:
        r = dict(zip(F, row)); sid = H[r['i']].get('sy')
        if sid: by[sid].append(r)
    for sid, L in by.items(): sysd[sid].setdefault('y', {})[str(y)] = rollup(L)
json.dump(H, open(OUT / 'hospitals.json', 'w'), separators=(',', ':'), allow_nan=False)
json.dump(sysd, open(OUT / 'systems.json', 'w'), separators=(',', ':'), allow_nan=False)
big = sorted(sysd.items(), key=lambda kv: -len(kv[1]['h']))[:8]
print('systems', len(sysd), 'hospitals in a system', sum(len(s['h']) for s in sysd.values()), 'of', len(H))
for sid, s in big: print(' ', s['n'], len(s['h']), s['st'][:6])
print('TriHealth check', [(s['n'], s['h']) for s in sysd.values() if '360134' in s['h']])
print((OUT / 'systems.json').stat().st_size // 1024, 'KB')
