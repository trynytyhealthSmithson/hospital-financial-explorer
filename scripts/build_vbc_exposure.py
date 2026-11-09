"""County Medicare Advantage penetration and MSSP ACO share for the exposure measures.

Reads the MA Enrollment Explorer's county file (CMS MA enrollment by county, with MSSP ACO assignment from the
MSSP county-level file) from a local checkout and writes public/data/county_vbc.json:
  {"ma_snap": "2026-10", "mssp_year": 2024, "c": {fips: [eligibles, ma_enrollees, mssp_share, assignable_ffs]}}
A hospital's exposure = its service-area counties weighted by its Medicare inpatient cases from each county.
"""
import json, sys
from pathlib import Path
SRC = Path(sys.argv[1] if len(sys.argv) > 1 else '../ma-enrollment-explorer/public/data/counties.json')
OUT = Path(__file__).resolve().parents[1] / 'public' / 'data' / 'county_vbc.json'
d = json.load(open(SRC))
c = {}
for f, r in d['counties'].items():
    el = r['el'][-1] if r.get('el') else None; en = r['en'][-1] if r.get('en') else None
    m = r.get('m') or [None, None, None, None]
    c[f] = [el, en, m[2], m[3]]
json.dump({'ma_snap': d['snaps'][-1], 'mssp_year': d['mssp_year'], 'c': c}, open(OUT, 'w'), separators=(',', ':'), allow_nan=False)
print(len(c), 'counties;', OUT.stat().st_size // 1024, 'KB; MA', d['snaps'][-1], 'MSSP', d['mssp_year'])
