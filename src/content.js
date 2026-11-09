export const DATA_RELEASE = {
  lastUpdated: 'November 9, 2026',
  source: 'CMS Hospital Provider Cost Report, Hospital Service Area File and Medicare Inpatient by Provider and Service',
};
export const RELEASE_NOTES = [
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
