import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ChartCard from './ChartCard';
import MarketPanel from './MarketPanel';
import UsMap, { SeqLegend, DivLegend, visibleCounties, unionBounds } from './UsMap';
import {
  loadQuality, loadGeo, loadHospitals, loadYear, quantileBreaks, colorFor, divBreaks, divColor, fmtInt, fmtPct, fmtUsdM, fmtDays,
  ST_FIPS, FIPS_ST, MEASURES, FTYPE_ORDER, rollup, MA_URL, MSSP_URL,
} from '../data';

const DEFAULT_TYPES = ['STH', 'CAH'];
const COLS = [['n', 'Hospital'], ['beds', 'Beds'], ['npr', 'Net patient revenue'], ['tm', 'Total margin'], ['pm', 'Patient margin'], ['dcoh', 'Days cash'], ['occ', 'Occupancy']];

export default function HospitalMap({ meta, route, onHospital }) {
  const [geo, setGeo] = useState(null);
  const [H, setH] = useState(null);
  const [Y, setY] = useState(null), [QD, setQD] = useState(null);
  useEffect(() => { loadQuality().then(setQD); }, []);
  const [err, setErr] = useState(null);
  const [year, setYear] = useState(meta.years[meta.years.length - 1]);
  const [measure, setMeasure] = useState('tm');
  const [types, setTypes] = useState(DEFAULT_TYPES);
  const [stateFips, setStateFips] = useState('');
  const [county, setCounty] = useState(null);
  const [area, setArea] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [sort, setSort] = useState('npr');
  const [q, setQ] = useState('');
  const mapRef = useRef(null);

  useEffect(() => { Promise.all([loadGeo(), loadHospitals()]).then(([g, h]) => { setGeo(g); setH(h); }).catch(e => setErr(String(e))); }, []);
  useEffect(() => { setY(null); loadYear(year).then(setY).catch(e => setErr(String(e))); }, [year]);

  // Hospital-year rows for this year and the chosen facility types, joined to attributes
  const rows = useMemo(() => {
    if (!H || !Y) return [];
    const T = new Set(types), out = [];
    Y.byIdx.forEach((r, i) => { const h = H[i]; if (h && T.has(h.t)) out.push({ ...r, h, q: QD ? QD.h[h.c] : null }); });
    return out;
  }, [H, Y, types, QD]);
  const byCounty = useMemo(() => { const o = {}; rows.forEach(r => { if (r.h.f) (o[r.h.f] = o[r.h.f] || []).push(r); }); return o; }, [rows]);
  const byState = useMemo(() => { const o = {}; rows.forEach(r => { const f = ST_FIPS[r.h.s]; if (f) (o[f] = o[f] || []).push(r); }); return o; }, [rows]);
  const cAgg = useMemo(() => Object.fromEntries(Object.entries(byCounty).map(([k, L]) => [k, rollup(L)])), [byCounty]);
  const sAgg = useMemo(() => Object.fromEntries(Object.entries(byState).map(([k, L]) => [k, rollup(L)])), [byState]);
  const M = MEASURES[measure];
  const val = a => (a ? a[measure] : null);

  const countyIds = useMemo(() => visibleCounties(geo, stateFips, area), [geo, stateFips, area]);
  const drilled = !!(stateFips || area);
  const shown = drilled ? countyIds.map(id => val(cAgg[id])) : Object.keys(sAgg).map(k => val(sAgg[k]));
  const breaks = useMemo(() => (M.div ? divBreaks(shown) : quantileBreaks(shown, 7)), [M.div, shown.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const fill = v => (M.div ? divColor(v, breaks) : colorFor(v, breaks));

  const hash = (sf, ct, ar) => window.history.replaceState(null, '', ar ? `#map/area/${ar.join(',')}` : ct ? `#map/${ct}` : sf && FIPS_ST[sf] ? `#map/${FIPS_ST[sf]}` : '#map');
  const zoomIds = useCallback(ids => { if (mapRef.current && geo && ids) { const s = new Set(ids); mapRef.current.zoomTo(unionBounds(geo.counties.filter(c => s.has(c.id)).map(c => c.b))); } }, [geo]);
  const pickState = useCallback(sf => {
    setStateFips(sf); setCounty(null); setArea(null); setSelectMode(false);
    if (mapRef.current && geo) mapRef.current.zoomTo(sf ? geo.states.find(s => s.id === sf)?.b : null);
    hash(sf, null, null);
  }, [geo]);
  const setAreaIds = useCallback((ids, zoom) => {
    const a = ids && ids.length ? [...new Set(ids)] : null;
    setArea(a); setCounty(null); setSelectMode(false); if (zoom) zoomIds(a); hash(stateFips, null, a);
  }, [zoomIds, stateFips]);
  const pickCounty = useCallback((id, shift) => {
    if (shift && id) { const cur = area || []; setAreaIds(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id], false); return; }
    setCounty(id);
    if (id && !area && id.slice(0, 2) !== stateFips && !countyIds.includes(id)) { setStateFips(id.slice(0, 2)); if (mapRef.current && geo) mapRef.current.zoomTo(geo.states.find(s => s.id === id.slice(0, 2))?.b); }
    hash(stateFips, id, id ? null : area);
  }, [area, stateFips, countyIds, geo, setAreaIds]);
  useEffect(() => {
    if (!geo || !route.id) return;
    if (route.id === 'area' && route.sub) setAreaIds(route.sub.split(',').filter(x => /^\d{5}$/.test(x)), true);
    else if (/^\d{5}$/.test(route.id)) { setStateFips(route.id.slice(0, 2)); setCounty(route.id); mapRef.current && mapRef.current.zoomTo(geo.states.find(s => s.id === route.id.slice(0, 2))?.b); }
    else if (ST_FIPS[route.id]) pickState(ST_FIPS[route.id]);
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectMode) return undefined;
    const k = e => { if (e.key === 'Escape') setSelectMode(false); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [selectMode]);

  if (err) return <div className="card" style={{ padding: 24 }}>The hospital data could not be loaded ({err}). Try reloading the page.</div>;
  if (!geo || !H) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading hospital map…</div>;

  // Scope: a county, a selected area, a state or the U.S.
  const areaSet = new Set(area || []);
  const stName = sf => geo.states.find(s => s.id === sf)?.name;
  const scopeRows = county ? (byCounty[county] || []) : area ? rows.filter(r => areaSet.has(r.h.f)) : stateFips ? (byState[stateFips] || []) : rows;
  const S = rollup(scopeRows);
  const scopeName = county ? `${countyTitle(geo, county)}` : area ? `Selected area: ${area.length} ${area.length === 1 ? 'county' : 'counties'} in ${[...new Set(area.map(id => FIPS_ST[id.slice(0, 2)]))].sort().join(', ')}` : stateFips ? stName(stateFips) : 'United States';
  const ql = q.trim().toLowerCase();
  const list = (ql ? rows.filter(r => r.h.n.toLowerCase().includes(ql) || (r.h.ci || '').toLowerCase().includes(ql) || r.h.c.includes(ql)) : scopeRows)
    .slice().sort((a, b) => (sort === 'n' ? a.h.n.localeCompare(b.h.n) : (b[sort] ?? -1e15) - (a[sort] ?? -1e15)));

  const tip = (kind, id) => {
    const a = kind === 'c' ? cAgg[id] : sAgg[id]; const nm = kind === 'c' ? countyTitle(geo, id) : stName(id);
    return <><b>{nm}</b><br />{M.label}: <b>{a && val(a) != null ? M.fmt(val(a)) : 'no data'}</b>
      {a ? <><br />{a.n} {a.n === 1 ? 'hospital' : 'hospitals'}, {fmtInt(a.beds)} beds</> : <><br />No hospitals of the selected types</>}
      {kind === 's' && <><br /><span style={{ opacity: .75 }}>Click to see counties</span></>}</>;
  };

  return (
    <div>
      <div className="card" style={{ padding: '14px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label className="cm-field">Measure
          <select value={measure} onChange={e => setMeasure(e.target.value)}>{Object.entries(MEASURES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</select></label>
        <label className="cm-field">Cost report year
          <select value={year} onChange={e => setYear(+e.target.value)}>{meta.years.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}</select></label>
        <label className="cm-field">State
          <select value={stateFips} onChange={e => pickState(e.target.value)}><option value="">All states</option>{geo.states.slice().sort((a, b) => a.name.localeCompare(b.name)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="cm-field">Hospital types
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{FTYPE_ORDER.map(t => <button key={t} className={`cm-chip ${types.includes(t) ? 'on' : ''}`}
            onClick={() => setTypes(T => (T.includes(t) ? (T.length > 1 ? T.filter(x => x !== t) : T) : [...T, t]))}>{meta.ftype[t]}</button>)}</div></div>
        {(stateFips || county || area) && <button className="cm-chip" style={{ marginLeft: 'auto' }} onClick={() => pickState('')}>Back to the U.S.</button>}
      </div>

      <div className="cm-grid">
        <ChartCard title={`${M.label}, ${area ? 'selected area' : stateFips ? stName(stateFips) : 'United States'}, ${year}`}
          sub={`${M.sub}. ${area ? 'Click a county to list its hospitals; shift-click to add or remove counties.' : stateFips ? 'Click a county to list its hospitals. Counties across the state line are shown too; use Select an area to combine counties from more than one state.' : 'Click a state to see its counties, or use Select an area to drag a box around any market.'}`}
          filename={`hospitals-${drilled ? 'county' : 'state'}-${measure}-${year}`}
          csv={() => [[drilled ? 'county_fips' : 'state', drilled ? 'county' : 'state_name', measure, 'hospitals', 'beds', 'net_patient_revenue'],
            ...(drilled ? countyIds.map(id => [id, countyTitle(geo, id), val(cAgg[id]), cAgg[id] ? cAgg[id].n : 0, cAgg[id] ? cAgg[id].beds : 0, cAgg[id] ? cAgg[id].npr : 0])
              : Object.keys(sAgg).sort().map(k => [FIPS_ST[k], stName(k), val(sAgg[k]), sAgg[k].n, sAgg[k].beds, sAgg[k].npr]))]}>
          {!Y ? <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading {year}…</div> :
            <UsMap ref={mapRef} geo={geo} focusState={stateFips} counties={countyIds} area={area} selected={county}
              stateFill={sf => fill(val(sAgg[sf]))} countyFill={id => fill(val(cAgg[id]))}
              onState={pickState} onCounty={pickCounty} onSelectBox={ids => ids.length && setAreaIds(ids, true)} selectMode={selectMode} tip={tip}
              extraButtons={<>
                {area && <button type="button" className="w" onClick={() => zoomIds(area)}>Fit area</button>}
                <button type="button" className={`w${selectMode ? ' on' : ''}`} onClick={() => setSelectMode(m => !m)}>{selectMode ? 'Cancel' : 'Select an area'}</button></>}
              legend={M.div ? <DivLegend label={drilled ? 'Counties' : 'States'} breaks={breaks} fmt={M.fmt} /> : <SeqLegend label={drilled ? 'Counties' : 'States'} breaks={breaks} fmt={M.fmt} />} />}
        </ChartCard>

        <div className="card cm-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div><div className="cm-kicker">{year} cost reports · {types.map(t => meta.ftype[t]).join(', ')}</div><div className="cm-h">{scopeName}</div></div>
            {county ? <button className="cm-chip" onClick={() => pickCounty(null)}>Close</button> : area ? <button className="cm-chip" onClick={() => setAreaIds(null, false)}>Clear area</button> : null}
          </div>
          <div className="cm-kpis">
            <div><b>{fmtInt(S.n)}</b><span>hospitals, {fmtInt(S.beds)} beds</span></div>
            <div><b>{fmtUsdM(S.npr)}</b><span>net patient revenue</span></div>
            <div><b style={{ color: S.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(S.tm)}</b><span>total margin, combined (median hospital {fmtPct(S.tm_med)})</span></div>
            <div><b>{fmtPct(S.loss, 0)}</b><span>of hospitals lost money</span></div>
            <div><b>{fmtPct(S.pm)}</b><span>patient service margin, combined</span></div>
            <div><b>{fmtDays(S.dcoh)}</b><span>cash on hand, median hospital</span></div>
            <div><b>{fmtPct(S.mcr)}</b><span>of inpatient days are Original Medicare; {fmtPct(S.mcd)} Medicaid</span></div>
            <div><b>{fmtPct(S.unc)}</b><span>of costs are uncompensated care</span></div>
          </div>
          <p className="cm-note">{S.n - S.clean > 0 ? `${S.n - S.clean} of ${S.n} ${S.n - S.clean === 1 ? 'report is' : 'reports are'} left out of margins and medians because they cover part of a year or have missing or implausible revenue. ` : ''}Combined margins weight each hospital by its revenue; the median hospital shows the typical one. Patient service margin leaves out other income (investment income, grants, contributions and some operating revenue), so it often runs below zero even for strong hospitals. <a href="#methodology">How these are calculated</a></p>
          {county && <p className="cm-note">Medicare Advantage and ACO activity in this county: <a href={`${MA_URL}/#map/${county}`} target="_blank" rel="noreferrer">MA Enrollment Explorer</a> · <a href={`${MSSP_URL}/#map/${county}`} target="_blank" rel="noreferrer">MSSP Explorer</a></p>}
        </div>
      </div>

      <ChartCard title={ql ? `Hospitals matching "${q}"` : `Hospitals in ${scopeName.replace(/^Selected area: /, 'the selected area: ')}`} style={{ marginTop: 14 }}
        sub={`${year} cost reports. Click a column to sort, a hospital for its full profile. Grey rows are left out of combined figures (see the note above).`}
        headerRight={<input className="cm-search" placeholder="Find a hospital by name, city or CCN" value={q} onChange={e => setQ(e.target.value)} />}
        csvName={`hospitals-${county || (area ? 'area' : FIPS_ST[stateFips] || 'us')}-${year}`}
        csv={() => ([['ccn', 'hospital', 'city', 'state', 'county_fips', 'type', 'control', 'beds', 'net_patient_revenue', 'total_revenue', 'net_income', 'total_margin', 'patient_service_margin', 'days_cash_on_hand', 'occupancy', 'excluded_from_combined'],
            ...list.map(r => [r.h.c, r.h.n, r.h.ci, r.h.s, r.h.f, meta.ftype[r.h.t], meta.ctrl[r.h.g], r.beds, r.npr, r.rev, r.ni, r.tm, r.pm, r.dcoh, r.occ, r.flag ? 'yes' : 'no'])])}>
        <div style={{ overflow: 'auto', maxHeight: 520 }}>
          <table className="cm-table"><thead><tr>
            {COLS.map(([k, l]) => <th key={k} className={k === 'n' ? '' : 'n'} style={{ cursor: 'pointer', color: sort === k ? 'var(--teal-dark)' : undefined }} onClick={() => setSort(k)}>{l}{sort === k ? ' ▾' : ''}</th>)}
            <th>Type</th></tr></thead>
            <tbody>{list.slice(0, 400).map(r => <tr key={r.h.c} style={r.flag ? { color: 'var(--gray-500)' } : undefined}>
              <td><button className="cm-link" onClick={() => onHospital(r.h.c)}>{titleCase(r.h.n)}</button><span className="cm-sttag">{titleCase(r.h.ci || '')}, {r.h.s}</span></td>
              <td className="n">{fmtInt(r.beds)}</td><td className="n">{fmtUsdM(r.npr)}</td>
              <td className="n" style={{ color: r.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(r.tm)}</td><td className="n">{fmtPct(r.pm)}</td>
              <td className="n">{r.dcoh != null ? Math.round(r.dcoh) : 'n/a'}</td><td className="n">{fmtPct(r.occ, 0)}</td>
              <td>{meta.ftype[r.h.t]}</td></tr>)}</tbody></table>
          {list.length > 400 && <p className="cm-note">Showing 400 of {list.length.toLocaleString()} hospitals. Narrow to a state or county, or download the CSV for all of them.</p>}
        </div>
      </ChartCard>

      {(county || area || stateFips) ? <MarketPanel key={county || (area ? area.join(',') : stateFips)} H={H} onHospital={onHospital} scopeName={scopeName}
        fips={county ? [county] : area ? area : geo.counties.filter(c => c.id.slice(0, 2) === stateFips).map(c => c.id)} />
        : <p className="cm-note" style={{ marginTop: 14 }}>Pick a state, click a county or select an area to see where its Medicare patients are admitted and which hospitals lead each service line.</p>}

      <p className="cm-note" style={{ marginTop: 10 }}>Source: CMS Hospital Provider Cost Report public use file ({meta.years[0]} to {meta.years[meta.years.length - 1]}), from the Healthcare Cost Report Information System. Cost reports are filed for Medicare and are not audited financial statements. See <a href="#methodology">Methodology</a>.</p>
    </div>
  );
}

export const titleCase = s => (s || '').toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase()).replace(/\b(Of|And|The|For|At|In)\b/g, m => m.toLowerCase()).replace(/^./, m => m.toUpperCase())
  .replace(/\b(Llc|Lp|Inc|Ii|Iii|Iv|Va|Uc|Ucsf|Ucla|Usc|Nyu|Md|Dc|Ny)\b/g, m => m.toUpperCase());
export function countyTitle(geo, id) {
  const g = geo.counties.find(c => c.id === id); const st = FIPS_ST[id.slice(0, 2)];
  return g && g.n ? `${g.n}${/^(AK|LA|DC|PR)$/.test(st) || / (city|Borough|Census Area|Municipality)$/i.test(g.n) ? '' : ' County'}, ${st}` : `County ${id}`;
}
