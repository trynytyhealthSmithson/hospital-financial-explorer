# Hospital Financial Explorer

Free explorer of hospital finances from the CMS Hospital Provider Cost Report public use file (2016 to 2024), part of TRYNYTY health:enablement's public tools.

- `scripts/build_hospitals.py` builds `public/data` from the raw CSVs in `data/raw/` (not committed; download from data.cms.gov, Hospital Provider Cost Report).
- `npm start` / `npm run build` (Create React App).

- `scripts/build_markets.py` builds market share, service areas and service lines from `data/raw/hsaf` (Hospital Service Area File) and `data/raw/inpatient` (Medicare Inpatient Hospitals by Provider and Service). Run it after build_hospitals.py.
- `scripts/build_overview.py` builds the Overview trend summary; run it after build_hospitals.py.
- `scripts/build_systems.py` adds health systems from `data/raw/systems/chsp-hospital-linkage-2023.csv` (AHRQ Compendium). Order: build_hospitals, build_systems, build_markets, build_overview.
- `scripts/build_vbc_exposure.py <path to ma-enrollment-explorer/public/data/counties.json>` writes county MA penetration and MSSP ACO share for the exposure measures.
- `scripts/build_quality.py` builds quality and penalty results from `data/raw/quality` (CMS Provider Data Catalog).
- `scripts/build_ipps.py` builds the Medicare payment profile from the FY 2027 IPPS Impact File (`data/raw/ipps`).
