import React, { useEffect, useMemo, useRef, useState } from 'react';
import UsMap from './UsMap';
import ChartCard from './ChartCard';
import { titleCase, countyTitle } from './HospitalMap';
import { BASE, loadGeo, fmtInt, fmtPct, FIPS_ST, ST_FIPS, PHYS_URL, NODATA } from '../data';

const cache = {};
const get = u => (cache[u] = cache[u] || fetch(`${BASE}/${u}`).then(r => { if (!r.ok) throw new Error(u); return r.json(); }));
const COL = { F: '#c0392b', T: '#e6a23c', P: '#2fa59f', '-': NODATA };
const LABEL = { F: 'Does not meet', T: 'Meets thinly', P: 'Meets', '-': 'Not scored' };
const KIND = { hospital: 'Hospital', asc: 'Ambulatory surgical center', snf: 'Skilled nursing facility' };
const status = v => { if (!v) return '-'; const [cov, n, mn] = v; if (cov < 0.9 || (mn != null && n < mn)) return 'F'; if (cov < 0.95 || (mn != null && n < 2 * mn)) return 'T'; return 'P'; };
const Loading = () => <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>;

export default function FacilityAdequacy({ route }) {
  const [M, setM] = useState(null), [S, setS] = useState(null), [geo, setGeo] = useState(null), [FAC, setFAC] = useState(null);
  const [type, setType] = useState('040');
  const [list, setList] = useState(null);
  const [st, setSt] = useState({});
  const mapRef = useRef(null);
  useEffect(() => { get('fa_meta.json').then(setM); get('fa_status.json').then(setS); loadGeo().then(setGeo); get('fa_fac.json').then(setFAC); }, []);
  const id = route.id || '';
  const county = /^\d{5}$/.test(id) ? id : null;
  const stAbbr = county ? FIPS_ST[county.slice(0, 2)] : /^[A-Z]{2}$/.test(id) ? id : '';
  const stFips = stAbbr ? ST_FIPS[stAbbr] : '';
  useEffect(() => { if (stAbbr && !st[stAbbr]) get(`fa/${stAbbr}.json`).then(d => setSt(o => ({ ...o, [stAbbr]: d }))); }, [stAbbr, st]);
  useEffect(() => { if (geo && mapRef.current) mapRef.current.zoomTo(stFips ? geo.states.find(s => s.id === stFips)?.b : null); }, [geo, stFips]);
  if (!M || !S || !geo) return <Loading />;
  const codes = M.types.map(t => t[0]);
  const ti = codes.indexOf(type);
  const tname = c => (M.types.find(t => t[0] === c) || [c, c])[1];
  const unit = c => (M.types.find(t => t[0] === c) || [])[2];
  const sname = f => geo.states.find(s => s.id === f)?.name || f;
  const go = h => { window.location.hash = h; };
  const scope = Object.entries(S).filter(([f]) => !stFips || f.slice(0, 2) === stFips);
  const agg = code => { const i = codes.indexOf(code), o = { F: 0, T: 0, P: 0 }; scope.forEach(([, s]) => { if (o[s[i]] != null) o[s[i]]++; }); return o; };
  const cur = agg(type);
  const openList = (code, kind, all = false) => { setType(code); setList({ kind, all, scope: stAbbr }); };
  const c = county && st[stAbbr] ? st[stAbbr][county] : null;
  const tip = (kind, fid) => {
    if (kind === 's') { const o = { F: 0, T: 0 }; Object.entries(S).forEach(([f, s]) => { if (f.slice(0, 2) === fid && o[s[ti]] != null) o[s[ti]]++; }); return <><b>{sname(fid)}</b><br />{o.F} counties do not meet, {o.T} thin<br /><span style={{ opacity: .75 }}>Click to see counties</span></>; }
    const s = S[fid] ? S[fid][ti] : '-';
    return <><b>{countyTitle(geo, fid)}</b><br />{tname(type)}: <b style={{ color: COL[s] }}>{LABEL[s]}</b><br /><span style={{ opacity: .75 }}>Click for every facility type</span></>;
  };
  const countyIds = stFips ? geo.counties.filter(x => x.id.slice(0, 2) === stFips).map(x => x.id) : null;
  return (
    <div>
      <div className="card" style={{ padding: '14px 16px', marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label className="cm-field">Facility type
          <select value={type} onChange={e => setType(e.target.value)}>{M.types.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}</select></label>
        <label className="cm-field">State
          <select value={stAbbr} onChange={e => go(`#adequacy/${e.target.value}`)}><option value="">All states</option>{Object.keys(ST_FIPS).filter(a => geo.states.some(s => s.id === ST_FIPS[a])).sort().map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        <div style={{ fontSize: 13, flex: '1 1 380px' }}>
          <button className="cm-link" style={{ color: COL.F, fontWeight: 700 }} onClick={() => openList(type, 'F')}>{fmtInt(cur.F)}</button> counties {stAbbr ? `in ${sname(stFips)} ` : ''}do not meet the {tname(type)} standard, <button className="cm-link" style={{ color: '#b07a1f', fontWeight: 700 }} onClick={() => openList(type, 'T')}>{fmtInt(cur.T)}</button> meet it thinly and {fmtInt(cur.P)} meet it, counting every Medicare-certified facility. <button className="cm-link" onClick={() => openList(type, 'FT')}>See them as a list</button>
        </div>
      </div>
      <div className="na-banner" style={{ marginBottom: 14 }}>Medicare Advantage facility standards only (CMS 2026 HSD Reference File). This tests the market, not a plan&apos;s network: could a plan contract with enough facilities here? Distance is straight-line from Census tract population centers to facility ZIP code centers, not drive time. Clinician standards are in the <a href={`${PHYS_URL}/#adequacy${county ? '/' + county : stAbbr ? '/' + stAbbr : ''}`} target="_blank" rel="noreferrer">Physician &amp; Practice Explorer</a>.</div>
      <div className="cm-grid">
        <ChartCard title={`${tname(type)}: can the market meet the standard? ${stAbbr ? sname(stFips) : 'United States'}`} sub="Counties by whether every Medicare-certified facility of this type in reach would meet the minimum number and maximum distance. Click a state, then a county.">
          <UsMap ref={mapRef} geo={geo} mode={stFips ? 'states' : 'counties'} focusState={stFips} counties={countyIds} selected={county}
            stateFill={() => '#f3f5f8'} countyFill={f => COL[S[f] ? S[f][ti] : '-']}
            onState={sf => go(sf ? `#adequacy/${FIPS_ST[sf]}` : '#adequacy')} onCounty={f => go(`#adequacy/${f}`)} tip={tip}
            legend={<div className="cm-legend" style={{ display: 'flex', gap: 14, fontSize: 12, marginTop: 6 }}>{['F', 'T', 'P', '-'].map(k => <span key={k}><i style={{ display: 'inline-block', width: 10, height: 10, background: COL[k], marginRight: 5, borderRadius: 2 }} />{LABEL[k]}</span>)}</div>} />
        </ChartCard>
        <ChartCard title={`Every facility type, ${stAbbr ? sname(stFips) : 'United States'}`} sub="Counties that do not meet each standard, or meet it thinly. Click a count to list them.">
          <table className="cm-table"><thead><tr><th>Facility type</th><th className="n">Facilities</th><th className="n">Do not meet</th><th className="n">Thin</th></tr></thead>
            <tbody>{M.types.map(t => { const o = agg(t[0]); return <tr key={t[0]} className={t[0] === type ? 'on' : ''}><td><button className="cm-link" onClick={() => setType(t[0])}>{t[1]}</button></td>
              <td className="n">{fmtInt(M.counts[t[0]])}</td>
              <td className="n">{o.F ? <button className="cm-link" style={{ color: COL.F, fontWeight: 600 }} onClick={() => openList(t[0], 'F')}>{fmtInt(o.F)}</button> : 0}</td>
              <td className="n">{o.T ? <button className="cm-link" onClick={() => openList(t[0], 'T')}>{fmtInt(o.T)}</button> : 0}</td></tr>; })}</tbody></table>
          <p className="cm-note" style={{ marginTop: 6 }}><button className="cm-link" onClick={() => openList(type, 'FT', true)}>List every gap in {stAbbr ? sname(stFips) : 'the country'}</button></p>
          <p className="cm-note">Not scored, because public files do not identify these facilities: {M.not_scored.join(', ')}.</p>
        </ChartCard>
      </div>
      {!county && list && <IssuesCard list={list} setList={setList} type={type} setType={setType} M={M} geo={geo} S={S} stFips={stFips} stAbbr={stAbbr} tname={tname} unit={unit} />}
      {county && list && <div style={{ margin: '10px 0 0', fontSize: 13 }}><a href={`#adequacy/${list.scope || ''}`}>← Back to the list of counties</a></div>}
      {county && !c && <Loading />}
      {county && c && <CountyPanel f={county} c={c} type={type} setType={setType} M={M} geo={geo} FAC={FAC} tname={tname} unit={unit} />}
    </div>
  );
}

function CountyPanel({ f, c, type, setType, M, geo, FAC, tname, unit }) {
  const v = c.s[type];
  const rows = v && FAC ? v[4].map(i => ({ i, f: FAC[i] })).filter(r => r.f) : [];
  rows.sort((a, b) => (b.f[6] || 0) - (a.f[6] || 0) || a.f[0].localeCompare(b.f[0]));
  return (<>
    <ChartCard style={{ marginTop: 14 }} title={`${countyTitle(geo, f)}: facility standards`} sub={`${c.des} county · ${fmtInt(c.b)} Medicare beneficiaries (HSD reference). Coverage is the share of residents within the maximum distance of at least one facility; the count is every facility of the type within that distance of some part of the county.`}
      headerRight={<a className="cm-link" href={`${PHYS_URL}/#adequacy/${f}`} target="_blank" rel="noreferrer">Clinician standards for this county</a>}
      csvName={`facility-adequacy-${f}`} csv={() => [['facility_type_code', 'facility_type', 'status', 'residents_covered', 'in_reach', 'unit', 'minimum', 'max_miles'],
        ...M.types.map(t => { const x = c.s[t[0]]; return x ? [t[0], t[1], LABEL[status(x)], x[0], x[1], t[2], x[2] ?? '', x[3]] : [t[0], t[1], 'Not scored', '', '', t[2], '', '']; })]}>
      <div className="tbl-scroll"><table className="cm-table"><thead><tr><th>Facility type</th><th>Status</th><th className="n">Residents covered</th><th className="n">In reach</th><th className="n">Minimum</th><th className="n">Max miles</th></tr></thead>
        <tbody>{M.types.map(t => { const x = c.s[t[0]], s = status(x); return <tr key={t[0]} className={t[0] === type ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setType(t[0])}>
          <td>{t[1]}</td><td><span style={{ color: s === 'T' ? '#b07a1f' : COL[s], fontWeight: 600 }}>{LABEL[s]}</span></td>
          <td className="n">{x ? fmtPct(x[0], 0) : ''}</td><td className="n">{x ? `${fmtInt(x[1])}${t[2] === 'beds' ? ' beds' : ''}` : ''}</td><td className="n">{x && x[2] != null ? `${x[2]}${t[2] === 'beds' ? ' beds' : ''}` : ''}</td><td className="n">{x ? x[3] : ''}</td></tr>; })}</tbody></table></div>
      <p className="cm-note">Click a row to list its facilities below.</p>
    </ChartCard>
    <ChartCard style={{ marginTop: 14 }} title={`${tname(type)} in reach of ${countyTitle(geo, f)}: ${fmtInt(rows.length)}`} sub={`Every Medicare-certified facility of this type within ${v ? v[3] : ''} miles of at least one Census tract center in the county.${unit(type) === 'beds' ? ' Beds are adult, pediatric and intensive care beds from the latest cost report.' : ''}`}
      csvName={`facilities-${type}-${f}`} csv={() => [['id', 'name', 'kind', 'city', 'state', 'zip', 'ccn_or_pos_number', 'beds'], ...rows.map(r => [r.i, r.f[0], KIND[r.f[1]], r.f[2], r.f[3], r.f[4], r.f[5], r.f[6] ?? ''])]}>
      {!FAC ? <Loading /> : rows.length ? <div className="tbl-scroll" style={{ maxHeight: 520, overflowY: 'auto' }}><table className="cm-table"><thead><tr><th>Facility</th><th>Kind</th><th>Location</th><th className="n">Beds</th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.i}><td>{r.f[1] === 'hospital' ? <a href={`#h/${r.f[5]}`}>{titleCase(r.f[0])}</a> : titleCase(r.f[0])}</td><td>{KIND[r.f[1]]}</td><td>{titleCase(r.f[2])}, {r.f[3]} {r.f[4]}</td><td className="n">{r.f[6] ? fmtInt(r.f[6]) : ''}</td></tr>)}</tbody></table></div>
        : <p className="cm-note">No facility of this type is within reach.</p>}
    </ChartCard>
  </>);
}

function IssuesCard({ list, setList, type, setType, M, geo, S, stFips, stAbbr, tname, unit }) {
  const [rows, setRows] = useState(null);
  const [sort, setSort] = useState('cov');
  const codes = useMemo(() => M.types.map(t => t[0]), [M]);
  const fips = useMemo(() => Object.entries(S).filter(([f, s]) => (!stFips || f.slice(0, 2) === stFips) && (list.all ? codes : [type]).some(c => { const x = s[codes.indexOf(c)]; return list.kind === 'FT' ? x === 'F' || x === 'T' : x === list.kind; })).map(([f]) => f), [S, stFips, list, type, codes]);
  useEffect(() => {
    let live = true;
    const states = [...new Set(fips.map(f => FIPS_ST[f.slice(0, 2)]))];
    Promise.all(states.map(a => get(`fa/${a}.json`))).then(ds => {
      if (!live) return;
      const all = Object.assign({}, ...ds), out = [];
      for (const f of fips) { const c = all[f]; if (!c) continue;
        for (const code of (list.all ? codes : [type])) { const x = c.s[code], s = status(x); if (!x || !(list.kind === 'FT' ? s === 'F' || s === 'T' : s === list.kind)) continue;
          out.push({ f, code, k: s, cov: x[0], n: x[1], min: x[2], mi: x[3], b: c.b, des: c.des }); } }
      setRows(out);
    });
    return () => { live = false; };
  }, [fips, list, type, codes]);
  const SORTS = { cov: (a, b) => a.cov - b.cov || a.n - b.n, b: (a, b) => (b.b || 0) - (a.b || 0), county: (a, b) => countyTitle(geo, a.f).localeCompare(countyTitle(geo, b.f)) };
  const sorted = (rows || []).slice().sort((a, b) => (a.k === b.k ? 0 : a.k === 'F' ? -1 : 1) || SORTS[sort](a, b));
  const std = list.all ? 'the facility standards' : `the ${tname(type)} standard`, it = list.all ? 'them' : 'it';
  const what = list.kind === 'F' ? `do not meet ${std}` : list.kind === 'T' ? `meet ${std} thinly` : `do not meet ${std} or meet ${it} thinly`;
  const chip = (on, label, fn) => <button className={`cm-chip ${on ? 'on' : ''}`} onClick={fn}>{label}</button>;
  const th = (k, label, cls) => <th className={cls} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => setSort(k)}>{label}{sort === k ? ' ▾' : ''}</th>;
  return (
    <ChartCard style={{ marginTop: 14 }} title={rows ? `${fmtInt(sorted.length)} ${list.all ? 'county and facility type combinations' : sorted.length === 1 ? 'county' : 'counties'} in ${stAbbr ? geo.states.find(s => s.id === stFips)?.name : 'the United States'} ${what}` : 'Loading counties…'}
      sub="Click a county to see every facility type and the facilities in reach."
      headerRight={<button className="cm-chip" onClick={() => setList(null)}>Close list</button>}
      csvName={`facility-adequacy-issues-${list.all ? 'all' : type}-${stAbbr || 'us'}`}
      csv={() => [['county_fips', 'county', 'designation', 'facility_type_code', 'facility_type', 'status', 'residents_covered', 'in_reach', 'unit', 'minimum', 'max_miles', 'beneficiaries'],
        ...sorted.map(r => [r.f, countyTitle(geo, r.f), r.des, r.code, tname(r.code), LABEL[r.k], r.cov, r.n, unit(r.code), r.min ?? '', r.mi, r.b ?? ''])]}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {chip(list.kind === 'F', 'Do not meet', () => setList({ ...list, kind: 'F' }))}
        {chip(list.kind === 'T', 'Thin', () => setList({ ...list, kind: 'T' }))}
        {chip(list.kind === 'FT', 'Both', () => setList({ ...list, kind: 'FT' }))}
        <span style={{ width: 12 }} />
        {chip(!list.all, tname(type), () => setList({ ...list, all: false }))}
        {chip(list.all, 'All facility types', () => setList({ ...list, all: true }))}
      </div>
      {rows && (sorted.length ? <div className="tbl-scroll" style={{ maxHeight: 520, overflowY: 'auto' }}><table className="cm-table">
        <thead><tr>{th('county', 'County')}<th>Designation</th>{list.all && <th>Facility type</th>}<th>Status</th>{th('cov', 'Residents covered', 'n')}<th className="n">In reach</th><th className="n">Minimum</th><th className="n">Max miles</th>{th('b', 'Beneficiaries', 'n')}</tr></thead>
        <tbody>{sorted.map(r => <tr key={r.f + r.code} style={{ cursor: 'pointer' }} onClick={() => { setType(r.code); window.location.hash = `#adequacy/${r.f}`; }}>
          <td><a href={`#adequacy/${r.f}`} onClick={e => { e.stopPropagation(); setType(r.code); }}>{countyTitle(geo, r.f)}</a></td><td>{r.des}</td>{list.all && <td>{tname(r.code)}</td>}
          <td><span style={{ color: r.k === 'F' ? COL.F : '#b07a1f', fontWeight: 600 }}>{LABEL[r.k]}</span></td><td className="n">{fmtPct(r.cov, 0)}</td>
          <td className="n">{fmtInt(r.n)}{unit(r.code) === 'beds' ? ' beds' : ''}</td><td className="n">{r.min ?? ''}</td><td className="n">{r.mi}</td><td className="n">{r.b != null ? fmtInt(r.b) : ''}</td></tr>)}</tbody></table></div>
        : <p className="cm-note">None in this scope.</p>)}
    </ChartCard>
  );
}
