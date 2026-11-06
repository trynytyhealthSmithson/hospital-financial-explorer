import React from 'react';
import { RELEASE_NOTES } from '../content';

const DEFS = [
  ['Total margin', 'Net income divided by total revenue, where total revenue is net patient revenue plus other income. This is the closest the cost report gets to the bottom line on a hospital’s income statement.'],
  ['Patient service margin', 'Net patient revenue less total operating expense, divided by net patient revenue (Worksheet G-3, line 5). It leaves out other income: investment returns, grants, contributions and some operating revenue such as cafeteria, parking and 340B or physician practice income that hospitals often book there. Because of that it is negative for many financially strong hospitals, and is best read as a trend and against peers, not on its own.'],
  ['Days cash on hand', 'Cash, temporary investments and long-term investments, divided by daily operating expense excluding depreciation. Hospitals in health systems often hold cash at the system level, so their own cost report can show little or negative cash; those values are not shown.'],
  ['Current ratio', 'Total current assets divided by total current liabilities.'],
  ['Liabilities to assets', 'Total liabilities divided by total assets.'],
  ['Occupancy', 'Total inpatient days divided by total available bed days.'],
  ['Payer mix', 'Medicare (Title XVIII) and Medicaid (Title XIX) inpatient days as a share of all inpatient days. Medicare days mainly reflect Original Medicare; how hospitals count Medicare Advantage and Medicaid managed care days on these lines varies, so treat payer mix as approximate and compare a hospital with itself over time.'],
  ['Adjusted discharges', 'Discharges multiplied by total charges divided by inpatient charges, a standard way to scale inpatient volume up for outpatient work. Revenue and expense per adjusted discharge use it as the denominator.'],
  ['Uncompensated care', 'Total unreimbursed and uncompensated care from Worksheet S-10: charity care, bad debt and the unreimbursed cost of Medicaid and other public programs, divided by total costs.'],
];

export default function Methodology({ meta }) {
  return (
    <div className="card" style={{ padding: '22px 26px', maxWidth: 920, lineHeight: 1.6 }}>
      <h2 style={{ fontFamily: 'var(--serif)', color: 'var(--navy)', marginTop: 0 }}>How the Hospital Financial Explorer works</h2>
      <h3>The data</h3>
      <p>Every Medicare-certified hospital files an annual cost report with CMS. CMS publishes selected fields from those reports as the Hospital Provider Cost Report public use file on data.cms.gov, built from the Healthcare Cost Report Information System (HCRIS). This explorer uses the files for {meta.years[0]} to {meta.years[meta.years.length - 1]}: about 6,000 hospitals a year, including short-term acute care, critical access, psychiatric, rehabilitation, long-term care and children&apos;s hospitals.</p>
      <p>Each CMS file year collects reports by the hospital&apos;s fiscal year, so a year mixes fiscal years ending in different months (a 2024 report may run July 2023 to June 2024, or January to December 2024). Every hospital profile shows the exact period each report covers.</p>
      <h3>Combining and cleaning reports</h3>
      <ul>
        <li>When a hospital filed more than one report in a year, usually because of a change of ownership, the short periods are added together. If two full-year reports land in the same file year, only the later one is used, so a year is never counted twice.</li>
        <li>A report is left out of combined margins, medians and peer comparisons when it has no net patient revenue, a patient service margin beyond plus or minus 100%, or covers less than 11 months. It still appears in lists, in grey, and on its hospital&apos;s page with a note. In {meta.years[meta.years.length - 1]}, {meta.counts[meta.years[meta.years.length - 1]].clean.toLocaleString()} of {meta.counts[meta.years[meta.years.length - 1]].hospitals.toLocaleString()} reports were usable.</li>
        <li>Individual ratios are blanked, without dropping the whole report, when the balance sheet does not balance, cash is negative or implausible, occupancy is above 120% or the total margin is beyond plus or minus 100%.</li>
        <li>Counties come from the county name on the report, then the same hospital&apos;s county in another year, then other hospitals in the same ZIP code or city. {Math.round(meta.county_match * 1000) / 10}% of hospital-years have a county.</li>
      </ul>
      <h3>Areas and totals</h3>
      <p>For a county, state or selected area, dollars, beds and days are added up, and margins and shares are recalculated from those totals, so a large hospital counts for more than a small one. The median hospital is shown alongside, because a few large systems can dominate a combined margin. Peer groups compare a hospital with others of the same type in the same year, split by bed size, ownership, urban or rural location, or teaching status; the bar shows the middle half of peers (25th to 75th percentile).</p>
      <h3>Definitions</h3>
      <table className="cm-table"><tbody>{DEFS.map(([k, v]) => <tr key={k}><td style={{ fontWeight: 600, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td><td>{v}</td></tr>)}</tbody></table>
      <h3>Limits</h3>
      <ul>
        <li>Cost reports are prepared for Medicare reimbursement and are not audited financial statements. Figures can differ from a hospital&apos;s audited statements or bond disclosures, and are sometimes revised after CMS reviews them.</li>
        <li>Hospitals that belong to a health system may carry cash, investments, debt and some revenue at the system level. Their own report understates those items.</li>
        <li>The latest year is incomplete for hospitals whose fiscal year ended recently, because reports are due five months after year end and CMS posts them after that.</li>
        <li>Health system membership is not yet included; it will come from the AHRQ Compendium of U.S. Health Systems in a later release.</li>
      </ul>
      <h3>Release notes</h3>
      {RELEASE_NOTES.map(r => <div key={r.version}><b>{r.version}</b> ({r.date})<ul>{r.items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}
    </div>
  );
}
