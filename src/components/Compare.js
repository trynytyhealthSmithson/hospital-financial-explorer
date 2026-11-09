import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';
import { titleCase, countyTitle } from './HospitalMap';
import { fmtAdj, load340b, loadOpIdx, loadHcrisIdx, loadIpps, loadQuality, loadGeo, loadHospitals, loadState, loadPeers, loadMarketsMeta, loadMkt, loadSA, loadSL, loadZips, fmtInt, fmtPct, fmtUsd, fmtUsdM } from '../data';

const COLORS = ['#178a84', '#0b1829', '#d4860a', '#b4471f', '#6c5ce7'];
const MAX = 5;
// [key, label, value from a year's detail record, format, better direction (1 higher, -1 lower, 0 neither)]
const ROWS = [
  ['Size and volume'],
  ['beds', 'Beds', d => d.beds, fmtInt, 0], ['dis', 'Discharges', d => d.dis, fmtInt, 0], ['fte', 'Employees (FTE)', d => d.fte, fmtInt, 0],
  ['npr', 'Net patient revenue', d => d.npr, fmtUsdM, 0], ['ni', 'Net income', d => d.ni, fmtUsdM, 1],
  ['Profitability and liquidity'],
  ['tm', 'Total margin', d => d.m.tm, v => fmtPct(v), 1], ['pm', 'Patient service margin', d => d.m.pm, v => fmtPct(v), 1],
  ['dcoh', 'Days cash on hand', d => d.m.dcoh, v => (v == null ? 'n/a' : Math.round(v) + ' days'), 1], ['cr', 'Current ratio', d => d.m.cr, v => (v == null ? 'n/a' : v.toFixed(2)), 1],
  ['debt', 'Liabilities to assets', d => d.m.debt, v => fmtPct(v, 0), -1],
  ['Operations and payer mix'],
  ['occ', 'Occupancy', d => d.m.occ, v => fmtPct(v, 0), 0], ['mcr', 'Original Medicare share of days', d => d.m.mcr, v => fmtPct(v, 0), 0], ['mcd', 'Medicaid share of days', d => d.m.mcd, v => fmtPct(v, 0), 0],
  ['npr_ad', 'Net revenue per adjusted discharge', d => d.m.npr_ad, fmtUsd, 0], ['exp_ad', 'Expense per adjusted discharge', d => d.m.exp_ad, fmtUsd, -1],
  ['sal_fte', 'Salary per FTE', d => d.m.sal_fte, fmtUsd, 0], ['cl_sh', 'Contract labor share', d => d.m.cl_sh, v => fmtPct(v), -1],
  ['unc', 'Uncompensated care, share of costs', d => d.m.unc, v => fmtPct(v), 0],
];
const QROWS = [['CMS star rating', q => (q.star == null ? 'n/a' : q.star + ' of 5')], ['Patient experience stars', q => (q.pstar == null ? 'n/a' : q.pstar + ' of 5')],
  ['Value-based purchasing score', q => (q.tps == null ? 'n/a' : q.tps)], ['Readmission conditions above expected', q => (q.err_hi == null ? 'n/a' : `${q.err_hi} of ${Object.keys(q.err).length}`)],
  ['Hospital-acquired condition penalty', q => (q.hacpen == null ? 'n/a' : q.hacpen ? 'Yes' : 'No')]];
const TREND = { tm: ['Total margin', v => +(v * 100).toFixed(1), '%'], pm: ['Patient service margin', v => +(v * 100).toFixed(1), '%'], dcoh: ['Days cash on hand', v => Math.round(v), ''], npr: ['Net patient revenue ($M)', v => +(v / 1e6).toFixed(1), 'M'], occ: ['Occupancy', v => +(v * 100).toFixed(1), '%'] };

export default function Compare({ meta, ids }) {
  const [H, setH] = useState(null), [P, setP] = useState(null), [D, setD] = useState({}), [q, setQ] = useState('');
  const [list, setList] = useState(() => (ids || '').split(',').filter(x => /^[0-9A-Z]{6}$/.test(x)).slice(0, MAX));
  const [year, setYear] = useState(meta.years[meta.years.length - 1]), [tk, setTk] = useState('tm'), [QD, setQD] = useState(null);
  const [IPD, setIPD] = useState(null), [HX, setHX] = useState(null), [OP, setOP] = useState(null), [B3, setB3] = useState(null);
  useEffect(() => { loadQuality().then(setQD); loadIpps().then(setIPD); loadHcrisIdx().then(setHX); loadOpIdx().then(setOP); load340b().then(setB3); }, []);
  const [G, setG] = useState(null), [MM, setMM] = useState(null), [M, setM] = useState(null), [SA, setSA] = useState({}), [SL, setSL] = useState(null), [Z, setZ] = useState(null);
  useEffect(() => { Promise.all([loadHospitals(), loadPeers(), loadGeo(), loadMarketsMeta(), loadZips()]).then(([h, p, g, mm, z]) => { setH(h); setP(p); setG(g); setMM(mm); setZ(z);
    loadMkt(mm.hsaf_years[mm.hsaf_years.length - 1]).then(setM); loadSL(mm.sl_years[mm.sl_years.length - 1]).then(setSL); }); }, []);
  const byC = useMemo(() => (H ? Object.fromEntries(H.map(h => [h.c, h])) : {}), [H]);
  useEffect(() => {
    window.history.replaceState(null, '', `#compare/${list.join(',')}`);
    list.forEach(c => { const h = byC[c]; if (!h) return;
      if (!D[c]) loadState(h.s || 'NA').then(s => setD(o => ({ ...o, [c]: s[c] })));
      if (!SA[c]) loadSA(h.s || 'NA').then(s => setSA(o => ({ ...o, [c]: s[c] || null }))); });
  }, [list, byC]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!H || !P || !G || !MM) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>;
  const hs = list.map(c => byC[c]).filter(Boolean);
  const ql = q.trim().toLowerCase();
  const matches = ql.length >= 2 ? H.filter(h => !list.includes(h.c) && (h.n.toLowerCase().includes(ql) || (h.ci || '').toLowerCase().includes(ql) || h.c.includes(ql))).slice(0, 12) : [];
  const add = c => { setList(l => (l.length < MAX && !l.includes(c) ? [...l, c] : l)); setQ(''); };
  const rec = c => (D[c] && D[c].years[year]) || null;
  const nm = h => titleCase(h.n);
  const peerKey = hs[0] ? (hs[0].bb ? `${hs[0].t}|bb|${hs[0].bb}` : hs[0].t) : null;
  const peer = peerKey && P[year] ? P[year][peerKey] : null;
  const peerLabel = hs[0] ? `${meta.ftype[hs[0].t]}${hs[0].bb ? ', ' + meta.beds[hs[0].bb].toLowerCase() : ''}` : '';

  const trend = meta.years.map(y => Object.fromEntries([['y', y], ...hs.map(h => { const d = D[h.c] && D[h.c].years[y]; const raw = !d ? null : tk === 'npr' ? d.npr : d.m[tk];
    const bad = d && (d.q || []).some(x => x[0] !== '~') && (tk === 'tm' || tk === 'pm'); return [h.c, raw == null || bad ? null : TREND[tk][1](raw)]; })]));

  // Shared market: counties in any compared hospital's primary service area, with each hospital's share there
  const latest = MM.hsaf_years[MM.hsaf_years.length - 1];
  const psaC = new Set(); hs.forEach(h => { const s = SA[h.c]; ((s && s.psa[latest]) || []).forEach(z => { const f = Z && Z[z] && Z[z][2]; if (f) psaC.add(f); }); });
  const mrows = M ? [...psaC].map(f => { const L = M.cty[f] || []; const t = L.reduce((a, [, n]) => a + n, 0); const by = Object.fromEntries(L); return { f, t, sh: hs.map(h => (t && by[h.c] ? by[h.c] / t : null)) }; })
    .sort((a, b) => b.sh.reduce((x, v) => x + (v || 0), 0) - a.sh.reduce((x, v) => x + (v || 0), 0)) : [];
  const lines = SL && MM ? MM.sl_order.map(k => ({ k, v: hs.map(h => (SL[h.c] && SL[h.c][k] ? SL[h.c][k][0] : 0)) })).filter(r => r.v.some(x => x > 0)) : [];

  // Payer mix including managed care and Medicare add-ons, from the full cost report files (index: [all Medicare, MA, all Medicaid, Medicaid managed care, MA share of Medicare, add-ons])
  const hx = HX && HX.years[year];
  const HROWS = [['Medicare share of days, including Medicare Advantage', 0, v => fmtPct(v, 0)], ['Medicare Advantage share of Medicare days', 4, v => fmtPct(v, 0)],
    ['Medicaid share of days, including managed care', 2, v => fmtPct(v, 0)], ['Medicare add-on payments (IME, DSH, uncompensated care, GME, outliers)', 5, v => fmtUsdM(v)], ['Medicare fee-for-service inpatient margin', 6, v => fmtPct(v)]];
  const opLines = OP ? OP.lines.map(([k, l]) => ({ k, l, v: hs.map(h => (OP.h[h.c] && OP.h[h.c][k] ? OP.h[h.c][k] : null)) })).filter(r => r.v.some(Boolean)) : [];
  const opTot = OP ? hs.map(h => { const o = OP.h[h.c]; if (!o) return null; return Object.values(o).reduce((a, r) => [a[0] + r[0], a[1] + r[1], a[2] + (r[2] || 0)], [0, 0, 0]); }) : [];
  return (
    <div>
      <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {hs.map((h, i) => <span key={h.c} className="cm-chip on" style={{ borderColor: COLORS[i], background: COLORS[i], color: '#fff' }}>
            {nm(h)}, {h.s} <button onClick={() => setList(l => l.filter(x => x !== h.c))} aria-label="Remove" style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', marginLeft: 4 }}>✕</button></span>)}
          {list.length < MAX && <span style={{ position: 'relative' }}>
            <input className="cm-search" placeholder={list.length ? 'Add another hospital' : 'Find a hospital to compare (name, city or CCN)'} value={q} onChange={e => setQ(e.target.value)} />
            {matches.length > 0 && <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, minWidth: 320, background: '#fff', border: '1px solid var(--gray-300)', borderRadius: 6, boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
              {matches.map(h => <div key={h.c} onClick={() => add(h.c)} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--gray-100)' }}>{nm(h)} <span style={{ color: 'var(--gray-500)' }}>{titleCase(h.ci || '')}, {h.s} · {meta.ftype[h.t]}</span></div>)}</div>}
          </span>}
          <label className="cm-field" style={{ marginLeft: 'auto' }}>Cost report year<select value={year} onChange={e => setYear(+e.target.value)}>{meta.years.slice().reverse().map(y => <option key={y}>{y}</option>)}</select></label>
        </div>
        <p className="cm-note" style={{ margin: '8px 0 0' }}>Compare up to {MAX} hospitals. Add one from a hospital&apos;s profile with Compare, or search here. The page address keeps the list, so you can share it.</p>
      </div>

      {hs.length === 0 ? <div className="card" style={{ padding: 24, color: 'var(--gray-600)' }}>Search for a hospital above to start a comparison.</div> : <>
        <ChartCard title={`Side by side, ${year}`} sub={`Peer median is for ${peerLabel} hospitals (the first hospital's peer group). The strongest value in each favorable-direction row is in bold. Grey values come from reports flagged as unusable.`}
          csvName={`compare-${year}`} csv={() => [['measure', ...hs.map(nm), `peer median (${peerLabel})`], ...ROWS.filter(r => r.length > 1).map(([k, l, f]) => [l, ...hs.map(h => { const d = rec(h.c); return d ? f(d) : ''; }), peer && peer[k] ? peer[k][1] : '']), ...(hx ? HROWS.map(([l, i]) => [l, ...hs.map(h => (hx[h.c] ? hx[h.c][i] ?? '' : '')), '']) : [])]}>
          <div style={{ overflow: 'auto' }}><table className="cm-table"><thead><tr><th>Measure</th>{hs.map((h, i) => <th key={h.c} className="n" style={{ color: COLORS[i], minWidth: 120 }}><a href={`#h/${h.c}`} style={{ color: 'inherit' }}>{nm(h)}</a></th>)}<th className="n">Peer median</th></tr></thead>
            <tbody>{ROWS.map(r => { if (r.length === 1) return <tr key={r[0]} className="sub"><td colSpan={hs.length + 2}>{r[0]}</td></tr>;
              const [k, l, f, fmt, better] = r; const vals = hs.map(h => { const d = rec(h.c); return d ? f(d) : null; });
              const ok = vals.filter(v => v != null); const best = better && ok.length > 1 ? (better > 0 ? Math.max(...ok) : Math.min(...ok)) : null;
              return <tr key={k}><td className="lab">{l}</td>{hs.map((h, i) => { const d = rec(h.c); const flag = d && (d.q || []).some(x => x[0] !== '~');
                return <td key={h.c} className="n" style={{ fontWeight: vals[i] != null && vals[i] === best ? 700 : undefined, color: flag ? 'var(--gray-500)' : undefined }}>{d ? fmt(vals[i]) : 'no report'}</td>; })}
                <td className="n" style={{ color: 'var(--gray-600)' }}>{peer && peer[k] ? fmt(peer[k][1]) : ''}</td></tr>; })}
              {QD && <><tr className="sub"><td colSpan={hs.length + 2}>Quality and penalties, FY {QD.meta.fy}</td></tr>
                {QROWS.map(([l, f]) => <tr key={l}><td className="lab">{l}</td>{hs.map(h => <td key={h.c} className="n">{QD.h[h.c] ? f(QD.h[h.c]) : 'not rated'}</td>)}<td className="n" style={{ color: 'var(--gray-600)' }}>{l.startsWith('Value') ? `${QD.meta.tps_pct[10]} (national)` : ''}</td></tr>)}</>}
              {IPD && <><tr className="sub"><td colSpan={hs.length + 2}>Medicare payment, FY {IPD.meta.fy}</td></tr>
                {[['Case mix index', p => (p.cmi != null ? p.cmi.toFixed(2) : 'n/a'), `${IPD.meta.cmi_pct[10].toFixed(2)} (national)`], ['Wage index', p => (p.wi != null ? p.wi.toFixed(3) : 'n/a'), ''], ['DSH patient percentage', p => fmtPct(p.dshpct), ''],
                  ['Value-based purchasing adjustment', p => fmtAdj(p.vbp_f), ''], ['Readmissions penalty', p => fmtAdj(p.hrrp_f), '']].map(([l, f, m]) => <tr key={l}><td className="lab">{l}</td>{hs.map(h => <td key={h.c} className="n">{IPD.h[h.c] ? f(IPD.h[h.c]) : 'not in PPS'}</td>)}<td className="n" style={{ color: 'var(--gray-600)' }}>{m}</td></tr>)}</>}
              {hx && <><tr className="sub"><td colSpan={hs.length + 2}>Payer mix and Medicare add-ons, full cost report {year}</td></tr>
                {HROWS.map(([l, i, f]) => <tr key={l}><td className="lab">{l}</td>{hs.map(h => { const r = hx[h.c]; const v = r ? r[i] : null; return <td key={h.c} className="n">{r ? (i === 4 && !r[1] ? 'not reported' : v == null || (i === 5 && !v) ? (i === 5 ? 'none' : i === 6 ? 'not in PPS' : 'n/a') : f(v)) : 'no report'}</td>; })}
                  <td className="n" style={{ color: 'var(--gray-600)' }}>{i === 4 && HX.meta.ma_pen[year] ? `${fmtPct(HX.meta.ma_pen[year], 0)} (national)` : i === 6 && HX.meta.mm_margin[year] != null ? `${fmtPct(HX.meta.mm_margin[year])} (all PPS hospitals)` : ''}</td></tr>)}</>}
              {B3 && <><tr className="sub"><td colSpan={hs.length + 2}>340B Drug Pricing Program, {B3.meta.as_of}</td></tr>
                {[['340B status', r => (r[2] ? `${B3.meta.types[r[0]]} since ${r[1].slice(0, 4)}` : 'Not participating')], ['340B child sites', r => (r[2] ? fmtInt(r[3]) : '')], ['340B contract pharmacies', r => (r[2] ? fmtInt(r[4]) : '')]].map(([l, f]) =>
                  <tr key={l}><td className="lab">{l}</td>{hs.map(h => <td key={h.c} className="n">{B3.h[h.c] ? f(B3.h[h.c]) : (l === '340B status' ? 'Never registered' : '')}</td>)}<td className="n" style={{ color: 'var(--gray-600)' }}>{l.includes('pharmacies') ? `${B3.meta.cp_median} (median participant)` : ''}</td></tr>)}</>}</tbody></table></div>
        </ChartCard>

        <ChartCard title={`${TREND[tk][0]}, ${meta.years[0]} to ${meta.years[meta.years.length - 1]}`} style={{ marginTop: 14 }} filename={`compare-trend-${tk}`}
          headerRight={<select value={tk} onChange={e => setTk(e.target.value)}>{Object.entries(TREND).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>}
          csv={() => [['year', ...hs.map(nm)], ...trend.map(t => [t.y, ...hs.map(h => t[h.c])])]}>
          <div style={{ height: 260 }}><ResponsiveContainer><LineChart data={trend} margin={{ top: 8, right: 12, left: -6, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit={TREND[tk][2] === '%' ? '%' : ''} />
            <Tooltip formatter={(v, n) => [v + (TREND[tk][2] === '%' ? '%' : ''), nm(byC[n])]} /><Legend formatter={v => nm(byC[v])} wrapperStyle={{ fontSize: 11 }} />
            {hs.map((h, i) => <Line key={h.c} dataKey={h.c} stroke={COLORS[i]} strokeWidth={2.2} connectNulls={false} />)}
          </LineChart></ResponsiveContainer></div>
        </ChartCard>

        <div className="cm-grid" style={{ marginTop: 14 }}>
          <ChartCard title={`Where they compete, ${latest}`} sub="Counties in any of these hospitals' primary service areas, with each hospital's share of the county's Medicare inpatient cases (Original Medicare and Medicare Advantage, reported cases)."
            csvName={`compare-market-${latest}`} csv={() => [['county_fips', 'county', 'reported_cases', ...hs.map(nm)], ...mrows.map(r => [r.f, countyTitle(G, r.f), r.t, ...r.sh])]}>
            {!M ? <div style={{ padding: 20, color: 'var(--gray-500)' }}>Loading…</div> : <div style={{ overflow: 'auto', maxHeight: 420 }}><table className="cm-table"><thead><tr><th>County</th><th className="n">Cases</th>{hs.map((h, i) => <th key={h.c} className="n" style={{ color: COLORS[i] }}>{nm(h).split(' ').slice(0, 3).join(' ')}</th>)}</tr></thead>
              <tbody>{mrows.slice(0, 60).map(r => <tr key={r.f}><td>{countyTitle(G, r.f)}</td><td className="n">{fmtInt(r.t)}</td>{r.sh.map((v, i) => <td key={i} className="n">{v == null ? '' : fmtPct(v, 0)}</td>)}</tr>)}</tbody></table></div>}
          </ChartCard>
          <ChartCard title={`Service lines, ${MM.sl_years[MM.sl_years.length - 1]}`} sub="Original Medicare discharges grouped from MS-DRGs (DRGs with 11 or more discharges at the hospital)."
            csvName="compare-service-lines" csv={() => [['service_line', ...hs.map(nm)], ...lines.map(r => [MM.sl[r.k], ...r.v])]}>
            <div style={{ overflow: 'auto', maxHeight: 420 }}><table className="cm-table"><thead><tr><th>Service line</th>{hs.map((h, i) => <th key={h.c} className="n" style={{ color: COLORS[i] }}>{nm(h).split(' ').slice(0, 3).join(' ')}</th>)}</tr></thead>
              <tbody>{lines.map(r => { const mx = Math.max(...r.v); return <tr key={r.k}><td>{MM.sl[r.k]}</td>{r.v.map((v, i) => <td key={i} className="n" style={{ fontWeight: v === mx && v > 0 ? 700 : undefined }}>{v ? fmtInt(v) : ''}</td>)}</tr>; })}</tbody></table></div>
          </ChartCard>
        </div>
        {OP && opLines.length > 0 && <ChartCard title={`Outpatient procedures, ${OP.meta.latest}`} style={{ marginTop: 14 }}
          sub="Original Medicare outpatient procedures and observation stays (comprehensive APCs), with the change since 2019. Hospitals not paid under the outpatient PPS, such as critical access hospitals, are not in the file."
          csvName={`compare-outpatient-${OP.meta.latest}`} csv={() => [['service_line', ...hs.flatMap(h => [`${nm(h)} services`, `${nm(h)} change since 2019`])], ...opLines.map(r => [r.l, ...r.v.flatMap(x => (x ? [x[0], x[2] ? x[0] / x[2] - 1 : ''] : ['', '']))])]}>
          <div style={{ overflow: 'auto', maxHeight: 460 }}><table className="cm-table"><thead><tr><th>Service line</th>{hs.map((h, i) => <th key={h.c} className="n" style={{ color: COLORS[i] }}>{nm(h).split(' ').slice(0, 3).join(' ')}</th>)}</tr></thead>
            <tbody><tr style={{ fontWeight: 600 }}><td>All procedures</td>{opTot.map((t, i) => <td key={i} className="n">{t ? `${fmtInt(t[0])}${t[2] ? ` (${t[0] >= t[2] ? '+' : '−'}${Math.abs(Math.round((t[0] / t[2] - 1) * 100))}%)` : ''}` : 'not in file'}</td>)}</tr>
              {opLines.map(r => { const mx = Math.max(...r.v.map(x => (x ? x[0] : 0))); return <tr key={r.k}><td>{r.l}</td>{r.v.map((x, i) => <td key={i} className="n" style={{ fontWeight: x && x[0] === mx ? 700 : undefined }}>{x ? `${fmtInt(x[0])}${x[2] ? ` (${x[0] >= x[2] ? '+' : '−'}${Math.abs(Math.round((x[0] / x[2] - 1) * 100))}%)` : ''}` : ''}</td>)}</tr>; })}</tbody></table></div>
        </ChartCard>}
      </>}
    </div>
  );
}
