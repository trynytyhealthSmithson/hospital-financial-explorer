import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';
import { BASE, fmtInt, fmtPct, fmtUsdM, fmtDays } from '../data';

const ST_NAME = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico' };
let cache = null;
const loadOverview = () => (cache = cache || fetch(`${BASE}/overview.json`).then(r => r.json()));
const pct = v => (v == null ? null : +(v * 100).toFixed(1));

export default function Overview({ meta, setPage }) {
  const [O, setO] = useState(null), [sort, setSort] = useState('tm');
  useEffect(() => { loadOverview().then(setO); }, []);
  if (!O) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>;
  const Y = O.years, Ly = String(Y[Y.length - 1]), Py = String(Y[Y.length - 2]);
  const g = k => O.groups[k][Ly];
  const series = (keys, f) => Y.map(y => Object.fromEntries([['y', y], ...keys.map(k => [k, f(O.groups[k][String(y)])])]));
  const marg = series(['STH', 'CAH', 'STH_rural', 'STH_urban'], v => pct(v.tm));
  const loss = series(['STH', 'CAH'], v => pct(v.loss));
  const cash = series(['STH', 'CAH'], v => (v.dcoh == null ? null : Math.round(v.dcoh)));
  const own = series(['STH_np', 'STH_fp', 'STH_gov'], v => pct(v.tm));
  const S = O.states[Ly], SP = O.states[Py] || {};
  const st = Object.entries(S).filter(([k, v]) => ST_NAME[k] && v.clean >= 5).map(([k, v]) => ({ k, ...v, d: SP[k] && SP[k].tm != null && v.tm != null ? v.tm - SP[k].tm : null }))
    .sort((a, b) => (sort === 'k' ? ST_NAME[a.k].localeCompare(ST_NAME[b.k]) : (b[sort] ?? -9) - (a[sort] ?? -9)));
  const worst = g('STH').loss, peak = Y.reduce((m, y) => (O.groups.STH[String(y)].loss > O.groups.STH[String(m)].loss ? y : m), Y[0]);

  return (
    <div>
      <div className="card" style={{ padding: '18px 22px', marginBottom: 14 }}>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, margin: 0, color: 'var(--navy)' }}>How U.S. hospitals are doing</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--gray-700)', lineHeight: 1.6, maxWidth: 900 }}>
          Financial results for about {fmtInt(meta.counts[Ly].hospitals)} hospitals a year from Medicare cost reports, {Y[0]} to {Ly}. In {Ly} the typical acute care hospital earned a {fmtPct(g('STH').tm)} total margin, and {fmtPct(worst, 0)} lost money, down from {fmtPct(O.groups.STH[String(peak)].loss, 0)} in {peak}. Use the <a href="#map">map</a> to look at any state, county or market, or the <a href="#screener">screener</a> to find hospitals that fit a profile.
        </p>
      </div>
      <div className="hp-grid" style={{ marginBottom: 14 }}>
        <div className="hp-kpi"><b>{fmtPct(g('STH').tm)}</b><span>median total margin, acute care, {Ly}</span><i>Critical access: {fmtPct(g('CAH').tm)}</i></div>
        <div className="hp-kpi"><b>{fmtPct(g('STH').loss, 0)}</b><span>of acute care hospitals lost money</span><i>Critical access: {fmtPct(g('CAH').loss, 0)}</i></div>
        <div className="hp-kpi"><b>{fmtDays(g('STH').dcoh)}</b><span>cash on hand, median acute care hospital</span><i>Critical access: {fmtDays(g('CAH').dcoh)}</i></div>
        <div className="hp-kpi"><b>{fmtUsdM(g('acute').npr)}</b><span>net patient revenue, acute and critical access</span><i>{fmtInt(g('acute').n)} hospitals</i></div>
      </div>
      <div className="cm-grid">
        <ChartCard title="Median total margin" sub="Middle hospital each year, by type and location. Federal relief funds lifted 2020 and 2021." filename="overview-margins"
          csv={() => [['year', 'acute_care', 'critical_access', 'acute_rural', 'acute_urban'], ...marg.map(r => [r.y, r.STH, r.CAH, r.STH_rural, r.STH_urban])]}>
          <div style={{ height: 250 }}><ResponsiveContainer><LineChart data={marg} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" /><Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="STH" name="Acute care" stroke="var(--teal-dark)" strokeWidth={2.4} />
            <Line dataKey="CAH" name="Critical access" stroke="var(--amber)" strokeWidth={2.2} />
            <Line dataKey="STH_rural" name="Acute care, rural" stroke="var(--navy)" strokeDasharray="4 3" strokeWidth={1.5} />
            <Line dataKey="STH_urban" name="Acute care, urban" stroke="var(--slate)" strokeDasharray="4 3" strokeWidth={1.5} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title="Share of hospitals losing money" sub="Hospitals with a negative total margin." filename="overview-losing-money"
          csv={() => [['year', 'acute_care', 'critical_access'], ...loss.map(r => [r.y, r.STH, r.CAH])]}>
          <div style={{ height: 250 }}><ResponsiveContainer><LineChart data={loss} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 'auto']} /><Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="STH" name="Acute care" stroke="var(--red)" strokeWidth={2.4} /><Line dataKey="CAH" name="Critical access" stroke="var(--amber)" strokeWidth={2.2} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title="Median total margin by ownership" sub="Acute care hospitals." filename="overview-ownership"
          csv={() => [['year', 'nonprofit', 'for_profit', 'government'], ...own.map(r => [r.y, r.STH_np, r.STH_fp, r.STH_gov])]}>
          <div style={{ height: 230 }}><ResponsiveContainer><LineChart data={own} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" /><Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="STH_np" name="Nonprofit" stroke="var(--teal-dark)" strokeWidth={2.2} /><Line dataKey="STH_fp" name="For-profit" stroke="var(--navy)" strokeWidth={2.2} /><Line dataKey="STH_gov" name="Government" stroke="var(--amber)" strokeWidth={2.2} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title="Median days cash on hand" sub="Hospitals in systems often hold cash at the parent, which keeps acute care figures low; see Methodology." filename="overview-cash"
          csv={() => [['year', 'acute_care', 'critical_access'], ...cash.map(r => [r.y, r.STH, r.CAH])]}>
          <div style={{ height: 230 }}><ResponsiveContainer><LineChart data={cash} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip formatter={v => v + ' days'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="STH" name="Acute care" stroke="var(--teal-dark)" strokeWidth={2.2} /><Line dataKey="CAH" name="Critical access" stroke="var(--amber)" strokeWidth={2.2} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
      </div>
      <ChartCard title={`States, ${Ly}`} style={{ marginTop: 14 }} sub="Acute care and critical access hospitals. States with fewer than five usable reports are left out. Click a column to sort, a state to open it on the map."
        csv={() => [['state', 'hospitals', 'median_total_margin', 'change_from_prior_year', 'share_losing_money', 'median_days_cash', 'combined_total_margin', 'net_patient_revenue'], ...st.map(r => [r.k, r.n, r.tm, r.d, r.loss, r.dcoh, r.agg_tm, r.npr])]} csvName={`states-${Ly}`}>
        <div style={{ overflow: 'auto', maxHeight: 520 }}><table className="cm-table"><thead><tr>
          {[['k', 'State'], ['n', 'Hospitals'], ['tm', 'Median total margin'], ['d', `Change from ${Py}`], ['loss', 'Losing money'], ['dcoh', 'Median days cash'], ['agg_tm', 'Combined margin'], ['npr', 'Net patient revenue']].map(([k, l]) =>
            <th key={k} className={k === 'k' ? '' : 'n'} style={{ cursor: 'pointer', color: sort === k ? 'var(--teal-dark)' : undefined }} onClick={() => setSort(k)}>{l}{sort === k ? ' ▾' : ''}</th>)}</tr></thead>
          <tbody>{st.map(r => <tr key={r.k}><td><a href={`#map/${r.k}`}>{ST_NAME[r.k]}</a></td><td className="n">{fmtInt(r.n)}</td><td className="n" style={{ color: r.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(r.tm)}</td>
            <td className="n" style={{ color: r.d > 0 ? 'var(--teal-dark)' : r.d < 0 ? 'var(--red)' : undefined }}>{r.d == null ? 'n/a' : `${r.d > 0 ? '+' : r.d < 0 ? '−' : ''}${Math.abs(r.d * 100).toFixed(1)} pts`}</td>
            <td className="n">{fmtPct(r.loss, 0)}</td><td className="n">{r.dcoh == null ? 'n/a' : Math.round(r.dcoh)}</td><td className="n">{fmtPct(r.agg_tm)}</td><td className="n">{fmtUsdM(r.npr)}</td></tr>)}</tbody></table></div>
      </ChartCard>
      <p className="cm-note" style={{ marginTop: 10 }}>Medians and shares use usable reports only (see <a href="#methodology">Methodology</a>). Combined margin weights each hospital by revenue. <button className="cm-link" onClick={() => setPage('screener')}>Open the screener</button></p>
    </div>
  );
}
