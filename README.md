# Hospital Financial Explorer

Free explorer of hospital finances from the CMS Hospital Provider Cost Report public use file (2016 to 2024), part of TRYNYTY health:enablement's public tools.

- `scripts/build_hospitals.py` builds `public/data` from the raw CSVs in `data/raw/` (not committed; download from data.cms.gov, Hospital Provider Cost Report).
- `npm start` / `npm run build` (Create React App).

- `scripts/build_markets.py` builds market share, service areas and service lines from `data/raw/hsaf` (Hospital Service Area File) and `data/raw/inpatient` (Medicare Inpatient Hospitals by Provider and Service). Run it after build_hospitals.py.
- `scripts/build_overview.py` builds the Overview trend summary; run it after build_hospitals.py.
- `scripts/build_systems.py` adds health systems from `data/raw/systems/chsp-hospital-linkage-2023.csv` (AHRQ Compendium), plus hospitals joined through the home office on their cost report. Order: build_hospitals, build_hcris, build_systems, build_markets, build_overview.
- `scripts/build_vbc_exposure.py <path to ma-enrollment-explorer/public/data/counties.json>` writes county MA penetration and MSSP ACO share for the exposure measures.
- `scripts/build_quality.py` builds quality and penalty results from `data/raw/quality` (CMS Provider Data Catalog).
- `scripts/build_ipps.py` builds the Medicare payment profile from the FY 2027 IPPS Impact File (`data/raw/ipps`).
- `scripts/build_outpatient.py` builds outpatient procedures from `data/raw/outpatient` (Medicare Outpatient Hospitals by Provider and Service, data.cms.gov). Run after `build_hospitals.py`.
- `scripts/build_340b.py` builds 340B participation from `data/raw/340b/OPA_CE_DAILY_PUBLIC.JSON` (HRSA OPAIS Covered Entity Daily Export, JSON).
- `scripts/build_aco.py` matches hospitals to MSSP ACOs from `data/raw/aco` (ACO Participants files, data.cms.gov). Run after `build_340b.py` inputs are in place.
- `scripts/build_ownership.py` builds ownership changes and rural closures from `data/raw/ownership` (CMS Hospital Change of Ownership; Sheps Center closures table). Run after `build_aco.py` inputs are in place.
- `scripts/build_hcris.py` builds payer mix with Medicare Advantage, Medicare add-on payments, department costs and home offices from the full HCRIS cost report files (`data/raw/hcris`, from downloads.cms.gov/files/hcris/HOSP10FY<year>.zip; needs `pip install duckdb`). Run after `build_hospitals.py`.
