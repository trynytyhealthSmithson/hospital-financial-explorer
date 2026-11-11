import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import ChartCard from './ChartCard';
import UsMap, { SeqLegend, unionBounds, padBounds } from './UsMap';
import { titleCase, countyTitle } from './HospitalMap';
import { loadOwnership, loadAco, MSSP_URL, PHYS_URL, load340b, loadOpIdx, loadHcrisIdx, loadSystems, loadHospitals, loadYear, loadGeo, loadMarketsMeta, loadMkt, loadSL, quantileBreaks, colorFor, fmtInt, fmtPct, fmtUsdM } from '../data';

const NOTE = 'Systems come from the AHRQ Compendium of U.S. Health Systems, 2023: hospitals are grouped by their corporate parent. Membership is as of 2023 and is applied to every year, so earlier years show today’s systems, not the ones that existed then.';

export function SystemList({ meta }) {
  const [S, setS] = useState(null), [q, setQ] = useState(''), [sort, setSort] = useState('npr');
  useEffect(() => { loadSystems().then(setS); }, []);
  const Ly = String(meta.years[meta.years.length - 1]);
  const rows = useMemo(() => (S ? Object.entries(S).map(([id, s]) => ({ id, ...(s.y && s.y[Ly] ? s.y[Ly] : {}), ...s, nh: s.h.length })) : []), [S, Ly]);
  if (!S) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>;
  const ql = q.trim().toLowerCase();
  const list = rows.filter(r => !ql || r.n.toLowerCase().includes(ql) || (r.ci || '').toLowerCase().includes(ql) || r.st.join(' ').toLowerCase().includes(ql))
    .sort((a, b) => (sort === 'n' ? a.n.localeCompare(b.n) : (b[sort] ?? -1e15) - (a[sort] ?? -1e15)));
  const C = [['n', 'System'], ['nh', 'Hospitals'], ['states', 'States'], ['beds', 'Beds'], ['npr', 'Net patient revenue'], ['tm', 'Combined total margin'], ['tm_med', 'Median hospital margin'],
    ['mmm', 'Medicare inpatient margin'], ['mapen', 'MA share of Medicare days'], ['age', 'Age of plant (years)']];
  return (
    <ChartCard title={`${fmtInt(rows.length)} health systems with two or more hospitals`} sub={`${Ly} cost reports for their member hospitals. Medicare inpatient margin, Medicare Advantage share and age of plant pool member hospitals from the full cost report files. ${NOTE}`}
      headerRight={<input className="cm-search" placeholder="Find a system by name, city or state" value={q} onChange={e => setQ(e.target.value)} />}
      csvName={`health-systems-${Ly}`} csv={() => [['system_id', 'system', 'hq_city', 'hq_state', 'hospitals', 'states', 'beds', 'net_patient_revenue', 'net_income', 'combined_total_margin', 'median_hospital_margin', 'medicare_ffs_inpatient_margin', 'ma_share_of_medicare_days', 'medicare_share_of_days_incl_ma', 'average_age_of_plant_years', 'medicare_addon_payments'], ...list.map(r => [r.id, r.n, r.ci, r.s, r.nh, r.st.join(' '), r.beds, r.npr, r.ni, r.tm, r.tm_med, r.mmm ?? '', r.mapen ?? '', r.mall ?? '', r.age ?? '', r.add ?? ''])]}>
      <div style={{ overflow: 'auto', maxHeight: 640 }}><table className="cm-table"><thead><tr>
        {C.map(([k, l]) => <th key={k} className={k === 'n' ? '' : 'n'} style={{ cursor: 'pointer', color: sort === k ? 'var(--teal-dark)' : undefined }} onClick={() => k !== 'states' && setSort(k)}>{l}{sort === k ? ' ▾' : ''}</th>)}</tr></thead>
        <tbody>{list.map(r => <tr key={r.id}><td><a href={`#sys/${r.id}`}>{r.n}</a>{r.ci && <span className="cm-sttag">{titleCase(r.ci)}, {r.s}</span>}</td><td className="n">{r.nh}</td>
          <td className="n" style={{ fontSize: 11 }}>{r.st.length > 4 ? `${r.st.length} states` : r.st.join(', ')}</td><td className="n">{fmtInt(r.beds)}</td><td className="n">{fmtUsdM(r.npr)}</td>
          <td className="n" style={{ color: r.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(r.tm)}</td><td className="n">{fmtPct(r.tm_med)}</td>
          <td className="n" style={{ color: r.mmm < 0 ? 'var(--red)' : undefined }}>{r.mmm == null ? '' : fmtPct(r.mmm)}</td><td className="n">{r.mapen == null ? '' : fmtPct(r.mapen, 0)}</td><td className="n">{r.age == null ? '' : r.age.toFixed(1)}</td></tr>)}</tbody></table></div>
    </ChartCard>
  );
}

export function SystemPage({ id, meta }) {
  const [S, setS] = useState(null), [H, setH] = useState(null), [Y, setY] = useState(null), [G, setG] = useState(null), [MM, setMM] = useState(null), [M, setM] = useState(null), [SL, setSL] = useState(null);
  const mapRef = useRef(null);
  const [HX, setHX] = useState(null), [OP, setOP] = useState(null), [B3, setB3] = useState(null), [AC, setAC] = useState(null), [OW, setOW] = useState(null);
  useEffect(() => { loadHcrisIdx().then(setHX); loadOpIdx().then(setOP); load340b().then(setB3); loadAco().then(setAC); loadOwnership().then(setOW); }, []);
  const Ly = meta.years[meta.years.length - 1];
  useEffect(() => { Promise.all([loadSystems(), loadHospitals(), loadYear(Ly), loadGeo(), loadMarketsMeta()]).then(([s, h, y, g, mm]) => { setS(s); setH(h); setY(y); setG(g); setMM(mm);
    loadMkt(mm.hsaf_years[mm.hsaf_years.length - 1]).then(setM); loadSL(mm.sl_years[mm.sl_years.length - 1]).then(setSL); }); }, [Ly]);
  const sys = S && S[id];
  useEffect(() => { if (sys) document.title = `${sys.n} | Hospital Financial Explorer | TRYNYTY health:enablement`; }, [sys]);
  const members = useMemo(() => new Set(sys ? sys.h : []), [sys]);
  // System share of each county's Medicare inpatient cases (patient origin)
  const cty = useMemo(() => {
    if (!M || !sys) return [];
    return Object.entries(M.cty).map(([f, L]) => { let t = 0, me = 0; L.forEach(([c, n]) => { t += n; if (members.has(c)) me += n; }); return { f, t, me, sh: t ? me / t : 0 }; })
      .filter(r => r.me > 0).sort((a, b) => b.me - a.me);
  }, [M, sys, members]);
  const shown = useMemo(() => cty.filter(r => r.sh >= 0.02 || r.me >= 100), [cty]);
  const breaks = useMemo(() => [...new Set(quantileBreaks(shown.map(r => r.sh), 6).map(v => Math.round(v * 1000) / 1000))], [shown]);
  useEffect(() => { if (G && mapRef.current && shown.length) { const s = new Set(shown.slice(0, 80).map(r => r.f)); mapRef.current.zoomTo(padBounds(unionBounds(G.counties.filter(c => s.has(c.id)).map(c => c.b)), 0.15)); } }, [G, shown]);

  if (!S || !H || !Y || !G || !MM) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>;
  if (!sys) return <div className="card" style={{ padding: 24 }}>No health system with id {id}. <a href="#systems">All systems</a></div>;
  const byC = Object.fromEntries(H.map((h, i) => [h.c, { ...h, i }]));
  const years = meta.years.filter(y => sys.y && sys.y[String(y)]);
  const L = sys.y[String(Ly)] || {};
  const trend = years.map(y => { const r = sys.y[String(y)]; return { y, tm: r.tm == null ? null : +(r.tm * 100).toFixed(1), med: r.tm_med == null ? null : +(r.tm_med * 100).toFixed(1), npr: +(r.npr / 1e9).toFixed(2) }; });
  const hosp = sys.h.map(c => ({ h: byC[c], r: Y.byIdx.get(byC[c].i) })).sort((a, b) => ((b.r && b.r.npr) || 0) - ((a.r && a.r.npr) || 0));
  const fmap = Object.fromEntries(cty.map(r => [r.f, r]));
  const hx = new Set(sys.hx || []);
  const pc = v => (v == null ? null : +(v * 100).toFixed(1));
  const mtrend = years.map(y => { const r = sys.y[String(y)] || {}; return { y, mmm: pc(r.mmm), mapen: pc(r.mapen), mall: pc(r.mall), nat: HX ? pc(HX.meta.mm_margin[y]) : null }; });
  const opl = OP ? (() => { const by = {}; sys.h.forEach(c => Object.entries(OP.h[c] || {}).forEach(([k, r]) => { const b = by[k] || (by[k] = [0, 0, 0]); b[0] += r[0]; b[1] += r[1]; b[2] += r[2] || 0; }));
    return OP.lines.filter(([k]) => by[k]).map(([k, l]) => ({ k, l, s: by[k][0], p: by[k][1], s0: by[k][2] })).sort((a, b) => b.p - a.p); })() : [];
  const owEv = OW ? sys.h.flatMap(c => (OW.chow[c] || []).filter(e => e[0] >= '2021-01-01').map(e => ({ c, e }))).sort((a, b) => (b.e[0] || '').localeCompare(a.e[0] || '')) : [];
  const acoOf = c => (AC && AC.h[c] && AC.h[c][String(AC.meta.latest)]) || [];
  const acos = (() => { const m = {}; sys.h.forEach(c => acoOf(c).forEach(x => { (m[x[0]] = m[x[0]] || { id: x[0], n: x[1], k: 0 }).k += 1; })); return Object.values(m).sort((a, b) => b.k - a.k); })();
  const hxv = (c, i) => { const r = HX && HX.years[Ly] && HX.years[Ly][c]; return r ? r[i] : null; };
  const lines = SL ? (() => { const by = {}; sys.h.forEach(c => Object.entries(SL[c] || {}).forEach(([k, [d]]) => { by[k] = (by[k] || 0) + d; })); const t = Object.values(by).reduce((a, b) => a + b, 0); return MM.sl_order.filter(k => by[k]).map(k => ({ k, d: by[k], mix: by[k] / t })); })() : [];

  return (
    <div>
      <div className="card" style={{ padding: '16px 18px', marginBottom: 14 }}>
        <div className="cm-kicker">Health system · {sys.h.length} hospitals in {sys.st.length} {sys.st.length === 1 ? 'state' : 'states'}{sys.ci ? ` · Headquartered in ${titleCase(sys.ci)}, ${sys.s}` : ''}</div>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 28, margin: '4px 0', color: 'var(--navy)' }}>{sys.n}</h1>
        <div style={{ fontSize: 13, display: 'flex', gap: 14, flexWrap: 'wrap' }}><a href="#systems">All health systems</a>{sys.h.length <= 5 && <a href={`#compare/${sys.h.join(',')}`}>Compare its hospitals</a>}<a href={`${PHYS_URL}/#sys/${id}`} target="_blank" rel="noreferrer">Aligned physician groups and consolidation</a></div>
      </div>
      <div className="hp-grid" style={{ marginBottom: 14 }}>
        <div className="hp-kpi"><b>{fmtUsdM(L.npr)}</b><span>net patient revenue, {Ly}</span><i>{fmtInt(L.beds)} beds, {fmtInt(L.dis)} discharges</i></div>
        <div className="hp-kpi"><b style={{ color: L.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(L.tm)}</b><span>combined total margin</span><i>Median member hospital {fmtPct(L.tm_med)}</i></div>
        <div className="hp-kpi"><b>{fmtPct(L.pm)}</b><span>combined patient service margin</span></div>
        <div className="hp-kpi"><b>{fmtUsdM(L.ni)}</b><span>net income of member hospitals</span><i>From hospital cost reports; system-level items are not included</i></div>
        {L.mmm != null && <div className="hp-kpi"><b style={{ color: L.mmm < 0 ? 'var(--red)' : 'var(--teal-dark)' }}>{fmtPct(L.mmm)}</b><span>Medicare fee-for-service inpatient margin</span><i>{L.mmn} inpatient PPS {L.mmn === 1 ? 'hospital' : 'hospitals'}{HX && HX.meta.mm_margin[Ly] != null ? `; all PPS hospitals ${fmtPct(HX.meta.mm_margin[Ly])}` : ''}</i></div>}
        {L.mall != null && <div className="hp-kpi"><b>{fmtPct(L.mall, 0)}</b><span>of inpatient days are Medicare, including Medicare Advantage</span><i>{L.mapen != null ? `${fmtPct(L.mapen, 0)} of Medicare days are MA` : 'No MA days reported'}; Medicaid {fmtPct(L.mcdsh, 0)}</i></div>}
        {L.age != null && <div className="hp-kpi"><b>{L.age.toFixed(1)} years</b><span>average age of plant</span><i>Accumulated depreciation over annual depreciation, all members</i></div>}
        {B3 && <div className="hp-kpi"><b>{sys.h.filter(c => B3.h[c] && B3.h[c][2]).length} of {sys.h.length}</b><span>member hospitals in 340B</span><i>{fmtInt(sys.h.reduce((t, c) => t + (B3.h[c] && B3.h[c][2] ? B3.h[c][4] : 0), 0))} contract pharmacy arrangements across them</i></div>}
        {AC && <div className="hp-kpi"><b>{sys.h.filter(c => acoOf(c).length).length} of {sys.h.length}</b><span>member hospitals found in an MSSP ACO, {AC.meta.latest}</span><i>{acos.length ? acos.slice(0, 3).map(a => `${a.n} (${a.k})`).join('; ') : 'None matched by name'}</i></div>}
        {L.add != null && <div className="hp-kpi"><b>{fmtUsdM(L.add)}</b><span>Medicare add-on payments</span><i>Teaching (IME, GME), DSH, uncompensated care and outliers</i></div>}
      </div>
      <div className="cm-grid">
        <ChartCard title="Margins over time" sub="Combined total margin of member hospitals (revenue-weighted) and the median member hospital." filename={`system-${id}-margins`}
          csv={() => [['year', 'combined_total_margin_pct', 'median_hospital_margin_pct', 'net_patient_revenue_billions'], ...trend.map(t => [t.y, t.tm, t.med, t.npr])]}>
          <div style={{ height: 240 }}><ResponsiveContainer><LineChart data={trend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" /><Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="tm" name="Combined total margin" stroke="var(--teal-dark)" strokeWidth={2.4} /><Line dataKey="med" name="Median member hospital" stroke="var(--navy)" strokeDasharray="4 3" strokeWidth={1.6} />
          </LineChart></ResponsiveContainer></div>
        </ChartCard>
        <ChartCard title={`Service lines, ${MM.sl_years[MM.sl_years.length - 1]}`} sub="Original Medicare discharges at member hospitals, grouped from MS-DRGs."
          csvName={`system-${id}-service-lines`} csv={() => [['service_line', 'discharges', 'mix'], ...lines.map(r => [MM.sl[r.k], r.d, r.mix])]}>
          <div style={{ overflow: 'auto', maxHeight: 240 }}><table className="cm-table"><tbody>{lines.sort((a, b) => b.d - a.d).map(r => <tr key={r.k}><td>{MM.sl[r.k]}</td><td className="n">{fmtInt(r.d)}</td><td className="n">{fmtPct(r.mix)}</td></tr>)}</tbody></table></div>
        </ChartCard>
      </div>
      {mtrend.some(t => t.mmm != null || t.mapen != null) && <ChartCard title="Medicare over time" style={{ marginTop: 14 }} filename={`system-${id}-medicare`}
        sub="Combined Medicare fee-for-service inpatient margin of member hospitals, the all-hospital margin, and the Medicare Advantage share of Medicare inpatient days, from the full cost report files."
        csv={() => [['year', 'system_medicare_inpatient_margin_pct', 'all_pps_hospitals_margin_pct', 'ma_share_of_medicare_days_pct', 'medicare_share_of_days_pct'], ...mtrend.map(t => [t.y, t.mmm, t.nat, t.mapen, t.mall])]}>
        <div style={{ height: 250 }}><ResponsiveContainer><LineChart data={mtrend} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#eef1f5" vertical={false} /><XAxis dataKey="y" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} unit="%" /><Tooltip formatter={v => v + '%'} /><Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="mmm" name="Medicare inpatient margin" stroke="var(--teal-dark)" strokeWidth={2.4} />
          <Line dataKey="nat" name="All PPS hospitals" stroke="var(--slate)" strokeWidth={1.4} dot={false} />
          <Line dataKey="mapen" name="MA share of Medicare days" stroke="var(--navy)" strokeDasharray="4 3" strokeWidth={1.8} />
        </LineChart></ResponsiveContainer></div>
      </ChartCard>}
      {opl.length > 0 && <ChartCard title={`Outpatient procedures, ${OP.meta.latest}`} style={{ marginTop: 14 }} csvName={`system-${id}-outpatient`}
        sub="Original Medicare outpatient procedures and observation stays at member hospitals (comprehensive APCs), with the change since 2019. Critical access hospitals are not in the file."
        csv={() => [['service_line', 'services_2019', `services_${OP.meta.latest}`, 'medicare_payment'], ...opl.map(r => [r.l, r.s0, r.s, r.p])]}>
        <div style={{ overflow: 'auto', maxHeight: 300 }}><table className="cm-table"><thead><tr><th>Service line</th><th className="n">2019</th><th className="n">{OP.meta.latest}</th><th className="n">Change</th><th className="n">Medicare payment</th></tr></thead>
          <tbody>{opl.map(r => <tr key={r.k}><td>{r.l}</td><td className="n">{r.s0 ? fmtInt(r.s0) : ''}</td><td className="n">{fmtInt(r.s)}</td><td className="n" style={{ color: r.s0 && r.s < r.s0 ? 'var(--red)' : undefined }}>{r.s0 ? fmtPct(r.s / r.s0 - 1, 0) : 'new'}</td><td className="n">{fmtUsdM(r.p)}</td></tr>)}</tbody></table></div>
        <p className="cm-note">Changes include hospitals that joined or left the system and procedure groups CMS added since 2019.</p>
      </ChartCard>}
      <ChartCard title={`Market share, ${MM.hsaf_years[MM.hsaf_years.length - 1]}`} style={{ marginTop: 14 }} png csvName={`system-${id}-markets`}
        sub="The system's share of each county's Medicare inpatient cases (Original Medicare and Medicare Advantage, reported cases), all member hospitals combined. Counties where it has at least 2% or 100 cases are shaded."
        csv={() => [['county_fips', 'county', 'county_cases', 'system_cases', 'system_share'], ...cty.map(r => [r.f, countyTitle(G, r.f), r.t, r.me, r.sh])]}>
        <div className="cm-grid">
          {M ? <UsMap ref={mapRef} geo={G} counties={shown.map(r => r.f)} countyFill={f => colorFor(fmap[f] ? fmap[f].sh : null, breaks)} stateFill={() => '#f4f6f8'}
            tip={(k, f) => (k === 'c' && fmap[f] ? <><b>{countyTitle(G, f)}</b><br />{fmtPct(fmap[f].sh)} of {fmtInt(fmap[f].t)} cases<br />{fmtInt(fmap[f].me)} at {sys.n} hospitals</> : null)}
            legend={<SeqLegend label="System share of county cases" breaks={breaks} fmt={v => fmtPct(v, 0)} />} /> : <div style={{ padding: 30, color: 'var(--gray-500)' }}>Loading…</div>}
          <div style={{ overflow: 'auto', maxHeight: 460 }}><table className="cm-table"><thead><tr><th>County</th><th className="n">System cases</th><th className="n">Share</th></tr></thead>
            <tbody>{cty.slice(0, 40).map(r => <tr key={r.f}><td><a href={`#map/${r.f}`}>{countyTitle(G, r.f)}</a></td><td className="n">{fmtInt(r.me)}</td><td className="n">{fmtPct(r.sh)}</td></tr>)}</tbody></table></div>
        </div>
      </ChartCard>
      {owEv.length > 0 && <ChartCard title="Ownership changes since 2021" style={{ marginTop: 14 }} csvName={`system-${id}-ownership`}
        sub="Changes of ownership and mergers at member hospitals, from Medicare enrollment records (CMS)."
        csv={() => [['effective_date', 'ccn', 'hospital', 'event', 'other_hospital', 'other_ccn', 'owner_after', 'owner_before'], ...owEv.map(({ c, e }) => [e[0], c, byC[c] ? byC[c].n : '', e[1], e[2] || '', e[3] || '', e[4] || '', e[5] || ''])]}>
        <div style={{ overflow: 'auto', maxHeight: 300 }}><table className="cm-table"><thead><tr><th>Effective</th><th>Hospital</th><th>Event</th></tr></thead>
          <tbody>{owEv.map(({ c, e }, i) => <tr key={i}><td>{e[0] ? e[0].slice(0, 7) : ''}</td><td><a href={`#h/${c}`}>{byC[c] ? titleCase(byC[c].n) : c}</a></td>
            <td style={{ fontSize: 12 }}>{e[1] === 'new_owner' ? `New owner: ${titleCase(e[4] || '')}${e[5] ? ` (from ${titleCase(e[5])})` : ''}` : e[1] === 'absorbed' ? `Took in ${titleCase(e[2] || '')} (${e[3]})` : `Merged into ${titleCase(e[2] || '')} (${e[3]})`}</td></tr>)}</tbody></table></div>
      </ChartCard>}
      <ChartCard title={`Member hospitals, ${Ly}`} style={{ marginTop: 14 }} csvName={`system-${id}-hospitals-${Ly}`}
        csv={() => [['ccn', 'hospital', 'city', 'state', 'type', 'beds', 'net_patient_revenue', 'total_margin', 'patient_service_margin', 'days_cash_on_hand', 'medicare_ffs_inpatient_margin', 'ma_share_of_medicare_days', 'type_340b', 'mssp_aco', 'membership_source'], ...hosp.map(({ h, r }) => [h.c, h.n, h.ci, h.s, meta.ftype[h.t], r && r.beds, r && r.npr, r && r.tm, r && r.pm, r && r.dcoh, hxv(h.c, 6) ?? '', hxv(h.c, 1) ? hxv(h.c, 4) : '', B3 && B3.h[h.c] && B3.h[h.c][2] ? B3.h[h.c][0] : '', acoOf(h.c).map(x => x[1]).join('; '), hx.has(h.c) ? 'cost report home office' : 'AHRQ 2023'])]}>
        <div style={{ overflow: 'auto', maxHeight: 520 }}><table className="cm-table"><thead><tr><th>Hospital</th><th>Type</th><th className="n">Beds</th><th className="n">Net patient revenue</th><th className="n">Total margin</th><th className="n">Patient margin</th><th className="n">Days cash</th><th className="n">Medicare inpatient margin</th><th className="n">MA share of Medicare</th><th>340B</th><th>MSSP ACO</th></tr></thead>
          <tbody>{hosp.map(({ h, r }) => <tr key={h.c} style={r && r.flag ? { color: 'var(--gray-500)' } : undefined}><td><a href={`#h/${h.c}`}>{titleCase(h.n)}</a>{hx.has(h.c) && <sup title="Not in the 2023 AHRQ linkage; added because its own cost report names this system's home office" style={{ color: 'var(--teal-dark)', marginLeft: 2 }}>†</sup>}<span className="cm-sttag">{titleCase(h.ci || '')}, {h.s}</span></td><td>{meta.ftype[h.t]}</td>
            {r ? <><td className="n">{fmtInt(r.beds)}</td><td className="n">{fmtUsdM(r.npr)}</td><td className="n" style={{ color: r.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(r.tm)}</td><td className="n">{fmtPct(r.pm)}</td><td className="n">{r.dcoh == null ? 'n/a' : Math.round(r.dcoh)}</td></> : <td colSpan={5} style={{ color: 'var(--gray-500)' }}>No {Ly} report</td>}
            <td className="n">{hxv(h.c, 6) == null ? '' : fmtPct(hxv(h.c, 6))}</td><td className="n">{hxv(h.c, 1) ? fmtPct(hxv(h.c, 4), 0) : ''}</td><td>{B3 && B3.h[h.c] && B3.h[h.c][2] ? B3.h[h.c][0] : ''}</td><td style={{ fontSize: 11 }}>{acoOf(h.c).map(x => <div key={x[0]}><a href={`${MSSP_URL}/#aco/${x[0]}`} target="_blank" rel="noreferrer">{x[1]}</a></div>)}</td></tr>)}</tbody></table></div>
        <p className="cm-note">{hx.size > 0 && <>† {hx.size} {hx.size === 1 ? 'hospital is' : 'hospitals are'} not in the 2023 AHRQ linkage and {hx.size === 1 ? 'was' : 'were'} added because {hx.size === 1 ? 'its' : 'their'} own cost report names this system&apos;s home office. </>}{NOTE} Combined figures add up member hospitals&apos; own cost reports, so they leave out the system&apos;s physician groups, insurance plans, investments and other businesses, and will not match a system&apos;s consolidated financial statements.</p>
      </ChartCard>
    </div>
  );
}
