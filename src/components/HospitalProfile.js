import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';
import { titleCase } from './HospitalMap';
import ServiceArea from './ServiceArea';
import QualityCard from './Quality';
import PaymentCard from './Payment';
import CostReportDetail from './CostReportDetail';
import OutpatientCard from './Outpatient';
import { loadSystems, loadHospitals, loadState, loadPeers, fmtInt, fmtPct, fmtUsdM, fmtUsd, fmtDays, downloadCSV, MA_URL, MSSP_URL } from '../data';

// Measures compared with peers. better: which direction is favorable (null when neither is)
const KPIS = [
  ['tm', 'Total margin', v => fmtPct(v), 1, 'Net income divided by total revenue (net patient revenue plus other income).'],
  ['pm', 'Patient service margin', v => fmtPct(v), 1, 'Net patient revenue less operating expense, divided by net patient revenue. Leaves out other income.'],
  ['dcoh', 'Days cash on hand', v => fmtDays(v), 1, 'Cash, short-term and long-term investments, divided by daily operating expense excluding depreciation.'],
  ['cr', 'Current ratio', v => (v == null ? 'n/a' : v.toFixed(2)), 1, 'Current assets divided by current liabilities.'],
  ['debt', 'Liabilities to assets', v => fmtPct(v, 0), -1, 'Total liabilities divided by total assets.'],
  ['occ', 'Occupancy', v => fmtPct(v, 0), null, 'Inpatient days divided by available bed days.'],
  ['mcr', 'Original Medicare share of days', v => fmtPct(v, 0), null, 'Original Medicare inpatient days as a share of all inpatient days. Medicare Advantage days are not counted here; see the payer mix card below for Medicare including Medicare Advantage.'],
  ['mcd', 'Medicaid share of days', v => fmtPct(v, 0), null, 'Medicaid inpatient days as a share of all inpatient days.'],
  ['npr_ad', 'Net revenue per adjusted discharge', v => fmtUsd(v), null, 'Net patient revenue divided by discharges scaled up for outpatient volume (discharges times total charges over inpatient charges).'],
  ['exp_ad', 'Expense per adjusted discharge', v => fmtUsd(v), -1, 'Operating expense divided by adjusted discharges.'],
  ['unc', 'Uncompensated care, share of costs', v => fmtPct(v), null, 'Charity care, bad debt and unreimbursed Medicaid and other public program costs, divided by total costs.'],
  ['cl_sh', 'Contract labor share', v => fmtPct(v), -1, 'Direct patient care contract labor as a share of salaries plus contract labor.'],
];
const FLAG_TEXT = {
  npr: 'No net patient revenue was reported.', margin: 'The patient service margin is beyond plus or minus 100%, which usually means a reporting problem.',
  partial: 'The report covers less than 11 months (often a change of ownership or a new or closing hospital).',
  '~cash': 'Cash and investments are negative or implausibly large, usually because a health system holds the cash centrally; days cash on hand is not shown.',
  '~balance': 'The balance sheet does not balance (assets differ from liabilities plus fund balance by more than 1%); balance-sheet ratios are not shown.',
  '~occ': 'Occupancy above 120% suggests the bed count is wrong; occupancy is not shown.', '~tmargin': 'The total margin is beyond plus or minus 100%; it is not shown.',
};
const ROWS = [
  ['Income statement', null], ['Gross patient revenue', 'gpr'], ['Contractual allowances and discounts', 'allow'], ['Net patient revenue', 'npr'], ['Operating expense', 'opex'],
  ['Net income from patient services', 'nisp'], ['Other income', 'oth'], ['Other expenses', 'othx'], ['Net income', 'ni'],
  ['Balance sheet', null], ['Cash on hand and in banks', 'cash'], ['Temporary investments', 'tinv'], ['Long-term investments', 'inv'], ['Accounts receivable', 'ar'], ['Total current assets', 'ca'],
  ['Net fixed assets', 'fa'], ['Total assets', 'ta'], ['Total current liabilities', 'cl_'], ['Long-term liabilities', 'ltl'], ['Total liabilities', 'tl'], ['Fund balance (equity)', 'fb'],
  ['Costs and community benefit', null], ['Total costs', 'cost'], ['Salaries', 'sal'], ['Contract labor, direct patient care', 'cl'], ['Depreciation', 'dep'], ['Cost of charity care', 'charity'], ['Bad debt expense', 'bad_debt'], ['Unreimbursed and uncompensated care', 'uncomp'],
  ['Medicare add-on payments', null], ['Disproportionate share (DSH)', 'dsh'], ['Indirect medical education (IME)', 'ime'],
];
const UROWS = [['Beds', 'beds', fmtInt], ['Discharges', 'dis', fmtInt], ['Medicare discharges', 'mcr_dis', fmtInt], ['Medicaid discharges', 'mcd_dis', fmtInt], ['Inpatient days', 'days', fmtInt],
  ['Employees (FTE)', 'fte', v => fmtInt(v)], ['Interns and residents (FTE)', 'ir', v => (v == null ? 'n/a' : v.toFixed(1))], ['Cost-to-charge ratio', 'ccr', v => (v == null ? 'n/a' : v.toFixed(3))]];

export default function HospitalProfile({ ccn, meta }) {
  const [H, setH] = useState(null), [D, setD] = useState(null), [P, setP] = useState(null), [err, setErr] = useState(null);
  const [peerKey, setPeerKey] = useState('bb');
  const [SY, setSY] = useState(null);
  useEffect(() => { loadSystems().then(setSY); }, []);
  const h = useMemo(() => (H ? H.find(x => x.c === ccn) : null), [H, ccn]);
  useEffect(() => { Promise.all([loadHospitals(), loadPeers()]).then(([a, b]) => { setH(a); setP(b); }).catch(e => setErr(String(e))); }, []);
  useEffect(() => { if (h) loadState(h.s || 'NA').then(d => setD(d[ccn])).catch(e => setErr(String(e))); }, [h, ccn]);
  useEffect(() => { if (h) document.title = `${titleCase(h.n)} | Hospital Financial Explorer | TRYNYTY health:enablement`; }, [h]);

  if (err) return <div className="card" style={{ padding: 24 }}>This hospital could not be loaded ({err}).</div>;
  if (!H || !P) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>;
  if (!h) return <div className="card" style={{ padding: 24 }}>No hospital with CCN {ccn} is in the cost report files. <a href="#map">Back to the map</a></div>;
  if (!D) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading {titleCase(h.n)}…</div>;

  const years = Object.keys(D.years).map(Number).sort();
  const Ly = years[years.length - 1], L = D.years[Ly];
  const PEERS = {
    all: [h.t, `All ${meta.ftype[h.t].toLowerCase()} hospitals`],
    bb: [h.bb ? `${h.t}|bb|${h.bb}` : h.t, `${meta.ftype[h.t]}, ${h.bb ? meta.beds[h.bb].toLowerCase() : 'all sizes'}`],
    cg: [`${h.t}|cg|${h.g}`, `${meta.ftype[h.t]}, ${meta.ctrl[h.g].toLowerCase()}`],
    ru: [`${h.t}|ru|${h.ru}`, `${meta.ftype[h.t]}, ${h.ru === 'R' ? 'rural' : 'urban'}`],
    te: [`${h.t}|teach|${h.te}`, `${meta.ftype[h.t]}, ${h.te === 'major' ? 'major teaching' : h.te === 'minor' ? 'minor teaching' : 'non-teaching'}`],
  };
  const pk = PEERS[peerKey][0];
  const peer = y => (P[y] && P[y][pk]) || null;
  const hard = q => (q || []).some(x => x[0] !== '~');
  const trend = years.map(y => { const d = D.years[y], p = peer(y); const pct = v => (v == null ? null : +(v * 100).toFixed(1));
    return { y, tm: hard(d.q) ? null : pct(d.m.tm), pm: hard(d.q) ? null : pct(d.m.pm), ptm: p && p.tm ? pct(p.tm[1]) : null,
      dcoh: d.m.dcoh != null ? Math.round(d.m.dcoh) : null, pdcoh: p && p.dcoh ? Math.round(p.dcoh[1]) : null,
      npr: d.npr != null ? +(d.npr / 1e6).toFixed(1) : null, opex: d.opex != null ? +(d.opex / 1e6).toFixed(1) : null }; });
  const pL = peer(Ly);
  const flags = L.q || [];
  const loc = `${titleCase(D.addr || '')}, ${titleCase(h.ci || '')}, ${h.s} ${h.z}`;

  const csvRows = () => ([['measure', ...years], ...ROWS.filter(r => r[1]).map(([l, k]) => [l, ...years.map(y => D.years[y][k])]),
    ...UROWS.map(([l, k]) => [l, ...years.map(y => D.years[y][k])]), ...KPIS.map(([k, l]) => [l, ...years.map(y => D.years[y].m[k])]),
    ['Report period begins', ...years.map(y => D.years[y].begin)], ['Report period ends', ...years.map(y => D.years[y].end)], ['Months covered', ...years.map(y => D.years[y].months)],
    ['Data flags', ...years.map(y => (D.years[y].q || []).join(' '))]]);
  const csv = () => downloadCSV(csvRows(), `hospital-${ccn}.csv`);

  return (
    <div>
      <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
        <div className="cm-kicker">{meta.ftype[h.t]} · {meta.ctrl[h.g]} · {h.ru === 'R' ? 'Rural' : 'Urban'}{h.rc === 'R' ? ' (reclassified as rural for Medicare payment)' : h.rc === 'U' ? ' (reclassified as urban for Medicare payment)' : ''}{h.te !== 'none' ? ` · ${h.te === 'major' ? 'Major' : 'Minor'} teaching` : ''} · CCN {ccn}</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, margin: '4px 0', color: 'var(--navy)' }}>{titleCase(h.n)}</h1>
        <div style={{ color: 'var(--gray-600)', fontSize: 14 }}>{loc}{D.county ? ` · ${titleCase(D.county)} County` : ''}</div>
        {h.sy && SY && SY[h.sy] && <div style={{ fontSize: 14, marginTop: 4 }}>Part of <a href={`#sys/${h.sy}`}><b>{SY[h.sy].n}</b></a> ({SY[h.sy].h.length} hospitals)</div>}
        <div style={{ marginTop: 8, fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {h.f && <a href={`#map/${h.f}`}>Other hospitals in this county</a>}
          {h.f && <a href={`${MA_URL}/#map/${h.f}`} target="_blank" rel="noreferrer">Medicare Advantage in this county</a>}
          {h.f && <a href={`${MSSP_URL}/#map/${h.f}`} target="_blank" rel="noreferrer">ACOs in this county</a>}
          <a href={`#compare/${ccn}`}>Compare with other hospitals</a>
          <button className="cm-link" onClick={csv}>Download all years (CSV)</button>
        </div>
      </div>

      {flags.length > 0 && <div className="hp-flag"><b>About the {Ly} report.</b> {flags.map(f => FLAG_TEXT[f]).filter(Boolean).join(' ')}{hard(flags) ? ' Its margins are shown here but left out of peer medians and area totals.' : ''}</div>}

      <ChartCard title={`${Ly} at a glance, compared with peers`} csvName={`hospital-${ccn}-peers-${Ly}`}
        csv={() => [['measure', 'hospital', 'peer_25th', 'peer_median', 'peer_75th', 'peer_group', 'peers'], ...KPIS.map(([k, l]) => { const p = pL && pL[k]; return [l, L.m[k], p ? p[0] : '', p ? p[1] : '', p ? p[2] : '', PEERS[peerKey][1], pL ? pL.n : '']; })]} sub={`Report period ${L.begin} to ${L.end} (${L.months} months${L.n_rep > 1 ? `, ${L.n_rep} reports combined` : ''}). The bar shows the middle half of peers (25th to 75th percentile); the dark mark is this hospital.`}
        headerRight={<label className="cm-field" style={{ margin: 0 }}>Peer group
          <select value={peerKey} onChange={e => setPeerKey(e.target.value)}>{Object.entries(PEERS).map(([k, [, l]]) => <option key={k} value={k}>{l}</option>)}</select></label>}>
        <div className="hp-grid">{KPIS.map(([k, l, f, better, def]) => {
          const v = L.m[k], p = pL && pL[k];
          return <div className="hp-kpi" key={k} title={def}><b>{f(v)}</b><span>{l}</span>
            {p ? <><PeerBar v={v} p={p} /><i>Peers: {f(p[1])} median ({f(p[0])} to {f(p[2])}){v != null && better ? ` · ${position(v, p, better)}` : ''}</i></> : <i>Too few peers to compare</i>}</div>;
        })}</div>
        <p className="cm-note">Peer group: {PEERS[peerKey][1]}, {pL ? pL.n.toLocaleString() : 0} hospitals with usable {Ly} reports. Hover a tile for its definition.</p>
      </ChartCard>

      <div className="cm-grid" style={{ marginTop: 14 }}>
        <ChartCard title="Margins over time" sub="Total and patient service margin, with the peer median total margin. Years with an unusable report are left blank." filename={`hospital-${ccn}-margins`} csv={() => [['year', 'total_margin_pct', 'patient_service_margin_pct', 'peer_median_total_margin_pct'], ...trend.map(t => [t.y, t.tm, t.pm, t.ptm])]}>
          <div style={{ height: 240 }}><ResponsiveContainer><LineChart data={trend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" />
            <Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="tm" name="Total margin" stroke="var(--teal-dark)" strokeWidth={2.4} connectNulls={false} />
            <Line dataKey="pm" name="Patient service margin" stroke="var(--navy)" strokeWidth={1.8} strokeDasharray="4 3" connectNulls={false} />
            <Line dataKey="ptm" name="Peer median total margin" stroke="var(--slate)" strokeWidth={1.5} dot={false} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title="Revenue, expense and cash" sub="Net patient revenue and operating expense in $ millions; days cash on hand with the peer median." filename={`hospital-${ccn}-revenue`} csv={() => [['year', 'net_patient_revenue_millions', 'operating_expense_millions', 'days_cash_on_hand', 'peer_median_days_cash'], ...trend.map(t => [t.y, t.npr, t.opex, t.dcoh, t.pdcoh])]}>
          <div style={{ height: 240 }}><ResponsiveContainer><LineChart data={trend} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="d" tick={{ fontSize: 11 }} unit="M" /><YAxis yAxisId="c" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v, n) => (/days/i.test(n) ? v + ' days' : '$' + v + 'M')} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="d" dataKey="npr" name="Net patient revenue" stroke="var(--teal-dark)" strokeWidth={2.2} />
            <Line yAxisId="d" dataKey="opex" name="Operating expense" stroke="var(--red)" strokeWidth={1.8} />
            <Line yAxisId="c" dataKey="dcoh" name="Days cash on hand" stroke="var(--navy)" strokeDasharray="4 3" strokeWidth={1.6} />
            <Line yAxisId="c" dataKey="pdcoh" name="Peer median days cash" stroke="var(--slate)" strokeWidth={1.2} dot={false} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
      </div>

      <QualityCard ccn={ccn} />
      <PaymentCard ccn={ccn} />
      <CostReportDetail ccn={ccn} st={h.s} fin={D.years} />
      <OutpatientCard ccn={ccn} st={h.s} />

      <ServiceArea ccn={ccn} h={h} />

      <ChartCard csvName={`hospital-${ccn}`} csv={csvRows} title="Financial statements by year" sub="As filed on the Medicare cost report (Worksheets G, G-2, G-3, S-10 and E). Dollars." style={{ marginTop: 14 }}>
        <div style={{ overflow: 'auto' }}>
          <table className="cm-table"><thead><tr><th>Line</th>{years.map(y => <th key={y} className="n">{y}</th>)}</tr></thead>
            <tbody>
              {ROWS.map(([l, k]) => (k ? <tr key={l}><td className="lab">{l}</td>{years.map(y => <td key={y} className="n">{fmtUsdM(D.years[y][k])}</td>)}</tr>
                : <tr key={l} className="sub"><td colSpan={years.length + 1}>{l}</td></tr>))}
              <tr className="sub"><td colSpan={years.length + 1}>Volume and staffing</td></tr>
              {UROWS.map(([l, k, f]) => <tr key={l}><td className="lab">{l}</td>{years.map(y => <td key={y} className="n">{f(D.years[y][k])}</td>)}</tr>)}
              <tr className="sub"><td colSpan={years.length + 1}>Report</td></tr>
              <tr><td className="lab">Period</td>{years.map(y => <td key={y} className="n" style={{ fontSize: 11 }}>{D.years[y].begin.slice(5)} to {D.years[y].end.slice(2)}</td>)}</tr>
              <tr><td className="lab">Months (reports)</td>{years.map(y => <td key={y} className="n">{D.years[y].months}{D.years[y].n_rep > 1 ? ` (${D.years[y].n_rep})` : ''}</td>)}</tr>
              <tr><td className="lab">Flags</td>{years.map(y => <td key={y} className="n" style={{ fontSize: 11 }} title={(D.years[y].q || []).map(f => FLAG_TEXT[f]).join(' ')}>{(D.years[y].q || []).length ? (D.years[y].q || []).map(f => f.replace('~', '')).join(', ') : ''}</td>)}</tr>
            </tbody></table>
        </div>
        <p className="cm-note">Cost reports cover the hospital's own fiscal year and are filed for Medicare reimbursement. They are not audited financial statements, and a hospital in a health system may report system-level items (cash, debt, investments) differently from a stand-alone hospital. Hover a flag for what it means.</p>
      </ChartCard>
    </div>
  );
}

function PeerBar({ v, p }) {
  const lo = Math.min(p[0], v ?? p[0]), hi = Math.max(p[2], v ?? p[2]), pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
  const a = lo - pad, b = hi + pad, x = t => ((t - a) / (b - a)) * 100;
  return <div className="hp-bar"><em style={{ left: x(p[0]) + '%', width: x(p[2]) - x(p[0]) + '%' }} />{v != null && <u style={{ left: `calc(${x(v)}% - 1px)` }} />}</div>;
}
function position(v, p, better) {
  const s = better > 0 ? v : -v, q = better > 0 ? p : [-p[2], -p[1], -p[0]];
  return s >= q[2] ? 'better than three quarters of peers' : s >= q[1] ? 'better than the median' : s >= q[0] ? 'below the median' : 'in the bottom quarter';
}
