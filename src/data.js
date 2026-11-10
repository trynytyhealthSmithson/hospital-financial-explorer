// Shared, cached loaders, formatters and map helpers
import { feature, mesh } from 'topojson-client';
import { geoPath } from 'd3-geo';

export const BASE = `${process.env.PUBLIC_URL}/data`;
export const MAP_W = 975, MAP_H = 610;
export const RAMP = ['#e8f6f5', '#bfe8e5', '#8fd6d1', '#5cc1bb', '#2fa59f', '#1b827d', '#0f5753'];
export const DIV_NEG = ['#b4471f', '#d9774f', '#f0b49a', '#f8ddd0'];
export const DIV_POS = ['#d6efed', '#8fd6d1', '#2fa59f', '#0f5753'];
export const NODATA = '#eef1f5';
export const RURAL = { F: 'Fully rural', P: 'Partly rural', N: 'Not rural' };
export const MSSP_URL = 'https://mssppuf.trynytyhealth.com';
export const MA_URL = 'https://maenroll.trynytyhealth.com';

const cache = {};
const load = (key, url) => (cache[key] = cache[key] || fetch(url).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); }));
export const loadMeta = () => load('meta', `${BASE}/meta.json`);
export const loadHospitals = () => load('hosp', `${BASE}/hospitals.json`);
export const loadPeers = () => load('peers', `${BASE}/peers.json`);
export const loadState = st => load('st:' + st, `${BASE}/hosp/${st}.json`);
// One file per cost report year: rows of [hospital index, raw components..., ratios..., flag]
export const loadYear = y => load('y:' + y, `${BASE}/year/${y}.json`).then(d => {
  if (d.byIdx) return d;
  const F = d.fields; d.byIdx = new Map(d.rows.map(r => [r[0], Object.fromEntries(F.map((k, i) => [k, r[i]]))]));
  return d;
});

let geoPromise = null;
export function loadGeo() {
  if (geoPromise) return geoPromise;
  geoPromise = load('topo', `${BASE}/counties-albers-10m.json`).then(topo => {
    const path = geoPath();
    const counties = feature(topo, topo.objects.counties).features.map(f => ({ id: f.id, n: f.properties.name, d: path(f), b: path.bounds(f), c: path.centroid(f) }));
    const states = feature(topo, topo.objects.states).features.map(f => ({ id: f.id, name: f.properties.name, d: path(f), b: path.bounds(f) }));
    return { counties, states, stateMesh: path(mesh(topo, topo.objects.states, (a, b) => a !== b)), nation: path(mesh(topo, topo.objects.nation)) };
  });
  return geoPromise;
}

// FIPS state code <-> postal abbreviation
export const ST_FIPS = { AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11', FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21', LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30', NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39', OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49', VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56', AS: '60', GU: '66', MP: '69', PR: '72', VI: '78' };
export const FIPS_ST = Object.fromEntries(Object.entries(ST_FIPS).map(([a, f]) => [f, a]));

export function quantileBreaks(vals, n) {
  const s = vals.filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
  if (!s.length) return [];
  const out = [];
  for (let i = 1; i < n; i++) out.push(s[Math.min(s.length - 1, Math.floor((i / n) * s.length))]);
  return [...new Set(out)];
}
export const rampIndex = (i, br) => Math.round(i * (RAMP.length - 1) / Math.max(1, br.length));
export const colorFor = (v, br) => { if (v == null || !isFinite(v)) return NODATA; let i = 0; while (i < br.length && v >= br[i]) i++; return RAMP[rampIndex(i, br)]; };

// Diverging scale around zero: symmetric breaks from the larger absolute quantile
export function divBreaks(vals) {
  const a = vals.filter(v => v != null && isFinite(v)).map(Math.abs).sort((x, y) => x - y);
  if (!a.length) return [];
  const m = a[Math.floor(a.length * 0.9)] || a[a.length - 1] || 1;
  return [m / 4, m / 2, (3 * m) / 4];
}
export function divColor(v, br) {
  if (v == null || !isFinite(v)) return NODATA;
  if (Math.abs(v) < 1e-9) return '#f4f4f2';
  const i = br.findIndex(b => Math.abs(v) < b); const k = i < 0 ? 3 : i;
  return v < 0 ? DIV_NEG[3 - k] : DIV_POS[k];
}

export const fmtInt = v => v == null || !isFinite(v) ? 'n/a' : Math.round(v).toLocaleString('en-US');
export const fmtPct = (v, d = 1) => v == null || !isFinite(v) ? 'n/a' : (v * 100).toFixed(d) + '%';
export const fmtPts = (v, d = 1) => {
  if (v == null || !isFinite(v)) return 'n/a';
  const a = Math.abs(v * 100), dd = a > 0 && a < 0.5 * 10 ** -d ? d + 1 : d;   // keep small moves visible (0.04 not 0.0)
  return (v > 0 ? '+' : v < 0 ? '−' : '') + a.toFixed(dd) + ' pts';
};
export const fmtChg = v => v == null || !isFinite(v) ? 'n/a' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('en-US');
export const fmtGrowth = (a, b) => (b ? (a / b - 1 > 0 ? '+' : a / b - 1 < 0 ? '−' : '') + Math.abs((a / b - 1) * 100).toFixed(1) + '%' : 'new');
export const fmtShort = v => v == null ? 'n/a' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : Math.abs(v) >= 1e3 ? Math.round(v / 1e3) + 'K' : String(Math.round(v));
export const chgColor = v => (v > 0 ? 'var(--teal-dark)' : v < 0 ? 'var(--red)' : undefined);

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const snapLabel = s => { const [y, m] = s.split('-'); return `${MONTHS[+m - 1]} ${y}`; };
export const snapShort = s => { const [y, m] = s.split('-'); return `${MONTHS[+m - 1].slice(0, 3)} ${y}`; };

export const countyLabel = c => `${c.n}${/^(AK|LA|PR|VI|GU|AS|MP|DC)$/.test(c.s) || / (City|Borough|Census Area|Municipality)$/i.test(c.n) ? '' : ' County'}, ${c.s}`;

export function downloadCSV(rows, name) {
  const esc = v => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }));
  a.download = name; a.click();
}

// Union of bounds for a list of county ids
export function boundsOf(geo, ids) {
  const set = new Set(ids); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  geo.counties.forEach(c => { if (set.has(c.id)) { x0 = Math.min(x0, c.b[0][0]); y0 = Math.min(y0, c.b[0][1]); x1 = Math.max(x1, c.b[1][0]); y1 = Math.max(y1, c.b[1][1]); } });
  return isFinite(x0) ? [[x0, y0], [x1, y1]] : null;
}

// Herfindahl label (DOJ/FTC 2023 merger guidelines thresholds)
export const hhiLabel = h => (h == null ? '' : h > 1800 ? 'highly concentrated' : h >= 1000 ? 'moderately concentrated' : 'unconcentrated');

// ---- Hospital measures ----
export const FTYPE_ORDER = ['STH', 'CAH', 'CH', 'PH', 'RH', 'LTCH', 'OTH'];
export const fmtUsd = v => v == null || !isFinite(v) ? 'n/a' : (v < 0 ? '−' : '') + '$' + Math.abs(Math.round(v)).toLocaleString('en-US');
export const fmtUsdM = v => v == null || !isFinite(v) ? 'n/a' : (v < 0 ? '−' : '') + '$' + (Math.abs(v) >= 1e12 ? (Math.abs(v) / 1e12).toFixed(2) + 'T' : Math.abs(v) >= 1e9 ? (Math.abs(v) / 1e9).toFixed(2) + 'B' : (Math.abs(v) / 1e6).toFixed(Math.abs(v) >= 1e8 ? 0 : 1) + 'M');
export const fmtDays = v => v == null || !isFinite(v) ? 'n/a' : Math.round(v).toLocaleString('en-US') + ' days';
export const median = a => { const s = a.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length / 2; return s.length % 2 ? s[Math.floor(m)] : (s[m - 1] + s[m]) / 2; };
const sum = (L, k) => L.reduce((t, r) => t + (r[k] || 0), 0);

/**
 * Roll up a set of hospital-year rows. Dollar and day totals are summed; margins and shares are
 * recalculated from the sums (revenue-weighted), never averaged. Reports flagged as unreliable
 * (no net patient revenue, a margin beyond plus or minus 100%, or a partial year) are counted but
 * left out of margins and medians.
 */
export function rollup(rows) {
  const ok = rows.filter(r => !r.flag);
  const rev = sum(ok, 'rev'), npr = sum(ok, 'npr'), days = sum(rows, 'days'), bd = sum(rows, 'bed_days'), cost = sum(rows, 'cost');
  const tms = ok.map(r => r.tm).filter(v => v != null);
  const qs = rows.map(r => r.q).filter(Boolean);
  const cm = rows.map(r => r.ip && r.ip.cmi).filter(v => v != null);
  const st = qs.map(q => q.star).filter(v => v != null), hp = qs.filter(q => q.hacpen != null), tp = qs.map(q => q.tps).filter(v => v != null);
  return {
    cmi: median(cm),
    stars: st.length ? st.reduce((a, b) => a + b, 0) / st.length : null, hacpen: hp.length ? hp.filter(q => q.hacpen).length / hp.length : null, tps: median(tp),
    n: rows.length, clean: ok.length, beds: sum(rows, 'beds'), npr: sum(rows, 'npr'), dis: sum(rows, 'dis'), fte: sum(rows, 'fte'),
    tm: rev ? sum(ok, 'ni') / rev : null, pm: npr ? sum(ok, 'nisp') / npr : null,
    tm_med: median(tms), loss: tms.length ? tms.filter(v => v < 0).length / tms.length : null,
    dcoh: median(ok.map(r => r.dcoh)), occ: bd ? days / bd : null,
    mcr: days ? sum(rows, 'mcr_days') / days : null, mcd: days ? sum(rows, 'mcd_days') / days : null,
    unc: cost ? sum(rows, 'uncomp') / cost : null,
  };
}

export const MEASURES = {
  tm:    { label: 'Total margin', sub: 'Net income as a share of total revenue (patient revenue plus other income), all hospitals in the area combined', fmt: v => fmtPct(v), div: true },
  tm_med:{ label: 'Median total margin', sub: 'Total margin of the middle hospital in the area', fmt: v => fmtPct(v), div: true },
  loss:  { label: 'Hospitals losing money', sub: 'Share of hospitals with a negative total margin', fmt: v => fmtPct(v, 0) },
  pm:    { label: 'Patient service margin', sub: 'Net patient revenue less operating expense, as a share of net patient revenue, all hospitals combined', fmt: v => fmtPct(v), div: true },
  dcoh:  { label: 'Median days cash on hand', sub: 'Cash and investments divided by daily operating expense (excluding depreciation), middle hospital', fmt: v => fmtDays(v) },
  npr:   { label: 'Net patient revenue', sub: 'Total net patient revenue of hospitals in the area', fmt: v => fmtUsdM(v) },
  beds:  { label: 'Beds', sub: 'Total beds reported on the cost report', fmt: v => fmtInt(v) },
  n:     { label: 'Hospitals', sub: 'Hospitals that filed a cost report for the year', fmt: v => fmtInt(v) },
  occ:   { label: 'Occupancy', sub: 'Inpatient days as a share of available bed days', fmt: v => fmtPct(v) },
  mcr:   { label: 'Original Medicare share of inpatient days', sub: 'Original Medicare (Title XVIII) inpatient days as a share of all inpatient days; Medicare Advantage days are not counted here', fmt: v => fmtPct(v) },
  mcd:   { label: 'Medicaid share of inpatient days', sub: 'Medicaid (Title XIX) inpatient days as a share of all inpatient days; mostly fee-for-service Medicaid', fmt: v => fmtPct(v) },
  cmi:   { label: 'Median case mix index', sub: 'Median Medicare case mix index (patient acuity) of inpatient PPS hospitals, FY 2027 payment rule', fmt: v => (v == null ? 'n/a' : v.toFixed(2)) },
  stars: { label: 'Average CMS star rating', sub: 'Average overall star rating (1 to 5) of hospitals CMS rated, FY 2026', fmt: v => (v == null ? 'n/a' : v.toFixed(1) + ' stars') },
  tps:   { label: 'Median value-based purchasing score', sub: 'Median Hospital VBP total performance score (0 to 100), FY 2026', fmt: v => (v == null ? 'n/a' : v.toFixed(1)) },
  hacpen:{ label: 'Hospitals with a HAC penalty', sub: 'Share of hospitals in the hospital-acquired condition program that took the 1% payment cut, FY 2026', fmt: v => fmtPct(v, 0) },
  unc:   { label: 'Uncompensated care', sub: 'Unreimbursed and uncompensated care (charity care, bad debt and Medicaid shortfall) as a share of total costs', fmt: v => fmtPct(v) },
};

// ---- Markets: patient-origin share, service areas, service lines ----
export const loadMarketsMeta = () => load('mm', `${BASE}/markets_meta.json`);
export const loadMkt = y => load('mkt:' + y, `${BASE}/mkt/${y}.json`);
export const loadSA = st => load('sa:' + st, `${BASE}/sa/${st}.json`);
export const loadSL = y => load('sl:' + y, `${BASE}/sl/${y}.json`);
export const loadZips = () => load('zips', `${BASE}/zips.json`);
export const loadOthers = () => load('others', `${BASE}/others.json`);

export const loadSystems = () => load('systems', `${BASE}/systems.json`);

/**
 * Sum patient-origin cases across a set of counties, by hospital or, with a group function, by health system.
 * group(ccn) returns the key to add a hospital's cases to (a system id, or the ccn for stand-alone hospitals).
 */
export function marketShare(mkt, fipsList, group) {
  const by = {}; let total = 0, sup = 0;
  fipsList.forEach(f => { (mkt.cty[f] || []).forEach(([c, n]) => { const k = group ? group(c) : c; by[k] = (by[k] || 0) + n; total += n; }); sup += mkt.sup[f] || 0; });
  const rows = Object.entries(by).map(([c, n]) => ({ c, n, sh: total ? n / total : null })).sort((a, b) => b.n - a.n);
  const hhi = rows.reduce((t, r) => t + (r.sh * 100) ** 2, 0);
  return { rows, total, sup, hhi: total ? Math.round(hhi) : null };
}
export const loadVbc = () => load('vbc', `${BASE}/county_vbc.json`);

/**
 * Medicare Advantage penetration and MSSP ACO share for a set of counties.
 * weights: optional {fips: cases} to weight counties by a hospital's patients (exposure); without it, counties are pooled.
 */
export function vbcExposure(vbc, fipsList, weights) {
  let el = 0, en = 0, aw = 0, as = 0, w1 = 0, mp = 0, w2 = 0, mm = 0;
  fipsList.forEach(f => {
    const r = vbc.c[f]; if (!r) return; const [e, n, ms, asg] = r;
    if (weights) { const w = weights[f] || 0; if (e && n != null) { w1 += w; mp += w * (n / e); } if (ms != null) { w2 += w; mm += w * ms; } }
    else { if (e && n != null) { el += e; en += n; } if (ms != null && asg) { aw += asg; as += ms * asg; } }
  });
  return weights ? { ma: w1 ? mp / w1 : null, aco: w2 ? mm / w2 : null } : { ma: el ? en / el : null, aco: aw ? as / aw : null };
}

export const monthLabel = s => { const [y, m] = String(s).split('-'); return m ? `${MONTHS[+m - 1]} ${y}` : String(s); };
export const loadQuality = () => load('quality', `${BASE}/quality.json`);
export const READM_LABEL = { AMI: 'Heart attack', HF: 'Heart failure', PN: 'Pneumonia', COPD: 'COPD', CABG: 'Coronary bypass surgery', HIPKNEE: 'Hip and knee replacement' };
/** Percentile (0 to 100) of a value within a list of 21 cut points at 0, 5, ..., 100 */
export const pctRank = (v, cuts) => { if (v == null || !cuts) return null; let i = 0; while (i < cuts.length - 1 && v > cuts[i + 1]) i++; return Math.min(100, i * 5); };
export const loadIpps = () => load('ipps', `${BASE}/ipps.json`);
export const fmtAdj = f => (f == null ? 'n/a' : `${f >= 1 ? '+' : '−'}${Math.abs((f - 1) * 100).toFixed(2)}%`);
export const loadHcris = st => load('hcris:' + st, `${BASE}/hcris/${st}.json`);
export const loadHcrisIdx = () => load('hcrisidx', `${BASE}/hcris_idx.json`);
export const loadOp = st => load('op:' + st, `${BASE}/op/${st}.json`);
export const loadOpIdx = () => load('opidx', `${BASE}/op_idx.json`);
export const load340b = () => load('340b', `${BASE}/340b.json`);
export const loadAco = () => load('aco', `${BASE}/aco.json`);
export const loadOwnership = () => load('own', `${BASE}/ownership.json`);
