import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import ChartCard from './ChartCard';
import { loadHcris, loadHcrisIdx, fmtInt, fmtPct, fmtUsdM } from '../data';

const PAYERS = [['Original Medicare', 'var(--navy)'], ['Medicare Advantage', '#4f7cac'], ['Medicaid (fee-for-service)', 'var(--teal-dark)'], ['Medicaid managed care', '#7cc5bf'], ['All other payers', '#cfd6df']];
const ADDONS = [['drg', 'Base DRG payments (fee-for-service)'], ['out', 'Outlier payments'], ['ime', 'Indirect medical education, fee-for-service'], ['ime_ma', 'Indirect medical education, Medicare Advantage'],
  ['dsh', 'Disproportionate share (DSH)'], ['ucp', 'Uncompensated care payments'], ['dgme', 'Direct graduate medical education']];
const ADD_KEYS = ['out', 'ime', 'ime_ma', 'dsh', 'ucp', 'dgme'];

/** Payer mix with Medicare Advantage, Medicare add-on payments, and department costs from the full HCRIS cost report files. */
export default function CostReportDetail({ ccn, st }) {
  const [D, setD] = useState(null), [I, setI] = useState(null), [all, setAll] = useState(false);
  useEffect(() => { setD(null); loadHcris(st || 'NA').then(s => setD(s[ccn] || {})).catch(() => setD({})); loadHcrisIdx().then(setI); }, [ccn, st]);
  if (!D || !I) return null;
  const years = Object.keys(D).map(Number).sort();
  if (!years.length) return null;
  const Ly = years[years.length - 1], L = D[Ly];

  // Payer mix of inpatient days by year
  const mix = years.filter(y => D[y].pd).map(y => {
    const [m, ma, md, mc, t] = D[y].pd; const o = Math.max(0, t - (m || 0) - (ma || 0) - (md || 0) - (mc || 0));
    return { y, t, v: [m || 0, ma || 0, md || 0, mc || 0, o], ...Object.fromEntries([m || 0, ma || 0, md || 0, mc || 0, o].map((v, i) => [PAYERS[i][0], +(100 * v / t).toFixed(1)])) };
  });
  const lm = mix[mix.length - 1];
  const mall = lm ? (lm.v[0] + lm.v[1]) / lm.t : null, maPen = lm && lm.v[0] + lm.v[1] ? lm.v[1] / (lm.v[0] + lm.v[1]) : null, mcd = lm ? (lm.v[2] + lm.v[3]) / lm.t : null;
  const noMA = lm && !lm.v[1] && lm.v[0] > 0;
  const ho = L.ho && I.hos[L.ho];

  // Add-on payments
  const addYears = years.filter(y => D[y].a);
  const addTot = y => ADD_KEYS.reduce((s, k) => s + (D[y].a[k] || 0), 0);

  // Departments: families for the latest year, cost centers on request
  const fam = L.f || [];
  const totCost = fam.reduce((s, r) => s + (r[1] || 0), 0);
  const famRows = fam.filter(r => r[1] || r[2] || r[3]);
  const detail = (L.dl || []).filter(r => r[3] || r[4] || r[5]);
  const ccr = (c, ch) => (c && ch ? (c / ch).toFixed(3) : 'n/a');

  return (
    <>
      <ChartCard title="Payer mix, including Medicare Advantage" style={{ marginTop: 14 }}
        sub={`Inpatient days by payer from the full cost report (Worksheet S-3). Unlike the summary measures above, Medicare and Medicaid here include managed care days. Report status for ${Ly}: ${(L.st || 'n/a').toLowerCase()}.`}
        filename={`hospital-${ccn}-payer-mix`} csvName={`hospital-${ccn}-payer-mix`}
        csv={() => [['year', 'original_medicare_days', 'medicare_advantage_days', 'medicaid_ffs_days', 'medicaid_managed_care_days', 'other_days', 'total_days'], ...mix.map(r => [r.y, ...r.v, r.t])]}>
        {lm ? <>
          <div className="hp-grid" style={{ marginBottom: 10 }}>
            <div className="hp-kpi"><b>{fmtPct(mall, 0)}</b><span>of inpatient days are Medicare (Original plus Medicare Advantage), {Ly}</span></div>
            <div className="hp-kpi"><b>{noMA ? 'n/r' : fmtPct(maPen, 0)}</b><span>of Medicare days are Medicare Advantage</span><i>{noMA ? 'No Medicare Advantage days reported. Small and critical access hospitals often leave this line blank.' : `Nationally about ${fmtPct(I.meta.ma_pen && I.meta.ma_pen[Ly], 0)} across hospitals that report it`}</i></div>
            <div className="hp-kpi"><b>{fmtPct(mcd, 0)}</b><span>of inpatient days are Medicaid</span><i>{lm.v[2] + lm.v[3] ? `${fmtPct(lm.v[3] / (lm.v[2] + lm.v[3]), 0)} of them in managed care` : ''}</i></div>
            <div className="hp-kpi"><b>{fmtInt(lm.t)}</b><span>total inpatient days</span></div>
          </div>
          <div style={{ height: 70 + 34 * mix.length }}><ResponsiveContainer><BarChart data={mix} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" horizontal={false} /><XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="y" width={44} tick={{ fontSize: 11 }} />
            <Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            {PAYERS.map(([k, c]) => <Bar key={k} dataKey={k} stackId="a" fill={c} />)}
          </BarChart></ResponsiveContainer></div>
        </> : <p className="cm-note">This hospital's reports have no inpatient day counts on Worksheet S-3.</p>}
        <p className="cm-note">Days count the hospital and its routine units; distinct-part psych, rehab and skilled nursing units are left out. "All other payers" is everything not reported as Medicare or Medicaid, mostly commercial insurance and self-pay.
          {ho ? <> Home office on the cost report: <b>{ho[0]}</b> ({[ho[1], ho[2]].filter(Boolean).join(', ')}).</> : ''}</p>
      </ChartCard>

      {addYears.length > 0 && <ChartCard title="Medicare inpatient add-on payments" style={{ marginTop: 14 }}
        sub="Payments Medicare made on top of base DRG rates, from the hospital's own settlement (Worksheets E Part A and E-4). Teaching payments for Medicare Advantage patients are paid by Medicare directly, not by the plans."
        csvName={`hospital-${ccn}-medicare-addons`} csv={() => [['measure', ...addYears], ...ADDONS.map(([k, l]) => [l, ...addYears.map(y => D[y].a[k] ?? '')]), ['Total add-ons', ...addYears.map(addTot)]]}>
        <table className="cm-table"><thead><tr><th></th>{addYears.map(y => <th key={y} className="n">{y}</th>)}</tr></thead><tbody>
          {ADDONS.map(([k, l]) => <tr key={k}><td className="lab">{l}</td>{addYears.map(y => <td key={y} className="n">{D[y].a[k] ? fmtUsdM(D[y].a[k]) : ''}</td>)}</tr>)}
          <tr style={{ fontWeight: 600 }}><td className="lab">Total add-ons (excluding base DRG)</td>{addYears.map(y => <td key={y} className="n">{fmtUsdM(addTot(y))}</td>)}</tr>
          <tr><td className="lab">Add-ons as a share of base DRG payments</td>{addYears.map(y => <td key={y} className="n">{D[y].a.drg ? fmtPct(addTot(y) / D[y].a.drg, 0) : 'n/a'}</td>)}</tr>
        </tbody></table>
        <p className="cm-note">Blank means none reported. When a fiscal year spans October 1, the amounts before and after the rate change are added together. Uncompensated care payments are interim amounts; CMS reconciles them later.</p>
      </ChartCard>}

      {famRows.length > 0 && <ChartCard title={`Costs and charges by department, ${Ly}`} style={{ marginTop: 14 }}
        sub="Fully allocated cost (overhead spread to each department) and gross charges from Worksheet C. Charges are list prices, not payments, so a lower cost-to-charge ratio means a bigger markup, not a bigger profit."
        csvName={`hospital-${ccn}-departments-${Ly}`}
        csv={() => [['line', 'cost_center', 'department_group', 'cost', 'inpatient_charges', 'outpatient_charges'], ...detail]}
        headerRight={detail.length > 0 && <button className="cm-link" onClick={() => setAll(a => !a)}>{all ? 'Show department groups' : `Show all ${detail.length} cost centers`}</button>}>
        <table className="cm-table"><thead><tr><th>{all ? 'Cost center' : 'Department group'}</th><th className="n">Cost</th><th className="n">Share of cost</th><th className="n">Inpatient charges</th><th className="n">Outpatient charges</th><th className="n">Outpatient share</th><th className="n">Cost to charge</th></tr></thead>
          <tbody>{(all ? detail.map(r => [r[1] || `Line ${r[0]}`, r[3], r[4], r[5], r[2]]) : famRows).map(([l, c, ip, op, g]) => (
            <tr key={l + (g || '')}><td className="lab">{l}{all && g ? <span style={{ color: 'var(--gray-500)', fontSize: 11 }}> · {g}</span> : ''}</td>
              <td className="n">{c ? fmtUsdM(c) : (l === 'Observation' || g === 'Observation' ? 'in routine' : 'n/a')}</td>
              <td className="n"><span className="bar-cell"><i style={{ width: `${totCost && c ? Math.min(100, 100 * c / totCost) : 0}%` }} />{totCost && c ? fmtPct(c / totCost, 1) : ''}</span></td>
              <td className="n">{ip ? fmtUsdM(ip) : ''}</td><td className="n">{op ? fmtUsdM(op) : ''}</td>
              <td className="n">{ip || op ? fmtPct((op || 0) / ((ip || 0) + (op || 0)), 0) : ''}</td><td className="n">{ccr(c, (ip || 0) + (op || 0))}</td></tr>))}
            <tr style={{ fontWeight: 600 }}><td className="lab">Total</td><td className="n">{fmtUsdM(totCost)}</td><td></td>
              <td className="n">{fmtUsdM(fam.reduce((s, r) => s + (r[2] || 0), 0))}</td><td className="n">{fmtUsdM(fam.reduce((s, r) => s + (r[3] || 0), 0))}</td><td></td><td></td></tr>
          </tbody></table>
        <p className="cm-note">Groups follow the standard cost report line numbers; hospitals can add their own cost centers under a standard line, and those stay with that line's group. Observation cost is already counted in routine inpatient care. Revenue by department is not on the cost report.</p>
      </ChartCard>}
    </>
  );
}
