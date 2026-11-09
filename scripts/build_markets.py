"""Market share, service areas and service lines.

Inputs (data/raw):
  hsaf/Hospital_Service_Area_<year>.csv  CMS Hospital Service Area File: Medicare inpatient cases, days and charges
      by hospital (CCN) and patient ZIP code, calendar year, Original Medicare and Medicare Advantage claims.
      CMS suppresses cells with 1 to 10 cases (shown as *).
  inpatient/MUP_*_DY<yy>_PrvSvc.CSV      Medicare Inpatient Hospitals by Provider and Service: Original Medicare
      discharges and payments by hospital and MS-DRG (DRGs with 11 or more discharges at the hospital).

Outputs (public/data):
  mkt/<year>.json     patient-origin market share: for each county, Medicare inpatient cases by hospital
  sa/<ST>.json        per hospital: ZIP-level cases for the latest two years, county totals for every year,
                      primary and secondary service areas
  sl/<year>.json      per hospital: Original Medicare discharges and payments by service line
  zips.json           ZIP code -> [lon, lat, county FIPS] for ZIPs that appear in the data
  others.json         hospitals in the claims files that have no cost report (name, city, state)
  markets_meta.json   years, service line labels, coverage statistics
"""
import json, re, sys
from collections import defaultdict
from pathlib import Path
import numpy as np
import pandas as pd
import zipcodes

sys.path.insert(0, str(Path(__file__).parent))
from build_hospitals import norm, county_lookup, dump, OUT, RAW  # noqa: E402

HSAF_YEARS = list(range(2016, 2026))
SL_YEARS = list(range(2016, 2025))
PSA, SSA = 0.75, 0.90

# Service lines grouped from MS-DRG ranges (approximate; DRGs are stable across the years used)
SL = [
    ('tx', 'Transplant, ECMO and tracheostomy', [(1, 19)]),
    ('nsurg', 'Neurosurgery', [(20, 27), (31, 42)]),
    ('neuro', 'Neurology and stroke', [(52, 103)]),
    ('spine', 'Spine', [(28, 30), (453, 460), (518, 520), (551, 552)]),
    ('enteye', 'Ear, nose, throat and eye', [(113, 159)]),
    ('pulm', 'Pulmonary', [(163, 208)]),
    ('csurg', 'Cardiac surgery and structural heart', [(215, 221), (228, 236), (266, 267)]),
    ('icard', 'Interventional cardiology and electrophysiology', [(222, 227), (242, 251), (258, 262), (273, 275)]),
    ('vasc', 'Vascular', [(237, 241), (252, 257), (268, 272)]),
    ('card', 'Cardiology, medical', [(280, 316)]),
    ('gsurg', 'General and GI surgery', [(326, 358), (405, 425), (619, 621)]),
    ('gimed', 'GI and liver, medical', [(368, 395), (432, 446)]),
    ('joint', 'Joint replacement', [(461, 462), (466, 470), (521, 522)]),
    ('ortho', 'Orthopedics, other', [(463, 465), (471, 517), (533, 550), (553, 566)]),
    ('renal', 'Kidney and urology', [(652, 730)]),
    ('women', "Women's health and obstetrics", [(734, 798)]),
    ('onc', 'Oncology and hematology', [(799, 849)]),
    ('id', 'Infectious disease and sepsis', [(853, 872), (969, 977)]),
    ('bh', 'Behavioral health and substance use', [(876, 897)]),
    ('trauma', 'Trauma, injury and burns', [(901, 935), (955, 965)]),
]
def drg_line(d):
    for k, _, rr in SL:
        if any(a <= d <= b for a, b in rr): return k
    return 'other'
SL_LABEL = {k: l for k, l, _ in SL} | {'other': 'Other (skin, endocrine, other medical and surgical)'}

def zip_table():
    look = county_lookup(); z = {}
    for r in zipcodes.list_all():
        if r['state'] is None or not r['lat']: continue
        f = look.get((r['state'], norm(r['county'] or '')))
        z[r['zip_code']] = [round(float(r['long']), 3), round(float(r['lat']), 3), f]
    return z

KNOWN = set()

def read_hsaf(y):
    d = pd.read_csv(RAW / 'hsaf' / f'Hospital_Service_Area_{y}.csv', dtype=str)
    d.columns = ['ccn', 'zip', 'days', 'chg', 'cases']
    d = d.apply(lambda s: s.str.strip())
    d = d[d.zip.str.fullmatch(r'\d{5}', na=False)]
    for c in ['days', 'chg', 'cases']: d[c] = pd.to_numeric(d[c], errors='coerce')  # '*' -> NaN (1 to 10 cases)
    d['ccn'] = d.ccn.str.upper().str.zfill(6)
    # Units with their own CCN (a letter in the third position: psychiatric S/M, rehabilitation T/R, swing beds U/W/Y/Z)
    # are folded into the parent hospital (same state code and last three digits with a 0) when the parent is known.
    unit = d.ccn.str.match(r'^\d\d[A-Z]\d{3}$')
    parent = d.ccn.str[:2] + '0' + d.ccn.str[3:]
    d.loc[unit & parent.isin(KNOWN), 'ccn'] = parent[unit & parent.isin(KNOWN)]
    # Re-total rows that now share a hospital and ZIP; a cell stays suppressed only if every part was suppressed
    if unit.any():
        d = d.groupby(['ccn', 'zip'], as_index=False)[['days', 'chg', 'cases']].sum(min_count=1)
    return d

def main():
    Z = zip_table()
    H = json.load(open(OUT / 'hospitals.json')); hc = {h['c']: h for h in H}
    KNOWN.update(hc)
    names = {}
    # Service lines and names of hospitals without a cost report
    SLY, slmeta = {}, {}
    for y in SL_YEARS:
        f = next((RAW / 'inpatient').glob(f'*_DY{str(y)[2:]}_*.CSV'))
        d = pd.read_csv(f, dtype={'Rndrng_Prvdr_CCN': str, 'DRG_Cd': str}, low_memory=False, encoding='latin-1')
        d['ccn'] = d.Rndrng_Prvdr_CCN.str.zfill(6)
        for c, n, ci, st in d[['ccn', 'Rndrng_Prvdr_Org_Name', 'Rndrng_Prvdr_City', 'Rndrng_Prvdr_State_Abrvtn']].drop_duplicates('ccn').itertuples(index=False):
            names[c] = [n, ci, st]
        d['line'] = d.DRG_Cd.astype(int).map(drg_line)
        d['pay'] = d.Tot_Dschrgs * d.Avg_Mdcr_Pymt_Amt
        g = d.groupby(['ccn', 'line']).agg(dis=('Tot_Dschrgs', 'sum'), pay=('pay', 'sum')).reset_index()
        o = defaultdict(dict)
        for c, l, dis, pay in g.itertuples(index=False): o[c][l] = [int(dis), int(round(pay))]
        SLY[y] = o; slmeta[y] = {'hospitals': len(o), 'discharges': int(d.Tot_Dschrgs.sum())}
        (OUT / 'sl').mkdir(exist_ok=True); dump(o, OUT / 'sl' / f'{y}.json', separators=(',', ':'))
        print('service lines', y, slmeta[y], 'other share', round(g[g.line == 'other'].dis.sum() / g.dis.sum(), 3))

    # Service areas and patient-origin market share
    (OUT / 'mkt').mkdir(exist_ok=True); (OUT / 'sa').mkdir(exist_ok=True)
    per_h = defaultdict(lambda: {'cty': {}, 'tot': {}, 'sup': {}, 'zips': {}, 'psa': {}, 'ssa': {}})
    used_zips, cov = set(), {}
    for y in HSAF_YEARS:
        d = read_hsaf(y)
        d['fips'] = d.zip.map(lambda z: Z.get(z, [None, None, None])[2])
        rep = d.dropna(subset=['cases'])
        cov[y] = {'rows': int(len(d)), 'suppressed_rows': int(d.cases.isna().sum()), 'reported_cases': int(rep.cases.sum()),
                  'cases_with_county': int(rep[rep.fips.notna()].cases.sum()), 'hospitals': int(d.ccn.nunique())}
        # county market: cases by hospital among reported cells
        m = rep.dropna(subset=['fips']).groupby(['fips', 'ccn']).cases.sum().reset_index()
        mk = defaultdict(list)
        for f, c, n in m.sort_values(['fips', 'cases'], ascending=[True, False]).itertuples(index=False): mk[f].append([c, int(n)])
        sup_c = d[d.cases.isna() & d.fips.notna()].groupby('fips').size()
        dump({'cty': mk, 'sup': {k: int(v) for k, v in sup_c.items()}}, OUT / 'mkt' / f'{y}.json', separators=(',', ':'))
        # per hospital
        for c, g in rep.groupby('ccn'):
            g = g.sort_values('cases', ascending=False); tot = g.cases.sum()
            P = per_h[c]; P['tot'][y] = int(tot)
            P['cty'][y] = {k: int(v) for k, v in g.dropna(subset=['fips']).groupby('fips').cases.sum().items()}
            cum = g.cases.cumsum() / tot
            P['psa'][y] = g.zip[(cum.shift(fill_value=0) < PSA)].tolist()
            P['ssa'][y] = g.zip[(cum.shift(fill_value=0) >= PSA) & (cum.shift(fill_value=0) < SSA)].tolist()
            if y >= HSAF_YEARS[-2]:
                P['zips'][y] = [[z, int(n), int(dd) if pd.notna(dd) else None] for z, n, dd in zip(g.zip, g.cases, g.days)]
                used_zips.update(g.zip)
        sup = d[d.cases.isna()].groupby('ccn').size()
        for c, n in sup.items(): per_h[c]['sup'][y] = int(n)
        print('hsaf', y, cov[y])

    # Write per-state service area files
    by_st = defaultdict(dict)
    for c, P in per_h.items():
        st = hc[c]['s'] if c in hc else (names.get(c, [None, None, None])[2] or 'NA')
        by_st[st][c] = {k: ({str(y): v for y, v in P[k].items() if v is not None}) for k in ['tot', 'sup', 'cty', 'psa', 'ssa', 'zips']}
    for st, o in by_st.items(): dump(o, OUT / 'sa' / f'{st}.json', separators=(',', ':'))
    dump({z: Z[z] for z in sorted(used_zips) if z in Z}, OUT / 'zips.json', separators=(',', ':'))
    others = {c: names[c] for c in per_h if c not in hc and c in names}
    others.update({c: ['Hospital ' + c, None, None] for c in per_h if c not in hc and c not in names})
    dump(others, OUT / 'others.json', separators=(',', ':'))
    dump({'hsaf_years': HSAF_YEARS, 'sl_years': SL_YEARS, 'sl': SL_LABEL, 'sl_order': [k for k, _, _ in SL] + ['other'],
          'coverage': {str(y): v for y, v in cov.items()}, 'sl_coverage': {str(y): v for y, v in slmeta.items()},
          'zip_county': round(sum(1 for z in used_zips if Z.get(z, [0, 0, None])[2]) / max(1, len(used_zips)), 4), 'psa': PSA, 'ssa': SSA},
         OUT / 'markets_meta.json', indent=1)
    print('zips', len(used_zips), 'no-cost-report hospitals', len(others))
    for k in ['zips.json', 'others.json', 'mkt/2024.json', 'sa/OH.json', 'sa/CA.json', 'sl/2024.json']: print(k, (OUT / k).stat().st_size // 1024, 'KB')

if __name__ == '__main__':
    main()
