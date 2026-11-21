"""National and state trend summary for the Overview page (public/data/overview.json).
Reads the files build_hospitals.py writes. Only usable (unflagged) reports count toward medians; combined margins and revenue use every report without a data problem."""
import json
from collections import defaultdict
from pathlib import Path
import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'public' / 'data'
meta = json.load(open(OUT / 'meta.json'))
H = json.load(open(OUT / 'hospitals.json'))

def med(v):
    v = [x for x in v if x is not None]
    return round(float(np.median(v)), 4) if v else None

def summarize(rows):
    # Medians from usable reports (flag 0); combined margin and revenue from every report without a data problem
    # (flag 1), with a file year covering more than 13.5 months scaled to 12, as in the system rollups
    ok = [r for r in rows if not r['flag']]; use = [r for r in rows if r['flag'] != 1]
    f = lambda r: 12 / r['mo'] if r.get('mo') and r['mo'] > 13.5 else 1
    S = lambda k: sum((r[k] or 0) * f(r) for r in use)
    tm = [r['tm'] for r in ok if r['tm'] is not None]
    rev = S('rev')
    return {'n': len(rows), 'clean': len(ok), 'tm': med(tm), 'pm': med([r['pm'] for r in ok]), 'dcoh': med([r['dcoh'] for r in ok]),
            'occ': med([r['occ'] for r in ok]), 'loss': round(sum(1 for v in tm if v < 0) / len(tm), 4) if tm else None,
            'agg_tm': round(S('ni') / rev, 4) if rev else None, 'npr': int(S('npr'))}

GROUPS = {'STH': lambda h: h['t'] == 'STH', 'CAH': lambda h: h['t'] == 'CAH', 'STH_rural': lambda h: h['t'] == 'STH' and h['ru'] == 'R',
          'STH_urban': lambda h: h['t'] == 'STH' and h['ru'] == 'U', 'STH_np': lambda h: h['t'] == 'STH' and h['g'] == 'np',
          'STH_fp': lambda h: h['t'] == 'STH' and h['g'] == 'fp', 'STH_gov': lambda h: h['t'] == 'STH' and h['g'] == 'gov',
          'acute': lambda h: h['t'] in ('STH', 'CAH')}
out = {'years': meta['years'], 'groups': {}, 'states': {}}
for y in meta['years']:
    Y = json.load(open(OUT / 'year' / f'{y}.json')); F = Y['fields']
    rows = [dict(zip(F, r)) for r in Y['rows']]
    for r in rows: r['h'] = H[r['i']]
    for g, f in GROUPS.items(): out['groups'].setdefault(g, {})[str(y)] = summarize([r for r in rows if f(r['h'])])
    if y in meta['years'][-2:]:
        by = defaultdict(list)
        for r in rows:
            if r['h']['t'] in ('STH', 'CAH') and r['h']['s']: by[r['h']['s']].append(r)
        out['states'][str(y)] = {s: summarize(L) for s, L in by.items()}
json.dump(out, open(OUT / 'overview.json', 'w'), separators=(',', ':'), allow_nan=False)
for g in ['STH', 'CAH']: print(g, {y: (v['tm'], v['loss'], v['dcoh']) for y, v in out['groups'][g].items()})
