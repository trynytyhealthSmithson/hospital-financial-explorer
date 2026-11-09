import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';
import { loadOp, loadOpIdx, fmtInt, fmtPct, fmtUsd, fmtUsdM } from '../data';

const chg = (a, b) => (a != null && b ? (a / b - 1) : null);

/** Original Medicare outpatient procedures (comprehensive APCs) by service line, with trend and top procedures. */
export default function OutpatientCard({ ccn, st }) {
  const [D, setD] = useState(null), [I, setI] = useState(null), [apc, setApc] = useState(false);
  useEffect(() => { setD(null); loadOp(st || 'NA').then(s => setD(s[ccn] || {})).catch(() => setD({})); loadOpIdx().then(setI); }, [ccn, st]);
  if (!D || !I) return null;
  const M = I.meta, Ly = String(M.latest);
  if (!D[Ly]) return null;
  const label = Object.fromEntries(I.lines);
  const yrs = M.years.filter(y => y >= M.trend_from).map(String);
  const sum = (y, i) => (D[y] || []).reduce((s, r) => s + r[i], 0);
  const trend = yrs.map(y => ({ y, svcs: D[y] ? sum(y, 1) : null, pay: D[y] ? +(sum(y, 2) / 1e6).toFixed(2) : null }));
  const base = Object.fromEntries((D['2019'] || []).map(r => [r[0], r]));
  const rows = D[Ly].map(([k, s, p, b]) => ({ k, s, p, b, s0: base[k] ? base[k][1] : null }));
  const tot = rows.reduce((a, r) => ({ s: a.s + r.s, p: a.p + r.p, s0: a.s0 + (r.s0 || 0) }), { s: 0, p: 0, s0: 0 });
  const natChg = chg(M.nat[Ly].svcs, M.nat['2019'] && M.nat['2019'].svcs);
  return (
    <ChartCard title={`Outpatient procedures, ${Ly}`} style={{ marginTop: 14 }}
      sub="Major outpatient procedures and observation stays for Original Medicare patients (comprehensive APCs: surgery, device implants, endovascular, endoscopy, radiation therapy). Imaging, clinic and ED visits and drugs are not in this file. Medicare Advantage patients are not counted."
      csvName={`hospital-${ccn}-outpatient-${Ly}`}
      csv={() => (apc ? [['apc', 'description', 'service_line', 'services', 'medicare_payment', 'avg_submitted_charge'], ...(D.apc || []).map(r => [r[0], r[1], label[r[2]], r[3], r[4], r[5]])]
        : [['service_line', 'services_2019', `services_${Ly}`, 'change', `medicare_payment_${Ly}`, 'payment_per_service', 'beneficiaries'], ...rows.map(r => [label[r.k], r.s0 ?? '', r.s, chg(r.s, r.s0) ?? '', r.p, Math.round(r.p / r.s), r.b])])}
      headerRight={D.apc && <button className="cm-link" onClick={() => setApc(a => !a)}>{apc ? 'Show service lines' : `Show all ${D.apc.length} procedure groups`}</button>}>
      <div className="hp-grid" style={{ marginBottom: 10 }}>
        <div className="hp-kpi"><b>{fmtInt(tot.s)}</b><span>Original Medicare outpatient procedures and observation stays</span></div>
        <div className="hp-kpi"><b>{fmtUsdM(tot.p)}</b><span>Medicare payments for them</span><i>{fmtUsd(tot.p / tot.s)} per procedure</i></div>
        <div className="hp-kpi"><b style={{ color: chg(tot.s, tot.s0) < 0 ? 'var(--red)' : 'var(--teal-dark)' }}>{tot.s0 ? fmtPct(chg(tot.s, tot.s0), 0) : 'n/a'}</b><span>change in procedures since 2019</span><i>{natChg != null ? `All hospitals ${fmtPct(natChg, 0)}; part of the drop is patients moving to Medicare Advantage` : ''}</i></div>
      </div>
      <div className="cm-grid">
        {apc ? <div style={{ overflow: 'auto', maxHeight: 360, gridColumn: '1 / -1' }}><table className="cm-table"><thead><tr><th>Procedure group (APC)</th><th>Service line</th><th className="n">Services</th><th className="n">Medicare payment</th><th className="n">Avg charge</th></tr></thead>
          <tbody>{D.apc.map(r => <tr key={r[0]}><td className="lab">{r[1]} <span style={{ color: 'var(--gray-500)', fontSize: 11 }}>{r[0]}</span></td><td>{label[r[2]]}</td><td className="n">{fmtInt(r[3])}</td><td className="n">{fmtUsdM(r[4])}</td><td className="n">{fmtUsd(r[5])}</td></tr>)}</tbody></table></div>
          : <><div style={{ overflow: 'auto', maxHeight: 360 }}><table className="cm-table"><thead><tr><th>Service line</th><th className="n">2019</th><th className="n">{Ly}</th><th className="n">Change</th><th className="n">Medicare payment</th></tr></thead>
            <tbody>{rows.map(r => <tr key={r.k}><td className="lab">{label[r.k]}</td><td className="n">{r.s0 == null ? '' : fmtInt(r.s0)}</td><td className="n">{fmtInt(r.s)}</td>
              <td className="n" style={{ color: chg(r.s, r.s0) < 0 ? 'var(--red)' : undefined }}>{r.s0 ? fmtPct(chg(r.s, r.s0), 0) : 'new'}</td><td className="n">{fmtUsdM(r.p)}</td></tr>)}</tbody></table></div>
            <div style={{ height: 260 }}><ResponsiveContainer><LineChart data={trend} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
              <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis yAxisId="s" tick={{ fontSize: 11 }} /><YAxis yAxisId="p" orientation="right" tick={{ fontSize: 11 }} unit="M" />
              <Tooltip formatter={(v, n) => (/pay/i.test(n) ? '$' + v + 'M' : fmtInt(v))} /><Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="s" dataKey="svcs" name="Procedures" stroke="var(--teal-dark)" strokeWidth={2.2} />
              <Line yAxisId="p" dataKey="pay" name="Medicare payments" stroke="var(--navy)" strokeDasharray="4 3" strokeWidth={1.6} />
            </LineChart></ResponsiveContainer></div></>}
      </div>
      <p className="cm-note">Source: {M.source}. Procedure groups with fewer than 11 patients at a hospital are suppressed by CMS, so small lines may be missing. CMS added procedure groups over time (58 in 2017, 68 in 2024), so part of any growth can be new groups. Trends start in 2017.</p>
    </ChartCard>
  );
}
