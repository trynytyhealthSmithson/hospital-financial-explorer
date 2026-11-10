"""Ownership changes (CMS Hospital Change of Ownership) and rural closures and conversions (UNC Sheps Center).

CHOW: each row is a buyer and seller enrollment with CCNs, organization names, type and effective date.
  Change of ownership: the hospital keeps its CCN under a new owner. Acquisition/merger: the seller's CCN is
  absorbed into the buyer's.
Sheps: rural hospitals that stopped inpatient care since 2005 (complete closures and converted closures, including
  Rural Emergency Hospital conversions). The list has hospital name and state only, so it is matched by normalized
  name within the state, keeping unique matches.

Input: data/raw/ownership/Hospital_CHOW_<date>.csv (data.cms.gov), data/raw/ownership/Sheps_rural_hospital_closures_<date>.csv
       (table from shepscenter.unc.edu/programs-projects/rural-health/rural-hospital-closures)
Output: public/data/ownership.json {meta, chow: {ccn: [[date, kind, other_org, other_ccn, owner_org, prior_org]...]},
        closed: {ccn: [year, payment_type, services_remaining, sheps_name, beds]}}
"""
import json, re, sys
from collections import defaultdict
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
RAW = ROOT / 'data/raw/ownership'
H = json.load(open(ROOT / 'public/data/hospitals.json'))
IDX = {h['c']: h for h in H}

# --- changes of ownership
f = sorted(RAW.glob('Hospital_CHOW_*.csv'))[-1]
d = pd.read_csv(f, dtype=str, encoding='latin-1')
d['eff'] = pd.to_datetime(d['EFFECTIVE DATE'], errors='coerce').dt.strftime('%Y-%m-%d')
nm = lambda r, s: (r[f'DOING BUSINESS AS NAME - {s}'] if isinstance(r[f'DOING BUSINESS AS NAME - {s}'], str) and r[f'DOING BUSINESS AS NAME - {s}'].strip() else r[f'ORGANIZATION NAME - {s}'])
chow = defaultdict(list)
for _, r in d.iterrows():
    b, s = r['CCN - BUYER'], r['CCN - SELLER']
    if r['CHOW TYPE TEXT'].startswith('CHANGE') or b == s:
        if b in IDX: chow[b].append([r['eff'], 'new_owner', None, None, r['ORGANIZATION NAME - BUYER'], r['ORGANIZATION NAME - SELLER']])
    else:
        if b in IDX: chow[b].append([r['eff'], 'absorbed', nm(r, 'SELLER'), s, r['ORGANIZATION NAME - BUYER'], None])
        if s in IDX: chow[s].append([r['eff'], 'merged_into', nm(r, 'BUYER'), b, r['ORGANIZATION NAME - BUYER'], r['ORGANIZATION NAME - SELLER']])
for v in chow.values():
    for e in v:
        for i, x in enumerate(e):
            if not isinstance(x, str): e[i] = None
for v in chow.values(): v.sort(key=lambda e: e[0] or '', reverse=True)
chow_dates = d['eff'].dropna()

# --- closures and conversions, matched by name within the state
from build_aco import norm  # noqa: E402  (same normalization as the ACO match)
STATES = {'Alabama': 'AL', 'Alaska': 'AK', 'Arizona': 'AZ', 'Arkansas': 'AR', 'California': 'CA', 'Colorado': 'CO', 'Connecticut': 'CT', 'Delaware': 'DE',
          'Florida': 'FL', 'Georgia': 'GA', 'Hawaii': 'HI', 'Idaho': 'ID', 'Illinois': 'IL', 'Indiana': 'IN', 'Iowa': 'IA', 'Kansas': 'KS', 'Kentucky': 'KY',
          'Louisiana': 'LA', 'Maine': 'ME', 'Maryland': 'MD', 'Massachusetts': 'MA', 'Michigan': 'MI', 'Minnesota': 'MN', 'Mississippi': 'MS', 'Missouri': 'MO',
          'Montana': 'MT', 'Nebraska': 'NE', 'Nevada': 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY',
          'North Carolina': 'NC', 'North Dakota': 'ND', 'Ohio': 'OH', 'Oklahoma': 'OK', 'Oregon': 'OR', 'Pennsylvania': 'PA', 'Rhode Island': 'RI',
          'South Carolina': 'SC', 'South Dakota': 'SD', 'Tennessee': 'TN', 'Texas': 'TX', 'Utah': 'UT', 'Vermont': 'VT', 'Virginia': 'VA', 'Washington': 'WA',
          'West Virginia': 'WV', 'Wisconsin': 'WI', 'Wyoming': 'WY'}
s = pd.read_csv(sorted(RAW.glob('Sheps_*.csv'))[-1], dtype=str)
import build_aco  # names per hospital built there (cost report, AHRQ, 340B)
by = defaultdict(set)
for c, ns in build_aco.names.items():
    if c in IDX:
        for n in ns:
            if n: by[(IDX[c]['s'], n)].add(c)
closed = {}; unmatched = []; fuzzy = []
from difflib import SequenceMatcher
GENERIC = r'\b(HOSPITAL|HOSPITALS|MEDICAL|CENTER|CENTERS|REGIONAL|COMMUNITY|HEALTH|HEALTHCARE|MEMORIAL|SYSTEM|COUNTY|GENERAL|DISTRICT|CARE|SERVICE|UNIT|SAINT)\b'
core = lambda n: re.sub(r'\s+', ' ', re.sub(GENERIC, ' ', n or '')).strip()
for r in s.itertuples():
    st = STATES.get(r.State); k = norm(r.Hospital)
    cands = by.get((st, k), set())
    if len(cands) == 1:
        c = next(iter(cands))
        closed[c] = [int(r._6) if str(r._6).isdigit() else r._6, r._5, r._8, r.Hospital, int(r._7) if str(r._7).isdigit() else None]
    else:
        # Fallback: closest name in the state among hospitals whose last cost report is within two years of the closure
        # (a closed hospital stops filing), with a clear margin over the next best
        yr = int(r._6) if str(r._6).isdigit() else None
        pool = [c for c in IDX if IDX[c]['s'] == st and yr and yr - 2 <= max(IDX[c]['yr']) <= yr + 1] if st and yr and k else []
        sc = sorted(((max(SequenceMatcher(None, core(k), core(n)).ratio() for n in build_aco.names[c] if n and core(n)), c) for c in pool if any(n and core(n) for n in build_aco.names[c])), reverse=True) if core(k) else []
        if sc and sc[0][0] >= 0.78 and (len(sc) == 1 or sc[0][0] - sc[1][0] >= 0.1) and sc[0][1] not in closed:
            c = sc[0][1]
            closed[c] = [yr, r._5, r._8, r.Hospital, int(r._7) if str(r._7).isdigit() else None]
            fuzzy.append((r.Hospital, IDX[c]['n'], round(sc[0][0], 2)))
        else: unmatched.append((r.Hospital, r.State, r._6, len(cands)))
closed = {c: [None if (isinstance(x, float) and x != x) else x for x in v] for c, v in closed.items()}
inapp_since16 = [u for u in unmatched if str(u[2]) >= '2016']
meta = {'chow_source': f'CMS Hospital Change of Ownership ({f.stem.split("_")[-1]})', 'chow_from': chow_dates.min(), 'chow_to': chow_dates.max(),
        'closed_source': 'UNC Sheps Center rural hospital closures and conversions (November 2026)', 'n_closed_list': len(s), 'n_closed_matched': len(closed)}
json.dump({'meta': meta, 'chow': chow, 'closed': closed}, open(ROOT / 'public/data/ownership.json', 'w'), separators=(',', ':'), allow_nan=False)
print('hospitals with ownership events', len(chow), 'closures matched', len(closed), 'of', len(s), '| unmatched since 2016:', len(inapp_since16))
for u in inapp_since16[:40]: print('  ', u)
print('fuzzy matches', len(fuzzy))
for x in fuzzy: print('  ~', x)
for c in ['360134', '360362', '150161']: print(c, chow.get(c))
