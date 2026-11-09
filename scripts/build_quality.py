"""Quality and Medicare payment program results from the CMS Provider Data Catalog (hospitals), FY 2026 releases.

Inputs (data/raw/quality): Hospital_General_Information.csv (overall star rating), HCAHPS-Hospital.csv (patient
experience), hvbp_tps.csv (Hospital Value-Based Purchasing total performance score), FY_2026_Hospital_Readmissions_
Reduction_Program_Hospital.csv (excess readmission ratios), FY_2026_HAC_Reduction_Program_Hospital.csv.
Output: public/data/quality.json  {"meta": {...}, "h": {ccn: {...}}}
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]; RAW = ROOT / 'data/raw/quality'; OUT = ROOT / 'public/data/quality.json'
num = lambda s: pd.to_numeric(s, errors='coerce')
Q = {}
def put(c, k, v):
    if v is None or (isinstance(v, float) and not np.isfinite(v)): return
    Q.setdefault(str(c).zfill(6), {})[k] = v

g = pd.read_csv(RAW / 'Hospital_General_Information.csv', dtype=str)
for r in g.itertuples(index=False):
    c = r[0]; s = num(pd.Series([r[12]]))[0]
    put(c, 'star', int(s) if pd.notna(s) else None)
    put(c, 'ed', 1 if r[10] == 'Yes' else 0 if r[10] == 'No' else None)

h = pd.read_csv(RAW / 'HCAHPS-Hospital.csv', dtype=str, usecols=['Facility ID', 'HCAHPS Measure ID', 'Patient Survey Star Rating', 'HCAHPS Answer Percent', 'Number of Completed Surveys', 'Start Date', 'End Date'])
hp = h[h['HCAHPS Measure ID'].isin(['H_STAR_RATING', 'H_HSP_RATING_9_10', 'H_RECMND_DY'])]
for c, m, star, pct, n in hp[['Facility ID', 'HCAHPS Measure ID', 'Patient Survey Star Rating', 'HCAHPS Answer Percent', 'Number of Completed Surveys']].itertuples(index=False):
    if m == 'H_STAR_RATING':
        v = num(pd.Series([star]))[0]; put(c, 'pstar', int(v) if pd.notna(v) else None)
        nn = num(pd.Series([n]))[0]; put(c, 'surveys', int(nn) if pd.notna(nn) else None)
    else:
        v = num(pd.Series([pct]))[0]; put(c, 'r910' if m == 'H_HSP_RATING_9_10' else 'rec', float(v) if pd.notna(v) else None)
hc_period = f"{h['Start Date'].dropna().iloc[0]} to {h['End Date'].dropna().iloc[0]}"

v = pd.read_csv(RAW / 'hvbp_tps.csv', dtype=str)
cols = {'Total Performance Score': 'tps', 'Unweighted Normalized Clinical Outcomes Domain Score': 'v_clin', 'Unweighted Person And Community Engagement Domain Score': 'v_pce',
        'Unweighted Normalized Safety Domain Score': 'v_safe', 'Unweighted Normalized Efficiency And Cost Reduction Domain Score': 'v_eff'}
for _, r in v.iterrows():
    for col, k in cols.items():
        x = num(pd.Series([r[col]]))[0]; put(r['Facility ID'], k, round(float(x), 1) if pd.notna(x) else None)
tps = num(v['Total Performance Score']).dropna()

rr = pd.read_csv(RAW / 'FY_2026_Hospital_Readmissions_Reduction_Program_Hospital.csv', dtype=str)
COND = {'READM-30-AMI-HRRP': 'AMI', 'READM-30-HF-HRRP': 'HF', 'READM-30-PN-HRRP': 'PN', 'READM-30-COPD-HRRP': 'COPD', 'READM-30-CABG-HRRP': 'CABG', 'READM-30-HIP-KNEE-HRRP': 'HIPKNEE'}
rr['err'] = num(rr['Excess Readmission Ratio'])
for c, g2 in rr.groupby('Facility ID'):
    e = {COND[m]: round(float(x), 4) for m, x in zip(g2['Measure Name'], g2['err']) if m in COND and pd.notna(x)}
    if e: put(c, 'err', e); put(c, 'err_hi', sum(1 for x in e.values() if x > 1))
rr_period = f"{rr['Start Date'].dropna().iloc[0]} to {rr['End Date'].dropna().iloc[0]}"

hac = pd.read_csv(RAW / 'FY_2026_HAC_Reduction_Program_Hospital.csv', dtype=str)
for _, r in hac.iterrows():
    s = num(pd.Series([r['Total HAC Score']]))[0]; put(r['Facility ID'], 'hac', round(float(s), 4) if pd.notna(s) else None)
    put(r['Facility ID'], 'hacpen', 1 if r['Payment Reduction'] == 'Yes' else 0 if r['Payment Reduction'] == 'No' else None)
    p = num(pd.Series([r['PSI 90 Composite Value']]))[0]; put(r['Facility ID'], 'psi90', round(float(p), 4) if pd.notna(p) else None)

meta = {'fy': 2026, 'hcahps_period': hc_period, 'hrrp_period': rr_period, 'tps_pct': [round(float(np.percentile(tps, p)), 1) for p in range(0, 101, 5)],
        'counts': {'star': sum(1 for x in Q.values() if 'star' in x), 'tps': int(len(tps)), 'hrrp': sum(1 for x in Q.values() if 'err' in x),
                   'hacpen': sum(1 for x in Q.values() if x.get('hacpen') == 1), 'hac': sum(1 for x in Q.values() if 'hacpen' in x)}}
json.dump({'meta': meta, 'h': Q}, open(OUT, 'w'), separators=(',', ':'), allow_nan=False)
print(meta['counts'], 'tps median', meta['tps_pct'][10], OUT.stat().st_size // 1024, 'KB')
H = {x['c'] for x in json.load(open(ROOT / 'public/data/hospitals.json'))}
print('matched to our hospitals', len(H & set(Q)), 'of', len(Q))
for c in ['360180', '360003', '360134']: print(c, Q.get(c))
