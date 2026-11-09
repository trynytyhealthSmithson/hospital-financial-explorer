# Hospital Financial Explorer

Free explorer of hospital finances from the CMS Hospital Provider Cost Report public use file (2016 to 2024), part of TRYNYTY health:enablement's public tools.

- `scripts/build_hospitals.py` builds `public/data` from the raw CSVs in `data/raw/` (not committed; download from data.cms.gov, Hospital Provider Cost Report).
- `npm start` / `npm run build` (Create React App).

- `scripts/build_markets.py` builds market share, service areas and service lines from `data/raw/hsaf` (Hospital Service Area File) and `data/raw/inpatient` (Medicare Inpatient Hospitals by Provider and Service). Run it after build_hospitals.py.
