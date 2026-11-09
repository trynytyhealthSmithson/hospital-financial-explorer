import React, { useEffect, useMemo, useState } from 'react';
import ChartCard from './ChartCard';
import { titleCase } from './HospitalMap';
import { loadMarketsMeta, loadMkt, loadSL, loadOthers, marketShare, hhiLabel, fmtInt, fmtPct, fmtPts, fmtUsd, downloadCSV } from '../data';

/**
 * Market views for a county, state or selected area.
 * 1. Patient origin: where Medicare residents of the area were admitted (Hospital Service Area File, all Medicare).
 * 2. Service lines: what hospitals located in the area treat (Original Medicare discharges by DRG).
 */
export default function MarketPanel({ fips, scopeName, H, onHospital }) {
  const [MM, setMM] = useState(null), [O, setO] = useState(null);
  const [y, setY] = useState(null), [M, setM] = useState(null), [Mp, setMp] = useState(null);
  const [sy, setSy] = useState(null), [SLd, setSLd] = useState(null), [line, setLine] = useState(null);
  useEffect(() => { Promise.all([loadMarketsMeta(), loadOthers()]).then(([m, o]) => { setMM(m); setO(o); setY(m.hsaf_years[m.hsaf_years.length - 1]); setSy(m.sl_years[m.sl_years.length - 1]); }); }, []);
  useEffect(() => { if (y) { setM(null); loadMkt(y).then(setM); loadMkt(y - 1).then(setMp).catch(() => setMp(null)); } }, [y]);
  useEffect(() => { if (sy) { setSLd(null); loadSL(sy).then(setSLd); } }, [sy]);
  const byC = useMemo(() => (H ? Object.fromEntries(H.map(h => [h.c, h])) : {}), [H]);
  const fset = useMemo(() => new Set(fips), [fips]);
  const share = useMemo(() => (M ? marketShare(M, fips) : null), [M, fips]);
  const prev = useMemo(() => (Mp ? Object.fromEntries(marketShare(Mp, fips).rows.map(r => [r.c, r.sh])) : {}), [Mp, fips]);
  const local = useMemo(() => new Set(H ? H.filter(h => fset.has(h.f)).map(h => h.c) : []), [H, fset]);

  // Service lines at hospitals located in the area
  const lines = useMemo(() => {
    if (!SLd || !MM) return null;
    const by = {}, hosp = {};
    local.forEach(c => { const r = SLd[c]; if (!r) return; Object.entries(r).forEach(([k, [d, p]]) => { const L = by[k] || (by[k] = { k, d: 0, p: 0 }); L.d += d; L.p += p; (hosp[k] = hosp[k] || []).push({ c, d, p }); }); });
    const tot = Object.values(by).reduce((t, L) => t + L.d, 0);
    return { tot, rows: MM.sl_order.filter(k => by[k]).map(k => ({ ...by[k], mix: by[k].d / tot, hs: hosp[k].sort((a, b) => b.d - a.d) })) };
  }, [SLd, MM, local]);

  if (!MM || !H) return null;
  if (!fips.length) return null;
  const name = c => (byC[c] ? titleCase(byC[c].n) : O && O[c] ? titleCase(O[c][0]) : `Hospital ${c}`);
  const place = c => (byC[c] ? `${titleCase(byC[c].ci || '')}, ${byC[c].s}` : O && O[c] && O[c][1] ? `${titleCase(O[c][1])}, ${O[c][2]}` : '');
  const inArea = share ? share.rows.filter(r => local.has(r.c)).reduce((t, r) => t + r.n, 0) : 0;
  const scope = scopeName.replace(/^Selected area: /, 'the selected area (') + (scopeName.startsWith('Selected area') ? ')' : '');
  const L = line && lines ? lines.rows.find(r => r.k === line) : null;

  return (<>
    <ChartCard title={`Where Medicare patients from ${scope} are admitted`} style={{ marginTop: 14 }}
      sub={`Medicare inpatient cases (Original Medicare and Medicare Advantage) by where the patient lives, calendar ${y}. Share is of reported cases; CMS hides any hospital and ZIP code pair with 10 or fewer cases.`}
      headerRight={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <select value={y || ''} onChange={e => setY(+e.target.value)}>{MM.hsaf_years.slice().reverse().map(v => <option key={v} value={v}>{v}</option>)}</select>
        {share && <button className="cm-link" onClick={() => downloadCSV([['ccn', 'hospital', 'location', 'in_area', 'cases', 'share', 'share_prior_year'], ...share.rows.map(r => [r.c, name(r.c), place(r.c), local.has(r.c) ? 'yes' : 'no', r.n, r.sh, prev[r.c] ?? ''])], `market-share-${y}.csv`)}>Download CSV</button>}</span>}>
      {!share ? <div style={{ padding: 30, color: 'var(--gray-500)' }}>Loading {y}…</div> : share.total === 0 ? <p className="cm-note">No reported cases for these counties.</p> : <>
        <div className="cm-kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div><b>{fmtInt(share.total)}</b><span>reported inpatient cases from residents</span></div>
          <div><b>{fmtPct(inArea / share.total, 0)}</b><span>stayed at hospitals located in the area</span></div>
          <div><b>{fmtInt(share.hhi)}</b><span>HHI, {hhiLabel(share.hhi)}</span></div>
          <div><b>{fmtInt(share.rows.length)}</b><span>hospitals admitted 11 or more patients from at least one ZIP code</span></div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: 420, marginTop: 10 }}>
          <table className="cm-table"><thead><tr><th>Hospital</th><th className="n">Cases</th><th className="n">Share</th><th className="n">Change from {y - 1}</th><th>Located</th></tr></thead>
            <tbody>{share.rows.slice(0, 60).map(r => <tr key={r.c}>
              <td>{byC[r.c] ? <button className="cm-link" onClick={() => onHospital(r.c)}>{name(r.c)}</button> : name(r.c)}<span className="cm-sttag">{place(r.c)}</span></td>
              <td className="n">{fmtInt(r.n)}</td><td className="n">{fmtPct(r.sh)}</td>
              <td className="n" style={{ color: prev[r.c] != null ? (r.sh - prev[r.c] > 0 ? 'var(--teal-dark)' : r.sh - prev[r.c] < 0 ? 'var(--red)' : undefined) : undefined }}>{prev[r.c] != null ? fmtPts(r.sh - prev[r.c]) : 'new'}</td>
              <td>{local.has(r.c) ? 'In the area' : 'Outside'}</td></tr>)}</tbody></table>
        </div>
        <p className="cm-note">{fmtInt(share.sup)} more hospital and ZIP code pairs had 1 to 10 cases each and are not counted, so small and distant hospitals are understated. Counties are assigned from each patient&apos;s ZIP code; a ZIP that crosses a county line counts toward its main county. HHI uses the 2023 merger guideline thresholds and treats each hospital separately; system ownership is not yet included.</p>
      </>}
    </ChartCard>

    <ChartCard title={`Service lines at hospitals in ${scope}`} style={{ marginTop: 14 }}
      sub={`Original Medicare discharges, ${sy}, grouped from MS-DRGs, at hospitals located in the area. Click a service line to see which hospitals lead it.`}
      headerRight={<select value={sy || ''} onChange={e => setSy(+e.target.value)}>{MM.sl_years.slice().reverse().map(v => <option key={v} value={v}>{v}</option>)}</select>}>
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
