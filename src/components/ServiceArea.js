import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa } from 'd3-geo';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import ChartCard from './ChartCard';
import UsMap, { SeqLegend, unionBounds, padBounds } from './UsMap';
import { titleCase, countyTitle } from './HospitalMap';
import { loadSystems, loadGeo, loadMarketsMeta, loadMkt, loadSA, loadSL, loadZips, loadOthers, loadHospitals, marketShare, hhiLabel, quantileBreaks, colorFor, fmtInt, fmtPct, fmtUsd } from '../data';

// Same projection as the us-atlas Albers county file the maps use
const proj = geoAlbersUsa().scale(1300).translate([487.5, 305]);

export default function ServiceArea({ ccn, h }) {
  const [G, setG] = useState(null), [MM, setMM] = useState(null), [S, setS] = useState(null), [Z, setZ] = useState(null), [H, setH] = useState(null), [O, setO] = useState(null);
  const [y, setY] = useState(null), [M, setM] = useState(null), [SL, setSL] = useState(null), [SL0, setSL0] = useState(null);
  const mapRef = useRef(null);
  const [SY, setSY] = useState(null);
  useEffect(() => { loadSystems().then(setSY); }, []);
  useEffect(() => {
    Promise.all([loadGeo(), loadMarketsMeta(), loadSA(h.s || 'NA'), loadZips(), loadHospitals(), loadOthers()]).then(([g, mm, sa, z, hh, o]) => {
      setG(g); setMM(mm); setZ(z); setH(hh); setO(o); const s = sa[ccn] || null; setS(s);
      const ys = s ? Object.keys(s.tot).map(Number).sort() : []; setY(ys.length ? ys[ys.length - 1] : null);
      const sy = mm.sl_years[mm.sl_years.length - 1]; loadSL(sy).then(d => setSL(d[ccn] || null)); loadSL(2019).then(d => setSL0(d[ccn] || null));
    });
  }, [ccn, h.s]);
  useEffect(() => { if (y) loadMkt(y).then(setM); }, [y]);

  const zy = S && S.zips[y] ? y : S ? Math.max(...Object.keys(S.zips).map(Number), 0) || null : null;
  const psaZ = useMemo(() => new Set(S && S.psa[y] ? S.psa[y] : []), [S, y]);
  const ssaZ = useMemo(() => new Set(S && S.ssa[y] ? S.ssa[y] : []), [S, y]);
  const cty = useMemo(() => (S && S.cty[y] ? S.cty[y] : {}), [S, y]);
  const psaCounties = useMemo(() => (Z ? [...new Set([...psaZ].map(z => Z[z] && Z[z][2]).filter(Boolean))] : []), [Z, psaZ]);
  const shareBy = useMemo(() => { if (!M) return {}; const o = {}; Object.keys(cty).forEach(f => { const L = M.cty[f] || []; const t = L.reduce((a, [, n]) => a + n, 0); const me = L.find(([c]) => c === ccn); o[f] = t && me ? me[1] / t : null; }); return o; }, [M, cty, ccn]);
  const shown = useMemo(() => Object.keys(cty).filter(f => cty[f] >= 11 || psaCounties.includes(f)), [cty, psaCounties]);
  const comp = useMemo(() => (M && psaCounties.length ? marketShare(M, psaCounties) : null), [M, psaCounties]);
  const breaks = useMemo(() => [...new Set(quantileBreaks(shown.map(f => shareBy[f]), 6).map(v => Math.round(v * 1000) / 1000))], [shown, shareBy]);
  useEffect(() => {
    if (!G || !mapRef.current || !psaCounties.length) return;
    const s = new Set(psaCounties); mapRef.current.zoomTo(padBounds(unionBounds(G.counties.filter(c => s.has(c.id)).map(c => c.b)), 0.35));
  }, [G, psaCounties.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!G || !MM || !Z) return <div style={{ padding: 30, color: 'var(--gray-500)' }}>Loading service area…</div>;
  if (!S) return <ChartCard title="Service area" style={{ marginTop: 14 }}><p className="cm-note">CMS reports no Medicare inpatient cases by patient ZIP code for this hospital (it may not admit inpatients, or every ZIP code had 10 or fewer cases).</p></ChartCard>;
  const byC = Object.fromEntries((H || []).map(x => [x.c, x]));
  const name = c => (byC[c] ? titleCase(byC[c].n) : O && O[c] ? titleCase(O[c][0]) : `Hospital ${c}`);
  const years = Object.keys(S.tot).map(Number).sort();
  const tot = S.tot[y], prevTot = S.tot[y - 1];
  const zips = S.zips[zy] || [];
  const zt = zips.reduce((t, r) => t + r[1], 0); let cum = 0;
  const zrows = zips.map(([z, n, d]) => { cum += n; return { z, n, d, sh: n / zt, cum: cum / zt, f: Z[z] && Z[z][2], a: psaZ.has(z) ? 'Primary' : ssaZ.has(z) ? 'Secondary' : '' }; });
  const myShare = comp ? (comp.rows.find(r => r.c === ccn) || {}).sh : null;
  const trend = years.map(v => ({ y: v, cases: S.tot[v] }));
  const lines = SL ? Object.entries(SL).map(([k, [d, p]]) => ({ k, d, p, d0: SL0 && SL0[k] ? SL0[k][0] : null })).sort((a, b) => b.d - a.d) : [];
  const slTot = lines.reduce((t, r) => t + r.d, 0);
  const dots = (S.zips[y] ? S.zips[y] : []).map(([z, n]) => { const p = Z[z] ? proj([Z[z][0], Z[z][1]]) : null; return p ? { z, n, p, a: psaZ.has(z) ? 1 : ssaZ.has(z) ? 2 : 3 } : null; }).filter(Boolean);
  const maxN = Math.max(1, ...dots.map(d => d.n));

  return (<>
    <ChartCard title="Service area and market share" style={{ marginTop: 14 }} png csvName={`service-area-counties-${ccn}-${y}`}
      csv={() => [['county_fips', 'county', 'cases_from_county', 'hospital_share_of_county', 'in_primary_service_area'], ...Object.keys(cty).sort((a, b) => cty[b] - cty[a]).map(f => [f, countyTitle(G, f), cty[f], shareBy[f], psaCounties.includes(f) ? 'yes' : 'no']),
        [], ['competitor_ccn', 'competitor', 'cases_in_primary_area_counties', 'share'], ...(comp ? comp.rows.map(r => [r.c, name(r.c), r.n, r.sh]) : [])]}
      sub={`Medicare inpatient cases (Original Medicare and Medicare Advantage) by patient ZIP code, calendar ${y}. The primary service area is the set of ZIP codes that together supply 75% of reported cases; the secondary area takes it to 90%.`}
      headerRight={<select value={y || ''} onChange={e => setY(+e.target.value)}>{years.slice().reverse().map(v => <option key={v} value={v}>{v}</option>)}</select>}>
      <div className="hp-grid" style={{ marginBottom: 12 }}>
        <div className="hp-kpi"><b>{fmtInt(tot)}</b><span>reported Medicare inpatient cases</span><i>{prevTot ? `${tot >= prevTot ? '+' : '−'}${Math.abs((tot / prevTot - 1) * 100).toFixed(1)}% from ${y - 1}` : ''}</i></div>
        <div className="hp-kpi"><b>{fmtInt(psaZ.size)}</b><span>ZIP codes in the primary service area</span><i>{psaCounties.length} {psaCounties.length === 1 ? 'county' : 'counties'}; {fmtInt(ssaZ.size)} more ZIP codes in the secondary area</i></div>
        <div className="hp-kpi"><b>{fmtPct(myShare)}</b><span>share of cases from its primary service area counties</span><i>{comp ? `Market HHI ${fmtInt(comp.hhi)}, ${hhiLabel(comp.hhi)}` : ''}</i></div>
        <div className="hp-kpi"><b>{fmtInt(S.sup[y])}</b><span>other ZIP codes with 1 to 10 cases each</span><i>Not counted in shares or service areas</i></div>
      </div>
      <div className="cm-grid">
        <div>
          {M && <UsMap ref={mapRef} geo={G} focusState={h.f ? h.f.slice(0, 2) : ''} counties={shown} selected={h.f}
            countyFill={f => colorFor(shareBy[f], breaks)} stateFill={() => '#f4f6f8'}
            tip={(k, id) => (k === 'c' ? <><b>{countyTitle(G, id)}</b><br />{fmtInt(cty[id] || 0)} cases from here<br />{fmtPct(shareBy[id])} of the county&apos;s reported cases</> : null)}
            overlay={<g pointerEvents="none">{dots.map(d => <circle key={d.z} cx={d.p[0]} cy={d.p[1]} r={0.35 + 1.6 * Math.sqrt(d.n / maxN)} fill={d.a === 1 ? '#0b1829' : d.a === 2 ? '#2fa59f' : '#adb5bd'} fillOpacity={0.75} />)}</g>}
            legend={<><SeqLegend label="Hospital's share of county cases" breaks={breaks} fmt={v => fmtPct(v, v < 0.2 ? 1 : 0)} />
              <div className="cm-legend"><span><i style={{ background: '#0b1829', borderRadius: 6 }} />primary area ZIP</span><span><i style={{ background: '#2fa59f', borderRadius: 6 }} />secondary</span><span><i style={{ background: '#adb5bd', borderRadius: 6 }} />other</span><span>dot size: cases</span></div></>} />}
        </div>
        <div>
          <div className="cm-kicker" style={{ marginBottom: 6 }}>Competitors in its primary service area counties, {y}</div>
          {comp && <div style={{ overflow: 'auto', maxHeight: 380 }}><table className="cm-table"><thead><tr><th>Hospital</th><th className="n">Cases</th><th className="n">Share</th></tr></thead>
            <tbody>{comp.rows.slice(0, 15).map(r => <tr key={r.c} style={r.c === ccn ? { background: 'var(--teal-light)', fontWeight: 600 } : undefined}>
              <td>{byC[r.c] && r.c !== ccn ? <a href={`#h/${r.c}`}>{name(r.c)}</a> : name(r.c)}{byC[r.c] && byC[r.c].sy && SY && SY[byC[r.c].sy] && <span className="cm-sttag" style={{ color: byC[r.c].sy === h.sy ? 'var(--teal-dark)' : undefined }}>{SY[byC[r.c].sy].n}</span>}</td><td className="n">{fmtInt(r.n)}</td><td className="n">{fmtPct(r.sh)}</td></tr>)}</tbody></table></div>}
          <div style={{ height: 150, marginTop: 10 }}><ResponsiveContainer><LineChart data={trend} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={v => fmtInt(v) + ' cases'} /><Line dataKey="cases" name="Reported cases" stroke="var(--teal-dark)" strokeWidth={2} />
          </LineChart></ResponsiveContainer></div>
        </div>
      </div>
    </ChartCard>

    <ChartCard title={`Patient ZIP codes, ${zy}`} style={{ marginTop: 14 }}
      sub={`Every ZIP code with 11 or more cases. ZIP-level detail is kept for the two latest years; earlier years are summarized by county above.`}
      csvName={`service-area-zips-${ccn}-${zy}`} csv={() => [['zip', 'county_fips', 'county', 'cases', 'days', 'share', 'cumulative_share', 'service_area'], ...zrows.map(r => [r.z, r.f, r.f ? countyTitle(G, r.f) : '', r.n, r.d, r.sh, r.cum, r.a])]}>
      <div style={{ overflow: 'auto', maxHeight: 360 }}><table className="cm-table"><thead><tr><th>ZIP</th><th>County</th><th className="n">Cases</th><th className="n">Days</th><th className="n">Share</th><th className="n">Cumulative</th><th>Area</th></tr></thead>
        <tbody>{zrows.slice(0, 200).map(r => <tr key={r.z}><td>{r.z}</td><td>{r.f ? countyTitle(G, r.f) : 'n/a'}</td><td className="n">{fmtInt(r.n)}</td><td className="n">{fmtInt(r.d)}</td><td className="n">{fmtPct(r.sh)}</td><td className="n">{fmtPct(r.cum, 0)}</td><td>{r.a}</td></tr>)}</tbody></table></div>
    </ChartCard>

    {lines.length > 0 && <ChartCard title={`Service lines, ${MM.sl_years[MM.sl_years.length - 1]}`} style={{ marginTop: 14 }}
      sub="Original Medicare discharges grouped from MS-DRGs, with the change since 2019. CMS lists a DRG only when the hospital had 11 or more discharges in it."
      csvName={`service-lines-${ccn}`} csv={() => [['service_line', 'discharges', 'mix', 'discharges_2019', 'medicare_paid'], ...lines.map(r => [MM.sl[r.k], r.d, r.d / slTot, r.d0 ?? '', r.p])]}>
      <div style={{ overflow: 'auto' }}><table className="cm-table"><thead><tr><th>Service line</th><th className="n">Discharges</th><th className="n">Mix</th><th className="n">Change since 2019</th><th className="n">Medicare paid per discharge</th></tr></thead>
        <tbody>{lines.map(r => <tr key={r.k}><td>{MM.sl[r.k]}</td><td className="n">{fmtInt(r.d)}</td><td className="n">{fmtPct(r.d / slTot)}</td>
          <td className="n" style={{ color: r.d0 ? (r.d > r.d0 ? 'var(--teal-dark)' : r.d < r.d0 ? 'var(--red)' : undefined) : undefined }}>{r.d0 ? `${r.d >= r.d0 ? '+' : '−'}${Math.abs((r.d / r.d0 - 1) * 100).toFixed(0)}%` : 'new'}</td>
          <td className="n">{fmtUsd(r.p / r.d)}</td></tr>)}</tbody></table></div>
    </ChartCard>}
  </>);
}
