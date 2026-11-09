"""Medicare inpatient payment profile from the CMS FY 2027 IPPS Impact File (final rule with correction notice).
Input: data/raw/ipps/FY 2027 IPPS Impact File - Correction Notice.txt (tab-delimited; a title row, then headers).
Output: public/data/ipps.json  {"meta": {...}, "h": {ccn: {...}}}
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
d = pd.read_csv(ROOT / 'data/raw/ipps/FY 2027 IPPS Impact File - Correction Notice.txt', sep='\t', skiprows=1, dtype=str, encoding='latin-1')
d = d[d['Provider Number'].str.fullmatch(r'\d{6}', na=False)]
num = lambda c: pd.to_numeric(d[c], errors='coerce')
F = {'cmi': num('CMIV44'), 'wi': num('FY 2027 Wage Index'), 'rtb': num('Resident to Bed Ratio'), 'beds': num('Beds'), 'adc': num('Average Daily Census'),
     'dshpct': num('DSHPCT'), 'dshadj': num('DSHOPP'), 'ucp_claim': num('UCP Per Claim Amount'), 'bills': num('Bills'),
     'mcr_pct': num('Medicare Percentage'), 'mcd_pct': num('Medicaid Percentage'), 'vbp_f': num('Proxy Value Based Purchasing Adjustment Factor'),
     'hrrp_f': num('Proxy Readmission Adjustment Factor'), 'qual_red': num('Proxy Quality Reduction'), 'ehr_red': num('Proxy EHR Reduction'), 'lv': num('Low Volume Hospital Adjustment')}
out = {}
for i, ccn in enumerate(d['Provider Number']):
    o = {}
    for k, s in F.items():
        v = s.iloc[i]
        if pd.notna(v): o[k] = round(float(v), 5)
    for k, col in [('reclass', 'RECLASS'), ('lugar', 'LUGAR'), ('mdh', 'MDH Flag'), ('s401', 'Section 401 Hospital'), ('cbsa', 'Geographic Labor Market Area'), ('pay_cbsa', 'Post Reclass Labor Market Area')]:
        v = d[col].iloc[i]
        if isinstance(v, str) and v.strip(): o[k] = v.strip()
    out[ccn] = o
cmi = F['cmi'].dropna()
meta = {'fy': 2027, 'source': 'FY 2027 IPPS final rule impact file with correction notice (September 2026)', 'n': len(out),
        'cmi_pct': [round(float(np.percentile(cmi, p)), 4) for p in range(0, 101, 5)],
        'hrrp_penalized': int((F['hrrp_f'] < 1).sum()), 'hrrp_n': int(F['hrrp_f'].notna().sum()),
        'vbp_bonus': int((F['vbp_f'] > 1).sum()), 'vbp_n': int(F['vbp_f'].notna().sum())}
json.dump({'meta': meta, 'h': out}, open(ROOT / 'public/data/ipps.json', 'w'), separators=(',', ':'), allow_nan=False)
print(meta, (ROOT / 'public/data/ipps.json').stat().st_size // 1024, 'KB')
for c in ['360180', '360003', '360134', '010001']: print(c, out.get(c))
