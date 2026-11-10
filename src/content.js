export const DATA_RELEASE = {
  lastUpdated: 'November 9, 2026',
  source: 'CMS Hospital Provider Cost Report and HCRIS cost report files, Hospital Service Area File and Medicare Inpatient and Outpatient by Provider and Service',
};
export const RELEASE_NOTES = [
  {
    version: 'Beta 2.4', date: 'November 2026', items: [
      'Ownership changes and mergers from CMS Medicare enrollment records (2016 to 2026) on hospital profiles and system pages, with a screener filter and preset.',
      'Rural hospital closures and conversions (including Rural Emergency Hospitals) from the UNC Sheps Center: a banner on affected hospital profiles and a screener filter.',
    ],
  },
  {
    version: 'Beta 2.3', date: 'November 2026', items: [
      'Medicare Shared Savings Program ACOs: the ACOs each hospital takes part in (2022 to 2026, matched by legal business name), with track and links to the ACO in the TRYNYTY MSSP Explorer, on hospital profiles, Compare Hospitals and system pages, plus a screener filter.',
    ],
  },
  {
    version: 'Beta 2.2', date: 'November 2026', items: [
      '340B Drug Pricing Program from HRSA\u2019s covered entity registry: participation, entity type, years in the program, child sites and contract pharmacies (including out of state) on hospital profiles, Compare Hospitals and system pages.',
      'Screener filter and CSV columns for 340B, and a new preset for 340B hospitals losing money.',
    ],
  },
  {
    version: 'Beta 2.1', date: 'November 2026', items: [
      'Outpatient procedures: Original Medicare outpatient surgery, device implants, endovascular, endoscopy, radiation therapy and observation stays by service line, 2017 to 2024, with the change since 2019 and every procedure group, on hospital profiles, system pages and Compare Hospitals.',
    ],
  },
  {
    version: 'Beta 2.0', date: 'November 2026', items: [
      'Full cost report history from 2016: payer mix with Medicare Advantage, the Medicare inpatient margin, Medicare add-on payments, capital and debt now cover 2016 to 2024 on hospital and system pages, in the screener and in Compare Hospitals.',
    ],
  },
  {
    version: 'Beta 1.9', date: 'November 2026', items: [
      'Health systems: combined Medicare inpatient margin, Medicare share of days including Medicare Advantage, MA share of Medicare days, average age of plant and Medicare add-on payments, as sortable columns on the systems list and on each system page.',
      'Member hospital tables show each hospital\u2019s Medicare inpatient margin and MA share.',
      'Maryland hospitals, paid under the state\u2019s all-payer model, no longer show a Medicare inpatient PPS margin.',
    ],
  },
  {
    version: 'Beta 1.8', date: 'November 2026', items: [
      'Medicare fee-for-service inpatient margin: what Medicare paid for inpatient care against what that care cost, from each hospital\u2019s own Medicare settlement, with the all-hospital figure for comparison. Also in the screener and Compare Hospitals.',
      'Capital and debt: depreciable assets, accumulated depreciation, average age of plant, long-term debt, fund balance and debt to capitalization by year.',
      'About 200 hospitals missing from the 2023 AHRQ system list now join their system, matched through the home office on their own cost report, and are marked on system pages.',
    ],
  },
  {
    version: 'Beta 1.7', date: 'November 2026', items: [
      'Payer mix including Medicare Advantage and Medicaid managed care, from the full cost report files (2022 to 2024). The summary file counts only Original Medicare days.',
      'Medicare add-on payments by year: teaching (IME) for fee-for-service and Medicare Advantage patients, DSH, uncompensated care, direct GME and outliers.',
      'Costs and charges by department: fully allocated cost, inpatient and outpatient charges and cost-to-charge ratio by department group and by cost center.',
      'Home office named on each hospital\u2019s cost report, and the report\u2019s settlement status.',
      'Screener filters and columns for Medicare share including MA and the MA share of Medicare days, a new preset, and new rows in Compare Hospitals.',
    ],
  },
  {
    version: 'Beta 1.6', date: 'November 2026', items: [
      'Medicare payment profile (FY 2027 payment rule): case mix index, wage index and reclassification, DSH and uncompensated care, teaching intensity, and each hospital\u2019s value-based purchasing and readmissions payment adjustments.',
      'Case mix index and readmission penalty in the screener, the map (median case mix index) and Compare Hospitals.',
    ],
  },
  {
    version: 'Beta 1.5', date: 'November 2026', items: [
      'Quality and Medicare penalties (FY 2026): star rating, patient experience, value-based purchasing score and domains, excess readmissions by condition, and the hospital-acquired condition penalty on every hospital profile.',
      'Quality on the map (average star rating, median VBP score, share penalized), in the screener (filters, a new preset and CSV columns) and in Compare Hospitals.',
    ],
  },
  {
    version: 'Beta 1.4', date: 'November 2026', items: [
      'Market share over time: the leading hospitals or systems in any area from 2016 to 2025, with the share of care that stays local.',
      'Where residents go: the hospitals and systems outside an area that take its residents, with each one\u2019s share of leavers and the change from the prior year.',
      'Medicare Advantage and ACO exposure: MA penetration and MSSP ACO share for any area, and for each hospital weighted by where its patients live.',
    ],
  },
  {
    version: 'Beta 1.3', date: 'November 2026', items: [
      'Health systems from the AHRQ Compendium (2023): a list of 478 multi-hospital systems, and a page for each with combined revenue and margins over time, member hospitals, service lines and a map of the system\u2019s market share by county.',
      'Market share by health system: the area market table can group hospitals by system, HHI is shown by system and by hospital, and each hospital profile names its system and the systems of its competitors.',
    ],
  },
  {
    version: 'Beta 1.2', date: 'November 2026', items: [
      'Overview page: national trends in margins, hospitals losing money, cash and ownership from 2016 to 2024, and a sortable state table.',
      'Hospital screener: filter every hospital by type, region, state, ownership, location, teaching status and ranges of margin, cash, occupancy, payer mix, revenue, beds and 3-year margin change, with starting presets. Filters stay in the page address so a screen can be shared.',
      'Downloads: every table has a CSV; charts and maps offer PNG and the CSV behind them.',
      'Compare Hospitals: up to five hospitals side by side on 18 measures with a peer median, trends over nine years, where they compete for Medicare patients, and their service lines. Start from any hospital profile.',
    ],
  },
  {
    version: 'Beta 1.1', date: 'November 2026', items: [
      'Market share by where patients live: for any county, state or selected area, which hospitals admit its Medicare residents (Original Medicare and Medicare Advantage, 2016 to 2025), how much care stays local, and market concentration.',
      'Service areas on every hospital profile: primary and secondary service area ZIP codes, a map of the hospital\u2019s share by county, competitors in its primary service area, and the trend in cases.',
      'Service lines: Original Medicare discharges grouped from DRGs, for each hospital and for the hospitals in any area, with the leading hospital in each line.',
    ],
  },
  {
    version: 'Beta 1.0', date: 'November 2026', items: [
      'First release: financial and operating measures for about 6,000 hospitals a year from Medicare cost reports, 2016 to 2024.',
      'Map by state and county with neighboring counties across state lines, and Select an area to build a market from counties in any states. Area totals are summed and margins recalculated, not averaged.',
      'Hospital profiles: margins, liquidity, payer mix, cost and revenue per adjusted discharge against a chosen peer group, nine years of statements, and data quality notes.',
    ],
  },
];
