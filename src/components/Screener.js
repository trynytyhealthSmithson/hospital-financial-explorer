import React, { useEffect, useMemo, useState } from 'react';
import ChartCard from './ChartCard';
import { titleCase } from './HospitalMap';
import { loadHospitals, loadYear, fmtInt, fmtPct, fmtUsdM, median, FTYPE_ORDER } from '../data';

const REGION = {
  Northeast: ['CT', 'ME', 'MA', 'NH', 'RI', 'VT', 'NJ', 'NY', 'PA'],
  Midwest: ['IL', 'IN', 'MI', 'OH', 'WI', 'IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  South: ['DE', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'DC', 'WV', 'AL', 'KY', 'MS', 'TN', 'AR', 'LA', 'OK', 'TX'],
  West: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY', 'AK', 'CA', 'HI', 'OR', 'WA'],
};
const STATES = Object.values(REGION).flat().sort();
// Numeric filters: [key, label, unit]. Percent filters are entered as percents.
const RANGES = [['tm', 'Total margin', '%'], ['pm', 'Patient service margin', '%'], ['dcoh', 'Days cash on hand', 'days'], ['occ', 'Occupancy', '%'],
  ['mcr', 'Original Medicare share of days', '%'], ['mcd', 'Medicaid share of days', '%'], ['npr', 'Net patient revenue', '$M'], ['beds', 'Beds', ''], ['dtm', 'Change in total margin over 3 years', 'pts']];
const PCT = new Set(['tm', 'pm', 'occ', 'mcr', 'mcd', 'dtm']);
const PRESETS = [
  ['Critical access hospitals losing money', { t: 'CAH', tm_max: '0' }],
  ['Acute care hospitals with under 30 days of cash', { t: 'STH', dcoh_max: '30' }],
  ['Rural acute care hospitals losing money', { t: 'STH', ru: 'R', tm_max: '0' }],
  ['Margins down 5 points or more in 3 years', { t: 'STH,CAH', dtm_max: '-5' }],
  ['Large hospitals (300+ beds) with negative patient margins and positive total margins', { t: 'STH', beds_min: '300', pm_max: '0', tm_min: '0' }],
];
const COLS = [['n', 'Hospital'], ['beds', 'Beds'], ['npr', 'Net patient revenue'], ['tm', 'Total margin'], ['dtm', '3-year change'], ['pm', 'Patient margin'], ['dcoh', 'Days cash'], ['occ', 'Occupancy'], ['mcr', 'Original Medicare days']];

export default function Screener({ meta, query, onHospital }) {
  const last = meta.years[meta.years.length - 1];
  const [F, setF] = useState(() => { const p = new URLSearchParams(query || ''); const o = Object.fromEntries(p.entries()); if (!o.t) o.t = 'STH,CAH'; return o; });
  const [H, setH] = useState(null), [Y, setY] = useState(null), [Y3, setY3] = useState(null), [sort, setSort] = useState('npr');
  const year = +(F.y || last);
  useEffect(() => { loadHospitals().then(setH); }, []);
  useEffect(() => { setY(null); loadYear(year).then(setY); if (meta.years.includes(year - 3)) loadYear(year - 3).then(setY3); else setY3(null); }, [year, meta.years]);
  // Keep filters in the page address so a screen can be bookmarked or shared
  useEffect(() => { const p = new URLSearchParams(Object.entries(F).filter(([, v]) => v !== '' && v != null)); window.history.replaceState(null, '', `#screener?${p.toString()}`); }, [F]);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  // A preset is highlighted while the current filters are exactly that preset (the year can differ)
  const presetOn = p => { const cur = Object.entries(F).filter(([k, v]) => k !== 'y' && v !== '' && v != null);
    return cur.length === Object.keys(p).length && cur.every(([k, v]) => String(p[k]) === String(v)); };

  const rows = useMemo(() => {
    if (!H || !Y) return [];
    const types = new Set((F.t || '').split(',').filter(Boolean));
    const states = F.r ? new Set(REGION[F.r]) : null;
    const out = [];
    Y.byIdx.forEach((r, i) => {
      const h = H[i]; if (!h) return;
      if (types.size && !types.has(h.t)) return;
      if (states && !states.has(h.s)) return;
      if (F.s && h.s !== F.s) return;
      if (F.g && h.g !== F.g) return;
      if (F.ru && h.ru !== F.ru) return;
      if (F.te && h.te !== F.te) return;
      if (!F.flag && r.flag) return;
      const p = Y3 && Y3.byIdx.get(i);
      const x = { ...r, h, mcr: r.days ? r.mcr_days / r.days : null, mcd: r.days ? r.mcd_days / r.days : null,
        dtm: p && !p.flag && !r.flag && p.tm != null && r.tm != null ? r.tm - p.tm : null };
      for (const [k] of RANGES) {
        const lo = F[k + '_min'], hi = F[k + '_max']; if ((lo == null || lo === '') && (hi == null || hi === '')) continue;
        let v = x[k]; if (v == null) return;
        if (PCT.has(k)) v *= 100; if (k === 'npr') v /= 1e6;
        if (lo !== undefined && lo !== '' && v < +lo) return;
        if (hi !== undefined && hi !== '' && v > +hi) return;
      }
      out.push(x);
    });
    return out.sort((a, b) => (sort === 'n' ? a.h.n.localeCompare(b.h.n) : (b[sort] ?? -1e15) - (a[sort] ?? -1e15)));
  }, [H, Y, Y3, F, sort]);

  const tms = rows.filter(r => !r.flag).map(r => r.tm);
  const active = RANGES.filter(([k]) => F[k + '_min'] || F[k + '_max']).length + ['r', 's', 'g', 'ru', 'te'].filter(k => F[k]).length;
  const inp = { width: 64, font: '12px var(--font)', padding: '4px 6px', border: '1px solid var(--slate-light)', borderRadius: 5 };

  return (
    <div>
      <div className="card" style={{ padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span className="cm-kicker" style={{ marginRight: 4 }}>Start from</span>
          {PRESETS.map(([l, p]) => <button key={l} className={`cm-chip ${presetOn(p) ? 'on' : ''}`} onClick={() => setF({ y: F.y, ...p })}>{l}</button>)}
          <button className="cm-chip" style={{ marginLeft: 'auto' }} onClick={() => setF({ t: 'STH,CAH' })}>Clear filters</button>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <label className="cm-field">Cost report year<select value={year} onChange={e => set('y', e.target.value)}>{meta.years.slice().reverse().map(y => <option key={y} value={y}>{y}</option>)}</select></label>
          <label className="cm-field">Region<select value={F.r || ''} onChange={e => setF(o => ({ ...o, r: e.target.value, s: '' }))}><option value="">All</option>{Object.keys(REGION).map(r => <option key={r}>{r}</option>)}</select></label>
          <label className="cm-field">State<select value={F.s || ''} onChange={e => set('s', e.target.value)}><option value="">All</option>{(F.r ? REGION[F.r].slice().sort() : STATES).map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="cm-field">Ownership<select value={F.g || ''} onChange={e => set('g', e.target.value)}><option value="">All</option>{['np', 'fp', 'gov'].map(g => <option key={g} value={g}>{meta.ctrl[g]}</option>)}</select></label>
          <label className="cm-field">Location<select value={F.ru || ''} onChange={e => set('ru', e.target.value)}><option value="">All</option><option value="U">Urban</option><option value="R">Rural</option></select></label>
          <label className="cm-field">Teaching<select value={F.te || ''} onChange={e => set('te', e.target.value)}><option value="">All</option><option value="major">Major</option><option value="minor">Minor</option><option value="none">Non-teaching</option></select></label>
          <div className="cm-field">Hospital types<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{FTYPE_ORDER.map(t => { const T = (F.t || '').split(',').filter(Boolean); const on = T.includes(t);
            return <button key={t} className={`cm-chip ${on ? 'on' : ''}`} onClick={() => set('t', (on ? T.filter(x => x !== t) : [...T, t]).join(','))}>{meta.ftype[t]}</button>; })}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '8px 18px', marginTop: 12 }}>
          {RANGES.map(([k, l, u]) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-700)' }}>
            <span style={{ flex: 1 }}>{l}{u ? ` (${u})` : ''}</span>
            <input style={inp} placeholder="min" value={F[k + '_min'] || ''} onChange={e => set(k + '_min', e.target.value)} inputMode="decimal" />
            <span>to</span>
            <input style={inp} placeholder="max" value={F[k + '_max'] || ''} onChange={e => set(k + '_max', e.target.value)} inputMode="decimal" />
          </div>)}
          <label style={{ fontSize: 12, color: 'var(--gray-700)', display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!F.flag} onChange={e => set('flag', e.target.checked ? '1' : '')} /> Include reports flagged as unusable</label>
        </div>
      </div>

      <ChartCard title={!H || !Y ? 'Loading…' : `${fmtInt(rows.length)} hospitals match`} csvName={`hospital-screen-${year}`}
        sub={!H || !Y ? '' : `${year} cost reports${active ? `, ${active} ${active === 1 ? 'filter' : 'filters'}` : ''}. Median total margin of these hospitals: ${fmtPct(median(tms))}. The 3-year change compares with ${year - 3}. The page address keeps your filters, so you can bookmark or share this screen.`}
        csv={() => [['ccn', 'hospital', 'city', 'state', 'county_fips', 'type', 'ownership', 'urban_rural', 'teaching', 'beds', 'net_patient_revenue', 'total_margin', 'total_margin_change_3yr', 'patient_service_margin', 'days_cash_on_hand', 'occupancy', 'original_medicare_day_share', 'medicaid_day_share', 'health_system_id', 'flagged'],
          ...rows.map(r => [r.h.c, r.h.n, r.h.ci, r.h.s, r.h.f, meta.ftype[r.h.t], meta.ctrl[r.h.g], r.h.ru, r.h.te, r.beds, r.npr, r.tm, r.dtm, r.pm, r.dcoh, r.occ, r.mcr, r.mcd, r.h.sy || '', r.flag ? 'yes' : 'no'])]}>
        <div style={{ overflow: 'auto', maxHeight: 620 }}>
          <table className="cm-table"><thead><tr>
            {COLS.map(([k, l]) => <th key={k} className={k === 'n' ? '' : 'n'} style={{ cursor: 'pointer', color: sort === k ? 'var(--teal-dark)' : undefined }} onClick={() => setSort(k)}>{l}{sort === k ? ' ▾' : ''}</th>)}<th>Type</th></tr></thead>
            <tbody>{rows.slice(0, 500).map(r => <tr key={r.h.c} style={r.flag ? { color: 'var(--gray-500)' } : undefined}>
              <td><button className="cm-link" onClick={() => onHospital(r.h.c)}>{titleCase(r.h.n)}</button><span className="cm-sttag">{titleCase(r.h.ci || '')}, {r.h.s}</span></td>
              <td className="n">{fmtInt(r.beds)}</td><td className="n">{fmtUsdM(r.npr)}</td>
              <td className="n" style={{ color: r.tm < 0 ? 'var(--red)' : undefined }}>{fmtPct(r.tm)}</td>
              <td className="n" style={{ color: r.dtm > 0 ? 'var(--teal-dark)' : r.dtm < 0 ? 'var(--red)' : undefined }}>{r.dtm == null ? 'n/a' : `${r.dtm > 0 ? '+' : r.dtm < 0 ? '−' : ''}${Math.abs(r.dtm * 100).toFixed(1)} pts`}</td>
              <td className="n">{fmtPct(r.pm)}</td><td className="n">{r.dcoh == null ? 'n/a' : Math.round(r.dcoh)}</td><td className="n">{fmtPct(r.occ, 0)}</td><td className="n">{fmtPct(r.mcr, 0)}</td>
              <td>{meta.ftype[r.h.t]}</td></tr>)}</tbody></table>
          {rows.length > 500 && <p className="cm-note">Showing 500 of {fmtInt(rows.length)}. Add filters, or download the CSV for all of them.</p>}
        </div>
      </ChartCard>
    </div>
  );
}
