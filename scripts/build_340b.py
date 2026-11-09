"""340B Drug Pricing Program participation from HRSA OPAIS (Covered Entity Daily Export, JSON).

Hospital entity types: DSH (disproportionate share), CAH (critical access), SCH (sole community), RRC (rural referral),
PED (children's), CAN (free-standing cancer). A hospital's parent registration carries its CMS certification number;
child sites (off-site outpatient locations) and contract pharmacies hang off it.

Input: data/raw/340b/OPA_CE_DAILY_PUBLIC.JSON (unzipped from 340B_CoveredEntityJson_Daily_<date>.zip, 340bopais.hrsa.gov/Reports)
Output: public/data/340b.json {meta, h: {ccn: [type, start (YYYY-MM-DD), participating 1/0, active child sites,
        active contract pharmacies, contract pharmacies out of state, termination date, termination reason, 340B id]}}
"""
import json
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data/raw/340b/OPA_CE_DAILY_PUBLIC.JSON'
TYPES = {'DSH': 'Disproportionate share hospital', 'CAH': 'Critical access hospital', 'SCH': 'Sole community hospital',
         'RRC': 'Rural referral center', 'PED': "Children's hospital", 'CAN': 'Free-standing cancer hospital'}
today = date.today().isoformat()
L = json.load(open(SRC))['coveredEntities']
H = {h['c'] for h in json.load(open(ROOT / 'public/data/hospitals.json'))}

def active(start, end):
    return (start or '')[:10] <= today and (not end or end[:10] >= today)

parents = defaultdict(list); children = defaultdict(list)
for e in L:
    if e['entityType'] not in TYPES: continue
    ccn = (e.get('cmsCertificationNumber') or '').strip().zfill(6)
    if e.get('parentId340B'): children[e['parentId340B']].append(e)
    elif ccn.strip('0'): parents[ccn].append(e)

out = {}
for ccn, ps in parents.items():
    # Prefer a participating registration, then the most recent one
    ps.sort(key=lambda e: (e['participating'] == 'TRUE', e.get('participatingStartDate') or ''), reverse=True)
    p = ps[0]
    on = p['participating'] == 'TRUE'
    kids = [k for k in children.get(p['id340B'], []) if k['participating'] == 'TRUE']
    st = (p.get('streetAddress') or {}).get('state')
    cps = {}
    for e in [p] + kids:
        for c in e.get('contractPharmacies', []):
            if active(c.get('beginDate'), c.get('terminationDate')): cps[c['pharmacyId']] = (c.get('address') or {}).get('state')
    out[ccn] = [p['entityType'], (p.get('participatingStartDate') or '')[:10], 1 if on else 0, len(kids) if on else 0,
                len(cps) if on else 0, sum(1 for s in cps.values() if s and s != st) if on else 0,
                (p.get('terminationDate') or '')[:10] or None, p.get('terminationReason'), p['id340B']]

inapp = {c: v for c, v in out.items() if c in H}
on = [v for v in inapp.values() if v[2]]
meta = {'source': 'HRSA Office of Pharmacy Affairs Information System, Covered Entity Daily Export', 'as_of': '2026-11-09', 'types': TYPES,
        'n_participating': len(on), 'n_hospitals': len(H), 'by_type': dict(Counter(v[0] for v in on)),
        'cp_median': sorted(v[4] for v in on)[len(on) // 2] if on else None,
        'cp_pct': [sorted(v[4] for v in on)[min(len(on) - 1, int(len(on) * p / 100))] for p in range(0, 101, 5)] if on else None}
json.dump({'meta': meta, 'h': inapp}, open(ROOT / 'public/data/340b.json', 'w'), separators=(',', ':'), allow_nan=False)
print(meta['n_participating'], 'participating of', len(H), meta['by_type'], 'cp median', meta['cp_median'], 'p95', meta['cp_pct'][19],
      'registrations not in app', len(set(out) - H), (ROOT / 'public/data/340b.json').stat().st_size // 1024, 'KB')
for c in ['360003', '360134', '360180', '010001']: print(c, inapp.get(c))
