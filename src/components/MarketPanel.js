import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';
import { titleCase } from './HospitalMap';
import { monthLabel, loadVbc, vbcExposure, loadMarketsMeta, loadMkt, loadSL, loadOthers, loadSystems, marketShare, hhiLabel, fmtInt, fmtPct, fmtPts, fmtUsd } from '../data';

/**
 * Market views for a county, state or selected area.
 * 1. Patient origin: where Medicare residents of the area were admitted (Hospital Service Area File, all Medicare).
 * 2. Service lines: what hospitals located in the area treat (Original Medicare discharges by DRG).
 */
const TCOL = ['#178a84', '#0b1829', '#d4860a', '#b4471f', '#6c5ce7', '#2fa59f'];

export default function MarketPanel({ fips, scopeName, H, onHospital }) {
  const [MM, setMM] = useState(null), [O, setO] = useState(null), [SY, setSY] = useState(null), [bySys, setBySys] = useState(false);
  const [V, setV] = useState(null), [T, setT] = useState(null), [tLoading, setTLoading] = useState(false);
  useEffect(() => { loadSystems().then(setSY); loadVbc().then(setV); }, []);
  const loadTrend = () => { setTLoading(true); Promise.all(MM.hsaf_years.map(v => loadMkt(v).then(m => [v, m]))).then(L => { setT(L); setTLoading(false); }); };
  const [y, setY] = useState(null), [M, setM] = useState(null), [Mp, setMp] = useState(null);
  const [sy, setSy] = useState(null), [SLd, setSLd] = useState(null), [line, setLine] = useState(null);
  useEffect(() => { Promise.all([loadMarketsMeta(), loadOthers()]).then(([m, o]) => { setMM(m); setO(o); setY(m.hsaf_years[m.hsaf_years.length - 1]); setSy(m.sl_years[m.sl_years.length - 1]); }); }, []);
  useEffect(() => { if (y) { setM(null); loadMkt(y).then(setM); loadMkt(y - 1).then(setMp).catch(() => setMp(null)); } }, [y]);
  useEffect(() => { if (sy) { setSLd(null); loadSL(sy).then(setSLd); } }, [sy]);
  const byC = useMemo(() => (H ? Object.fromEntries(H.map(h => [h.c, h])) : {}), [H]);
  const fset = useMemo(() => new Set(fips), [fips]);
  const grp = useMemo(() => (bySys ? c => (byC[c] && byC[c].sy) || c : null), [bySys, byC]);
  const share = useMemo(() => (M ? marketShare(M, fips, grp) : null), [M, fips, grp]);
  const shareSys = useMemo(() => (M ? marketShare(M, fips, c => (byC[c] && byC[c].sy) || c) : null), [M, fips, byC]);
  const shareHosp = useMemo(() => (M ? marketShare(M, fips) : null), [M, fips]);
  const prev = useMemo(() => (Mp ? Object.fromEntries(marketShare(Mp, fips, grp).rows.map(r => [r.c, r.sh])) : {}), [Mp, fips, grp]);
  const local = useMemo(() => new Set(H ? H.filter(h => fset.has(h.f)).map(h => h.c) : []), [H, fset]);

  // Service lines at hospitals located in the area
  const lines = useMemo(() => {
    if (!SLd || !MM) return null;
    const by = {}, hosp = {};
    local.forEach(c => { const r = SLd[c]; if (!r) return; Object.entries(r).forEach(([k, [d, p]]) => { const L = by[k] || (by[k] = { k, d: 0, p: 0 }); L.d += d; L.p += p; (hosp[k] = hosp[k] || []).push({ c, d, p }); }); });
    const tot = Object.values(by).reduce((t, L) => t + L.d, 0);
    return { tot, rows: MM.sl_order.filter(k => by[k]).map(k => ({ ...by[k], mix: by[k].d / tot, hs: hosp[k].sort((a, b) => b.d - a.d) })) };
  }, [SLd, MM, local]);

  if (!MM || !H || !SY) return null;
  if (!fips.length) return null;
  const isSys = c => c[0] === 'S' && SY && SY[c];
  const name = c => (isSys(c) ? SY[c].n : byC[c] ? titleCase(byC[c].n) : O && O[c] ? titleCase(O[c][0]) : `Hospital ${c}`);
  const place = c => (isSys(c) ? `${SY[c].h.length} hospitals` : byC[c] ? `${titleCase(byC[c].ci || '')}, ${byC[c].s}` : O && O[c] && O[c][1] ? `${titleCase(O[c][1])}, ${O[c][2]}` : '');
  const inArea = shareHosp ? shareHosp.rows.filter(r => local.has(r.c)).reduce((t, r) => t + r.n, 0) : 0;
  const localSys = new Set([...local].map(c => (byC[c] && byC[c].sy) || c));
  const isLocal = c => (isSys(c) ? localSys.has(c) : local.has(c));
  const scope = scopeName.replace(/^Selected area: /, 'the selected area (') + (scopeName.startsWith('Selected area') ? ')' : '');
  const L = line && lines ? lines.rows.find(r => r.k === line) : null;
  const trendRows = () => {
    const per = T.map(([yy, m]) => { const sh = marketShare(m, fips, grp); const loc = marketShare(m, fips).rows.filter(r => local.has(r.c)).reduce((t, r) => t + r.n, 0); return [yy, sh, sh.total ? loc / sh.total : null]; });
    const last = per[per.length - 1][1]; const keys = last.rows.slice(0, 6).map(r => r.c);
    const data = per.map(([yy, sh, st]) => { const by = Object.fromEntries(sh.rows.map(r => [r.c, r.sh])); return { y: yy, ...Object.fromEntries(keys.map(k => [k, by[k] != null ? +(by[k] * 100).toFixed(1) : null])), stay: st == null ? null : +(st * 100).toFixed(1) }; });
    return { keys, data, csv: [['year', ...keys.map(name), 'stayed_in_area'], ...data.map(d => [d.y, ...keys.map(k => d[k]), d.stay])] };
  };

  return (<>
    <ChartCard title={`Where Medicare patients from ${scope} are admitted`} style={{ marginTop: 14 }}
      sub={`Medicare inpatient cases (Original Medicare and Medicare Advantage) by where the patient lives, calendar ${y}. Share is of reported cases; CMS hides any hospital and ZIP code pair with 10 or fewer cases.`}
      headerRight={<span style={{ display: 'flex', gap: 6, alignItems: 'center' }}><button className={`cm-chip ${!bySys ? 'on' : ''}`} onClick={() => setBySys(false)}>Hospitals</button><button className={`cm-chip ${bySys ? 'on' : ''}`} onClick={() => setBySys(true)}>Health systems</button>
        <select value={y || ''} onChange={e => setY(+e.target.value)}>{MM.hsaf_years.slice().reverse().map(v => <option key={v} value={v}>{v}</option>)}</select></span>}
      csvName={`market-share-${bySys ? 'systems-' : ''}${y}`}
      csv={share ? () => [['ccn', 'hospital', 'location', 'in_area', 'cases', 'share', 'share_prior_year'], ...share.rows.map(r => [r.c, name(r.c), place(r.c), isLocal(r.c) ? 'yes' : 'no', r.n, r.sh, prev[r.c] ?? ''])] : null}>
      {!share ? <div style={{ padding: 30, color: 'var(--gray-500)' }}>Loading {y}…</div> : share.total === 0 ? <p className="cm-note">No reported cases for these counties.</p> : <>
        <div className="cm-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div><b>{fmtInt(share.total)}</b><span>reported inpatient cases from residents</span></div>
          <div><b>{fmtPct(inArea / share.total, 0)}</b><span>stayed at hospitals located in the area</span></div>
          <div><b>{fmtInt(shareSys.hhi)}</b><span>HHI by health system, {hhiLabel(shareSys.hhi)} (by hospital: {fmtInt(shareHosp.hhi)})</span></div>
          <div><b>{fmtInt(shareHosp.rows.length)}</b><span>hospitals admitted 11 or more patients from at least one ZIP code</span></div>
          {V && (() => { const x = vbcExposure(V, fips); return <>
            <div><b>{fmtPct(x.ma, 0)}</b><span>Medicare Advantage penetration, {monthLabel(V.ma_snap)}</span></div>
            <div><b>{fmtPct(x.aco, 0)}</b><span>of Original Medicare beneficiaries in an MSSP ACO ({V.mssp_year})</span></div></>; })()}
        </div>
        <div style={{ overflow: 'auto', maxHeight: 420, marginTop: 10 }}>
          <table className="cm-table"><thead><tr><th>{bySys ? 'Health system or hospital' : 'Hospital'}</th><th className="n">Cases</th><th className="n">Share</th><th className="n">Change from {y - 1}</th><th>Located</th></tr></thead>
            <tbody>{share.rows.slice(0, 60).map(r => <tr key={r.c}>
              <td>{isSys(r.c) ? <a href={`#sys/${r.c}`}>{name(r.c)}</a> : byC[r.c] ? <button className="cm-link" onClick={() => onHospital(r.c)}>{name(r.c)}</button> : name(r.c)}<span className="cm-sttag">{place(r.c)}</span>{!bySys && byC[r.c] && byC[r.c].sy && SY && SY[byC[r.c].sy] && <span className="cm-sttag" style={{ color: 'var(--teal-dark)' }}>{SY[byC[r.c].sy].n}</span>}</td>
              <td className="n">{fmtInt(r.n)}</td><td className="n">{fmtPct(r.sh)}</td>
              <td className="n" style={{ color: prev[r.c] != null ? (r.sh - prev[r.c] > 0 ? 'var(--teal-dark)' : r.sh - prev[r.c] < 0 ? 'var(--red)' : undefined) : undefined }}>{prev[r.c] != null ? fmtPts(r.sh - prev[r.c]) : 'new'}</td>
              <td>{isLocal(r.c) ? (isSys(r.c) ? 'Has hospitals here' : 'In the area') : 'Outside'}</td></tr>)}</tbody></table>
        </div>
        <p className="cm-note">{fmtInt(share.sup)} more hospital and ZIP code pairs had 1 to 10 cases each and are not counted, so small and distant hospitals are understated. Counties are assigned from each patient&apos;s ZIP code; a ZIP that crosses a county line counts toward its main county. HHI uses the 2023 merger guideline thresholds; the health system figure combines hospitals under the same parent (AHRQ Compendium, 2023 membership).</p>
      </>}
    </ChartCard>

    {share && share.total > 0 && (() => {
      const out = share.rows.filter(r => !isLocal(r.c)); const outN = out.reduce((t, r) => t + r.n, 0);
      return <ChartCard title={`Where residents go when they leave ${scope}`} style={{ marginTop: 14 }}
        sub={`${fmtPct(outN / share.total)} of reported cases from residents, ${y}, went to ${bySys ? 'systems with no hospital' : 'hospitals'} outside the area. Use the Hospitals or Health systems toggle above to switch how they are grouped.`}
        csvName={`outmigration-${y}`} csv={() => [['ccn_or_system', 'name', 'location', 'cases', 'share_of_all_residents', 'share_of_leavers', 'share_prior_year'], ...out.map(r => [r.c, name(r.c), place(r.c), r.n, r.sh, outN ? r.n / outN : '', prev[r.c] ?? ''])]}>
        {out.length === 0 ? <p className="cm-note">Every reported case stayed in the area.</p> :
          <div style={{ overflow: 'auto', maxHeight: 360 }}><table className="cm-table"><thead><tr><th>Destination</th><th className="n">Cases</th><th className="n">Share of leavers</th><th className="n">Share of all residents</th><th className="n">Change from {y - 1}</th></tr></thead>
            <tbody>{out.slice(0, 30).map(r => <tr key={r.c}><td>{isSys(r.c) ? <a href={`#sys/${r.c}`}>{name(r.c)}</a> : byC[r.c] ? <button className="cm-link" onClick={() => onHospital(r.c)}>{name(r.c)}</button> : name(r.c)}<span className="cm-sttag">{place(r.c)}</span></td>
              <td className="n">{fmtInt(r.n)}</td><td className="n">{fmtPct(r.n / outN)}</td><td className="n">{fmtPct(r.sh)}</td>
              <td className="n">{prev[r.c] != null ? fmtPts(r.sh - prev[r.c]) : 'new'}</td></tr>)}</tbody></table></div>}
      </ChartCard>;
    })()}

    <ChartCard title={`Market share over time, ${MM.hsaf_years[0]} to ${MM.hsaf_years[MM.hsaf_years.length - 1]}`} style={{ marginTop: 14 }}
      sub={`The ${bySys ? 'health systems' : 'hospitals'} with the largest ${MM.hsaf_years[MM.hsaf_years.length - 1]} share of residents' Medicare inpatient cases, and the share of care that stayed in the area. Shares are of reported cases each year. ${bySys ? 'System membership is as of 2023 for every year.' : ''}`}
      filename={T ? `market-share-trend${bySys ? '-systems' : ''}` : undefined}
      csv={T ? () => trendRows().csv : null} csvName={`market-share-trend${bySys ? '-systems' : ''}`}>
      {!T ? <button className="cm-chip" onClick={loadTrend} disabled={tLoading}>{tLoading ? 'Loading ten years…' : 'Show the trend'}</button> : (() => { const tr = trendRows(); return (
        <div style={{ height: 300 }}><ResponsiveContainer><LineChart data={tr.data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={(v, n) => [v + '%', n === 'stay' ? 'Stayed in the area' : name(n)]} /><Legend formatter={v => (v === 'stay' ? 'Stayed in the area' : name(v))} wrapperStyle={{ fontSize: 11 }} />
          {tr.keys.map((k, i) => <Line key={k} dataKey={k} stroke={TCOL[i % TCOL.length]} strokeWidth={2} dot={false} />)}
          <Line dataKey="stay" stroke="#adb5bd" strokeDasharray="4 3" strokeWidth={1.5} dot={false} />
        </LineChart></ResponsiveContainer></div>); })()}
    </ChartCard>

    <ChartCard title={`Service lines at hospitals in ${scope}`} style={{ marginTop: 14 }}
      sub={`Original Medicare discharges, ${sy}, grouped from MS-DRGs, at hospitals located in the area. Click a service line to see which hospitals lead it.`}
      headerRight={<select value={sy || ''} onChange={e => setSy(+e.target.value)}>{MM.sl_years.slice().reverse().map(v => <option key={v} value={v}>{v}</option>)}</select>}
      csvName={`service-lines-${sy}`}
      csv={lines && lines.tot ? () => [['service_line', 'ccn', 'hospital', 'discharges', 'share_of_line', 'medicare_paid'], ...lines.rows.flatMap(r => [[MM.sl[r.k], 'all', 'All hospitals in the area', r.d, 1, r.p], ...r.hs.map(h => [MM.sl[r.k], h.c, name(h.c), h.d, h.d / r.d, h.p])])] : null}>
      {!lines ? <div style={{ padding: 30, color: 'var(--gray-500)' }}>Loading…</div> : !lines.tot ? <p className="cm-note">No hospitals in the area report DRG data for {sy}.</p> :
        <div className="cm-grid" style={{ gridTemplateColumns: L ? '1.1fr 1fr' : '1fr' }}>
          <div style={{ overflow: 'auto', maxHeight: 460 }}>
            <table className="cm-table"><thead><tr><th>Service line</th><th className="n">Discharges</th><th className="n">Mix</th><th className="n">Medicare paid per discharge</th><th>Leader</th></tr></thead>
              <tbody>{lines.rows.map(r => <tr key={r.k} style={{ cursor: 'pointer', background: line === r.k ? 'var(--teal-light)' : undefined }} onClick={() => setLine(line === r.k ? null : r.k)}>
                <td>{MM.sl[r.k]}</td><td className="n">{fmtInt(r.d)}</td><td className="n">{fmtPct(r.mix)}</td><td className="n">{fmtUsd(r.p / r.d)}</td>
                <td style={{ fontSize: 12 }}>{name(r.hs[0].c)} ({fmtPct(r.hs[0].d / r.d, 0)})</td></tr>)}</tbody></table>
          </div>
          {L && <div style={{ overflow: 'auto', maxHeight: 460 }}>
            <div className="cm-kicker" style={{ marginBottom: 6 }}>{MM.sl[L.k]}, {fmtInt(L.d)} discharges</div>
            <table className="cm-table"><thead><tr><th>Hospital</th><th className="n">Discharges</th><th className="n">Share</th></tr></thead>
              <tbody>{L.hs.map(h => <tr key={h.c}><td><button className="cm-link" onClick={() => onHospital(h.c)}>{name(h.c)}</button></td><td className="n">{fmtInt(h.d)}</td><td className="n">{fmtPct(h.d / L.d)}</td></tr>)}</tbody></table>
          </div>}
        </div>}
      <p className="cm-note">Original Medicare only, and CMS lists a DRG at a hospital only when it had 11 or more discharges, so low-volume services are understated. Service lines are approximate groupings of DRGs; see <a href="#methodology">Methodology</a>.</p>
    </ChartCard>
  </>);
}
