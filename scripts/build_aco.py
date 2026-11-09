"""Hospital participation in Medicare Shared Savings Program ACOs (CMS ACO Participants files, data.cms.gov).

The participant files list each ACO participant by legal business name only (no TIN or CCN), so hospitals are
matched by name. Each hospital gets several name variants: its cost report name, its AHRQ Compendium name, and its
340B registration name and billing organization. Names are normalized (case, punctuation, legal suffixes, common
abbreviations). A participant matches a hospital only when (1) the normalized names are equal, (2) the hospital's
state is in the ACO's service area, and (3) no other hospital in those states has the same normalized name.
Hospitals that join through a parent company or physician group under another name are not found.

Input: data/raw/aco/*.csv (performance years 2022 to 2026); data/raw/systems/chsp-hospital-linkage-2023.csv;
       data/raw/340b/OPA_CE_DAILY_PUBLIC.JSON (optional)
Output: public/data/aco.json {meta, h: {ccn: {year: [[aco_id, aco_name, legal_name, track, initial_start]...]}}}
"""
import json, re
from collections import defaultdict
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data/raw/aco'
H = json.load(open(ROOT / 'public/data/hospitals.json'))
ST = {h['c']: h['s'] for h in H}

ABBR = [(r'\bHOSP\b', 'HOSPITAL'), (r'\bMED\b', 'MEDICAL'), (r'\bCTR\b', 'CENTER'), (r'\bCNTR\b', 'CENTER'), (r'\bMEM\b', 'MEMORIAL'),
        (r'\bREG\b', 'REGIONAL'), (r'\bRGNL\b', 'REGIONAL'), (r'\bCOMM\b', 'COMMUNITY'), (r'\bST\b', 'SAINT'), (r'\bSTE\b', 'SAINTE'),
        (r'\bMT\b', 'MOUNT'), (r'\bUNIV\b', 'UNIVERSITY'), (r'\bHLTH\b', 'HEALTH'), (r'\bSYS\b', 'SYSTEM'), (r'\bGEN\b', 'GENERAL'), (r'&', ' AND ')]
DROP = r'\b(THE|INC|INCORPORATED|LLC|L L C|LLP|LP|PC|PLLC|CORP|CORPORATION|CO|COMPANY|LTD|DBA|D B A|A|AN|OF|AND|NFP|NONPROFIT|NOT FOR PROFIT)\b'
def norm(s):
    if not isinstance(s, str) or not s.strip(): return None
    s = s.upper().replace("'", '')
    s = re.sub(r'\bD/?B/?A\b.*$', '', s)  # keep the legal name before a d/b/a
    s = re.sub(r'[^A-Z0-9& ]', ' ', s)
    for a, b in ABBR: s = re.sub(a, b, s)
    s = re.sub(DROP, ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s if len(s) >= 6 else None

names = defaultdict(set)
for h in H: names[h['c']].add(norm(h['n']))
ah = pd.read_csv(ROOT / 'data/raw/systems/chsp-hospital-linkage-2023.csv', dtype=str, encoding='latin-1')
for c, n in zip(ah.ccn.str.strip().str.zfill(6), ah.hospital_name): names[c].add(norm(n))
B = ROOT / 'data/raw/340b/OPA_CE_DAILY_PUBLIC.JSON'
if B.exists():
    for e in json.load(open(B))['coveredEntities']:
        c = (e.get('cmsCertificationNumber') or '').strip().zfill(6)
        if c in ST and not e.get('parentId340B'):
            names[c].add(norm(e.get('name'))); names[c].add(norm((e.get('billingAddress') or {}).get('organization')))
# normalized name -> hospitals by state
by_name = defaultdict(list)
for c, ns in names.items():
    if c not in ST: continue
    for n in ns:
        if n: by_name[n].append(c)

def year_of(f):
    m = re.search(r'(20\d\d)', f.name); return int(m.group(1))
out = defaultdict(lambda: defaultdict(list)); stats = {}
for f in sorted(RAW.glob('*.csv'), key=year_of):
    y = year_of(f)
    d = pd.read_csv(f, dtype=str, encoding='utf-8-sig')
    d.columns = [c.strip().lower() for c in d.columns]
    n = 0; seen = set()
    for r in d.itertuples():
        k = norm(r.par_lbn)
        if not k or k not in by_name: continue
        states = set(re.findall(r'[A-Z]{2}', r.aco_service_area or ''))
        cands = [c for c in by_name[k] if ST[c] in states]
        if len(set(cands)) != 1: continue
        c = cands[0]
        if (c, r.aco_id) in seen: continue
        seen.add((c, r.aco_id))
        track = 'ENHANCED' if getattr(r, 'enhanced_track', '0') == '1' else (f"BASIC {getattr(r, 'basic_track_level', '')}".strip() if getattr(r, 'basic_track', '0') == '1' else None)
        out[c][str(y)].append([r.aco_id.strip(), r.aco_name, r.par_lbn, track, getattr(r, 'initial_start_date', None)])
        n += 1
    stats[y] = {'participants': len(d), 'hospital_matches': n, 'hospitals': len({c for c, _ in seen})}
    print(y, stats[y], flush=True)
years = sorted(stats)
meta = {'years': years, 'latest': years[-1], 'stats': stats, 'source': 'CMS Medicare Shared Savings Program ACO Participants files, data.cms.gov; hospitals matched by name'}
json.dump({'meta': meta, 'h': out}, open(ROOT / 'public/data/aco.json', 'w'), separators=(',', ':'), allow_nan=False)
print('hospitals ever matched', len(out), (ROOT / 'public/data/aco.json').stat().st_size // 1024, 'KB')
for c in ['360134', '360003', '360179', '360180']: print(c, dict(out.get(c, {})).get(str(years[-1])))
