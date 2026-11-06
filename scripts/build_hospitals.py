"""Build hospital-year facts from the CMS Hospital Provider Cost Report PUF (data.cms.gov).

One row per hospital (CCN) per cost report year. When a hospital filed more than one report
for a year (a change of ownership or a short period), flows are summed across the reports and
the balance sheet comes from the report with the latest period end.

Outputs (public/data):
  meta.json            years, labels, definitions, counts
  index.json           every hospital: attributes plus the key measures for every year (compact)
  hosp/<ST>.json       full detail series for the hospitals in a state
  peers.json           peer-group medians by year
"""
import json, re, sys, unicodedata
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'public' / 'data'
YEARS = list(range(2016, 2025))

ST_FIPS = {'AL': '01', 'AK': '02', 'AZ': '04', 'AR': '05', 'CA': '06', 'CO': '08', 'CT': '09', 'DE': '10', 'DC': '11', 'FL': '12', 'GA': '13', 'HI': '15', 'ID': '16', 'IL': '17', 'IN': '18', 'IA': '19', 'KS': '20', 'KY': '21', 'LA': '22', 'ME': '23', 'MD': '24', 'MA': '25', 'MI': '26', 'MN': '27', 'MS': '28', 'MO': '29', 'MT': '30', 'NE': '31', 'NV': '32', 'NH': '33', 'NJ': '34', 'NM': '35', 'NY': '36', 'NC': '37', 'ND': '38', 'OH': '39', 'OK': '40', 'OR': '41', 'PA': '42', 'RI': '44', 'SC': '45', 'SD': '46', 'TN': '47', 'TX': '48', 'UT': '49', 'VT': '50', 'VA': '51', 'WA': '53', 'WV': '54', 'WI': '55', 'WY': '56', 'PR': '72', 'GU': '66', 'VI': '78', 'AS': '60', 'MP': '69'}

# Source column -> short field. Flows are summed across a hospital's reports for the year;
# balance-sheet (stock) fields come from the latest report.
FLOW = {
    'Net Patient Revenue': 'npr', 'Less Total Operating Expense': 'opex', 'Net Income from Service to Patients': 'nisp',
    'Total Other Income': 'oth', 'Total Other Expenses': 'othx', 'Net Income': 'ni', 'Total Patient Revenue': 'gpr',
    "Less Contractual Allowance and Discounts on Patients' Accounts": 'allow',
    'Total Costs': 'cost', 'Depreciation Cost': 'dep', 'Total Salaries From Worksheet A': 'sal', 'Contract Labor: Direct Patient Care': 'cl',
    'Total Days (V + XVIII + XIX + Unknown)': 'days', 'Total Days Title XVIII': 'mcr_days', 'Total Days Title XIX': 'mcd_days',
    'Total Discharges (V + XVIII + XIX + Unknown)': 'dis', 'Total Discharges Title XVIII': 'mcr_dis', 'Total Discharges Title XIX': 'mcd_dis',
    'Total Bed Days Available': 'bed_days', 'Inpatient Total Charges': 'ip_chg', 'Combined Outpatient + Inpatient Total Charges': 'tot_chg',
    'Cost of Charity Care': 'charity', 'Total Bad Debt Expense': 'bad_debt', 'Total Unreimbursed and Uncompensated Care': 'uncomp',
    'Net Revenue from Medicaid': 'mcd_rev', 'Medicaid Charges': 'mcd_chg', 'Disproportionate Share Adjustment': 'dsh', 'Total IME Payment': 'ime',
}
STOCK = {
    'Number of Beds': 'beds', 'FTE - Employees on Payroll': 'fte', 'Number of Interns and Residents (FTE)': 'ir',
    'Cash on Hand and in Banks': 'cash', 'Temporary Investments': 'tinv', 'Investments': 'inv', 'Accounts Receivable': 'ar',
    'Total Current Assets': 'ca', 'Total Current Liabilities': 'cl_', 'Total Fixed Assets': 'fa', 'Total Assets': 'ta',
    'Total Liabilities': 'tl', 'Total Fund Balances': 'fb', 'Total Long Term Liabilities': 'ltl', 'Cost To Charge Ratio': 'ccr',
}
ATTR = {'Hospital Name': 'name', 'Street Address': 'addr', 'City': 'city', 'State Code': 'st', 'Zip Code': 'zip', 'County': 'county',
        'Medicare CBSA Number': 'cbsa', 'Rural Versus Urban': 'ru', 'CCN Facility Type': 'ftype', 'Type of Control': 'ctrl'}

FTYPE = {'STH': 'Short-term acute care', 'CAH': 'Critical access', 'PH': 'Psychiatric', 'RH': 'Rehabilitation', 'LTCH': 'Long-term care', 'CH': "Children's"}
def ctrl_group(c):
    c = int(c) if pd.notna(c) else 0
    return 'np' if c in (1, 2) else 'fp' if 3 <= c <= 6 else 'gov' if 7 <= c <= 13 else 'unk'
CTRL = {'np': 'Nonprofit', 'fp': 'For-profit', 'gov': 'Government', 'unk': 'Unknown'}
def bed_band(b):
    return None if not b or b <= 0 else 'b1' if b < 25 else 'b2' if b < 100 else 'b3' if b < 300 else 'b4' if b < 500 else 'b5'
BEDS = {'b1': 'Under 25 beds', 'b2': '25 to 99 beds', 'b3': '100 to 299 beds', 'b4': '300 to 499 beds', 'b5': '500 or more beds'}

def clean(o):
    """Replace NaN and infinities with null anywhere in an output object."""
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, float) and not np.isfinite(o): return None
    if isinstance(o, np.generic): return clean(o.item())
    return o

def dump(o, path, **kw):
    json.dump(clean(o), open(path, 'w'), allow_nan=False, **kw)

def norm(s):
    s = unicodedata.normalize('NFKD', str(s)).encode('ascii', 'ignore').decode().upper()
    s = re.sub(r'\b(COUNTY|PARISH|BOROUGH|CENSUS AREA|CITY AND BOROUGH|MUNICIPALITY|MUNICIPIO)\b', '', s)
    s = s.replace('SAINT ', 'ST ').replace('ST. ', 'ST ').replace('STE. ', 'STE ')
    return re.sub(r'[^A-Z]', '', s)

def county_lookup():
    topo = json.load(open(OUT / 'counties-albers-10m.json'))
    fips_st = {v: k for k, v in ST_FIPS.items()}
    look = {}
    for g in topo['objects']['counties']['geometries']:
        st = fips_st.get(g['id'][:2]); nm = g['properties']['name']
        if not st: continue
        look[(st, norm(nm))] = g['id']
        if 'city' in nm.lower(): look[(st, norm(nm.replace('city', '')) + 'CITY')] = g['id']
    # Connecticut planning regions replaced counties in the 2022+ boundaries; the cost reports still use county names
    return look

def load_year(y):
    d = pd.read_csv(RAW / f'CostReport_{y}_Final.csv', low_memory=False, dtype={'Provider CCN': str, 'Zip Code': str})
    d = d.copy()
    d['ccn'] = d['Provider CCN'].str.strip().str.zfill(6)
    d['b'] = pd.to_datetime(d['Fiscal Year Begin Date'], errors='coerce'); d['e'] = pd.to_datetime(d['Fiscal Year End Date'], errors='coerce')
    d['months'] = ((d['e'] - d['b']).dt.days + 1) / 30.4375
    for c in list(FLOW) + list(STOCK): d[c] = pd.to_numeric(d[c], errors='coerce')
    rows = []
    for ccn, g in d.groupby('ccn'):
        g = g.sort_values('e')
        # Two full-year reports in one file year: keep the latest. Sum only short periods that together make up a year.
        if len(g) > 1 and g['months'].sum() > 13.5:
            g = g[g['e'] > g['e'].iloc[-1] - pd.Timedelta(days=380)]
            while len(g) > 1 and g['months'].sum() > 13.5: g = g.iloc[1:]
        last = g.iloc[-1]
        r = {'ccn': ccn, 'year': y, 'n_rep': len(g), 'months': float(g['months'].sum()), 'begin': str(g['b'].min().date()), 'end': str(last['e'].date())}
        for c, k in FLOW.items(): v = g[c]; r[k] = float(v.sum()) if v.notna().any() else None
        for c, k in STOCK.items(): v = last[c]; r[k] = float(v) if pd.notna(v) else None
        for c, k in ATTR.items(): v = last[c]; r[k] = None if pd.isna(v) else str(v).strip()
        rows.append(r)
    return pd.DataFrame(rows).astype(object).where(lambda x: pd.notna(x), None)

def safe(a, b):
    return a / b if a is not None and b not in (None, 0) and np.isfinite(a) and np.isfinite(b) else None

def derive(r):
    """Ratios with plain definitions (see meta.json)."""
    npr, opex, mo = r['npr'], r['opex'], r['months'] or 12
    rev = (npr or 0) + (r['oth'] or 0) if npr is not None else None
    adj = r['dis'] * r['tot_chg'] / r['ip_chg'] if r['dis'] and r['tot_chg'] and r['ip_chg'] and r['ip_chg'] > 0 else None
    daily = (opex - (r['dep'] or 0)) / (mo * 30.4375) if opex and opex > 0 else None
    # Cash, short-term investments and long-term investments (where most hospitals hold reserves)
    liquid = (r['cash'] or 0) + (r['tinv'] or 0) + max(r['inv'] or 0, 0) if r['cash'] is not None or r['tinv'] is not None else None
    m = {
        'pm': safe(r['nisp'], npr),            # patient service margin
        'tm': safe(r['ni'], rev),              # total margin
        'dcoh': safe(liquid, daily),           # days cash on hand
        'cr': safe(r['ca'], r['cl_']),         # current ratio
        'occ': safe(r['days'], r['bed_days']), # occupancy
        'mcr': safe(r['mcr_days'], r['days']), # Medicare share of inpatient days
        'mcd': safe(r['mcd_days'], r['days']), # Medicaid share of inpatient days
        'unc': safe(r['uncomp'], r['cost']),   # uncompensated care as share of total costs
        'npr_ad': safe(npr, adj),              # net patient revenue per adjusted discharge
        'exp_ad': safe(opex, adj),             # operating expense per adjusted discharge
        'cl_sh': safe(r['cl'], (r['sal'] or 0) + (r['cl'] or 0)) if r['cl'] is not None else None,  # contract labor share of labor
        'sal_fte': safe(r['sal'], r['fte'] * mo / 12 if r['fte'] else None),
        'debt': safe(r['tl'], r['ta']),        # liabilities to assets
        'adj': adj,
    }
    # Data quality: ratios from these reports are shown but left out of medians and rankings
    q = []
    if npr is None or npr <= 0: q.append('npr')
    if m['pm'] is not None and abs(m['pm']) > 1: q.append('margin')
    if r['ta'] and r['tl'] is not None and r['fb'] is not None and abs(r['ta'] - r['tl'] - r['fb']) > 0.01 * abs(r['ta']) + 1000: q.append('balance')
    if mo < 11: q.append('partial')
    soft = []
    if m['dcoh'] is not None and (m['dcoh'] < 0 or m['dcoh'] > 2000): soft.append('cash'); m['dcoh'] = None
    if 'balance' in q: q.remove('balance'); soft.append('balance'); m['cr'] = m['debt'] = m['dcoh'] = None
    if m['occ'] is not None and m['occ'] > 1.2: soft.append('occ'); m['occ'] = None
    if m['tm'] is not None and abs(m['tm']) > 1: soft.append('tmargin'); m['tm'] = None
    return m, q + ['~' + x for x in soft]

def main():
    look = county_lookup()
    frames = [load_year(y) for y in YEARS]
    df = pd.concat(frames, ignore_index=True)
    print('hospital-years', len(df), 'hospitals', df.ccn.nunique())
    # County FIPS: name match, then the same hospital's county in another year, then other hospitals in the same ZIP, then city
    df['fips'] = [look.get((s, norm(c))) if s and c else None for s, c in zip(df.st, df.county)]
    by_ccn = df.dropna(subset=['fips']).groupby('ccn')['fips'].agg(lambda s: s.mode().iat[0])
    df['fips'] = df['fips'].fillna(df.ccn.map(by_ccn))
    z5 = df['zip'].fillna('').str[:5]
    by_zip = df.assign(z=z5).dropna(subset=['fips']).groupby(['st', 'z'])['fips'].agg(lambda s: s.mode().iat[0])
    df['fips'] = [f if isinstance(f, str) else by_zip.get((s, z)) for f, s, z in zip(df.fips, df.st, z5)]
    by_city = df.dropna(subset=['fips']).assign(c=df.city.fillna('').str.upper()).groupby(['st', 'c'])['fips'].agg(lambda s: s.mode().iat[0])
    df['fips'] = [f if isinstance(f, str) else by_city.get((s, str(c).upper())) for f, s, c in zip(df.fips, df.st, df.city)]
    # A county must be in the hospital's state
    df.loc[[not (isinstance(f, str) and ST_FIPS.get(s) == f[:2]) for f, s in zip(df.fips, df.st)], 'fips'] = None
    print('county matched', round(df.fips.notna().mean() * 100, 1), '%')

    recs = df.to_dict('records')
    for r in recs:
        for k, v in list(r.items()):
            if isinstance(v, float) and not np.isfinite(v): r[k] = None
        r['m'], r['q'] = derive(r)
        r['rev'] = (r['npr'] or 0) + (r['oth'] or 0) if r['npr'] is not None else None
        r['cg'] = ctrl_group(r['ctrl']); r['bb'] = bed_band(r['beds'])
        # Urban or rural by geography: Medicare CBSA codes under 100 or 999xx are a state's rural area. The reported
        # flag reflects payment reclassification (many metro hospitals reclassify as rural), kept separately as 'rc'.
        try: cb = float(r['cbsa']) if r['cbsa'] is not None else None
        except ValueError: cb = None
        rep = r['ru']; r['ru'] = rep if cb is None else 'R' if (cb < 100 or cb >= 99900) else 'U'
        r['rc'] = 'R' if rep == 'R' and r['ru'] == 'U' else 'U' if rep == 'U' and r['ru'] == 'R' else None
        r['teach'] = 'major' if r['ir'] and r['beds'] and r['ir'] / r['beds'] >= 0.25 else 'minor' if r['ir'] and r['ir'] > 0 else 'none'
        r['ft'] = r['ftype'] if r['ftype'] in FTYPE else 'OTH'
    df2 = pd.DataFrame(recs)

    # Peer medians: facility type x (all | control | bed band | urban/rural), by year, clean reports only
    MKEYS = ['pm', 'tm', 'dcoh', 'cr', 'occ', 'mcr', 'mcd', 'unc', 'npr_ad', 'exp_ad', 'cl_sh', 'sal_fte', 'debt']
    peers = {}
    for y in YEARS:
        g = [r for r in recs if r['year'] == y and not [x for x in r['q'] if x[0] != '~']]
        def med(L):
            o = {'n': len(L)}
            for k in MKEYS:
                v = [r['m'][k] for r in L if r['m'][k] is not None]
                o[k] = [round(float(np.percentile(v, p)), 4) for p in (25, 50, 75)] if len(v) >= 5 else None
            return o
        P = {}
        for ft in list(FTYPE) + ['OTH']:
            L = [r for r in g if r['ft'] == ft]
            P[ft] = med(L)
            for key, lab in (('cg', CTRL), ('bb', BEDS), ('ru', {'U': 1, 'R': 1}), ('teach', {'major': 1, 'minor': 1, 'none': 1})):
                for v in lab: P[f'{ft}|{key}|{v}'] = med([r for r in L if r[key] == v])
        peers[y] = P

    # Compact outputs
    R = lambda v, n=0: None if v is None or (isinstance(v, float) and not np.isfinite(v)) else round(float(v), n) if n else int(round(float(v)))
    def detail(r):
        o = {k: R(r[k]) for k in list(FLOW.values()) + ['beds', 'fte', 'cash', 'tinv', 'inv', 'ar', 'ca', 'cl_', 'fa', 'ta', 'tl', 'fb', 'ltl']}
        o.update({'ir': R(r['ir'], 2), 'ccr': R(r['ccr'], 4), 'months': R(r['months'], 1), 'n_rep': r['n_rep'], 'begin': r['begin'], 'end': r['end'], 'q': r['q']})
        o['m'] = {k: (R(v, 4) if v is not None and abs(v) < 50 else R(v, 1)) for k, v in r['m'].items()}
        return o
    latest = df2.sort_values('year').groupby('ccn').tail(1).set_index('ccn')
    index, states, byyear = [], {}, {y: [] for y in YEARS}
    IX = ['npr', 'rev', 'nisp', 'ni', 'beds', 'bed_days', 'days', 'mcr_days', 'mcd_days', 'dis', 'cost', 'uncomp', 'fte']
    IM = ['pm', 'tm', 'dcoh', 'occ', 'npr_ad']
    hard = lambda r: 1 if [x for x in r['q'] if x[0] != '~'] else 0
    for ccn, g in df2.groupby('ccn'):
        L = latest.loc[ccn]; g = g.set_index('year')
        hi = len(index)
        for y, r in g.iterrows(): byyear[int(y)].append([hi] + [R(r[k]) for k in IX] + [None if r['m'][k] is None else R(r['m'][k], 0 if k == 'npr_ad' else 1 if k == 'dcoh' else 4) for k in IM] + [hard(r)])
        index.append({'c': ccn, 'n': L['name'], 'ci': L['city'], 's': L['st'], 'f': L['fips'], 'z': (L['zip'] or '')[:5], 'cb': None if L['cbsa'] is None else str(L['cbsa']).split('.')[0],
                      'ru': L['ru'], 'rc': L['rc'], 't': L['ft'], 'g': L['cg'], 'te': L['teach'], 'bb': L['bb'], 'yr': sorted(int(y) for y in g.index)})
        states.setdefault(L['st'] or 'NA', {})[ccn] = {'addr': L['addr'], 'zip': L['zip'], 'county': L['county'], 'ctrl': L['ctrl'],
            'years': {int(y): detail(r) for y, r in g.iterrows()}}
    (OUT / 'hosp').mkdir(parents=True, exist_ok=True)
    for st, o in states.items(): dump(o, OUT / 'hosp' / f'{st}.json', separators=(',', ':'))
    dump(index, OUT / 'hospitals.json', separators=(',', ':'))
    (OUT / 'year').mkdir(exist_ok=True)
    for y, rows in byyear.items(): dump({'fields': ['i'] + IX + IM + ['flag'], 'rows': rows}, OUT / 'year' / f'{y}.json', separators=(',', ':'))
    dump({str(y): v for y, v in peers.items()}, OUT / 'peers.json', separators=(',', ':'))
    meta = {'years': YEARS, 'ftype': {**FTYPE, 'OTH': 'Other'}, 'ctrl': CTRL, 'beds': BEDS,
            'counts': {str(y): {'hospitals': int((df2.year == y).sum()), 'clean': int(sum(1 for r in recs if r['year'] == y and not hard(r)))} for y in YEARS},
            'county_match': round(float(df.fips.notna().mean()), 4), 'built': pd.Timestamp.today().strftime('%Y-%m-%d')}
    dump(meta, OUT / 'meta.json', indent=1)
    print('flags', pd.Series([q for r in recs for q in r['q']]).value_counts().to_dict())
    print({k: (OUT / k).stat().st_size // 1024 for k in ['hospitals.json', 'peers.json', 'year/2024.json', 'hosp/OH.json', 'hosp/CA.json']}, 'KB; states', len(states))

if __name__ == '__main__':
    main()
