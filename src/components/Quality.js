import React, { useEffect, useState } from 'react';
import ChartCard from './ChartCard';
import { loadQuality, READM_LABEL, pctRank, fmtInt } from '../data';

const stars = n => (n == null ? 'Not rated' : '★'.repeat(n) + '☆'.repeat(5 - n));

/** Quality ratings and Medicare quality payment programs for one hospital (CMS Provider Data Catalog, FY 2026). */
export default function QualityCard({ ccn }) {
  const [Q, setQ] = useState(null);
  useEffect(() => { loadQuality().then(setQ); }, []);
  if (!Q) return null;
  const q = Q.h[ccn];
  if (!q) return <ChartCard title="Quality and Medicare penalties" style={{ marginTop: 14 }}><p className="cm-note">CMS publishes no star rating or quality program results for this hospital. Critical access, psychiatric, rehabilitation, long-term care and children&apos;s hospitals are mostly outside these programs.</p></ChartCard>;
  const M = Q.meta, tp = pctRank(q.tps, M.tps_pct);
  const err = q.err ? Object.entries(q.err).sort((a, b) => b[1] - a[1]) : [];
  return (
    <ChartCard title={`Quality and Medicare penalties, FY ${M.fy}`} style={{ marginTop: 14 }}
      sub="CMS Care Compare and the three inpatient quality payment programs. Value-based purchasing redistributes a 2% withhold based on the total performance score; readmissions can cut Medicare inpatient payments by up to 3%; the hospital-acquired condition program cuts 1% for the worst-scoring quarter of hospitals."
      csvName={`quality-${ccn}`} csv={() => [['measure', 'value'], ['Overall star rating', q.star ?? ''], ['Patient experience star rating', q.pstar ?? ''], ['Patients rating the hospital 9 or 10 (%)', q.r910 ?? ''], ['Patients who would definitely recommend (%)', q.rec ?? ''],
        ['VBP total performance score', q.tps ?? ''], ['VBP clinical outcomes domain', q.v_clin ?? ''], ['VBP person and community engagement domain', q.v_pce ?? ''], ['VBP safety domain', q.v_safe ?? ''], ['VBP efficiency and cost domain', q.v_eff ?? ''],
        ...err.map(([k, v]) => [`Excess readmission ratio, ${READM_LABEL[k]}`, v]), ['HAC total score', q.hac ?? ''], ['HAC payment reduction', q.hacpen == null ? '' : q.hacpen ? 'Yes' : 'No'], ['PSI 90 patient safety composite', q.psi90 ?? '']]}>
      <div className="hp-grid">
        <div className="hp-kpi"><b style={{ color: 'var(--amber)', letterSpacing: 2 }}>{stars(q.star)}</b><span>CMS overall star rating</span></div>
        <div className="hp-kpi"><b style={{ color: 'var(--amber)', letterSpacing: 2 }}>{stars(q.pstar)}</b><span>patient experience rating</span><i>{q.r910 != null ? `${q.r910}% rate it 9 or 10; ${q.rec}% would definitely recommend` : ''}{q.surveys ? ` (${fmtInt(q.surveys)} surveys)` : ''}</i></div>
        <div className="hp-kpi"><b>{q.tps ?? 'n/a'}</b><span>value-based purchasing total performance score (0 to 100)</span><i>{tp != null ? `Higher than about ${tp}% of hospitals; national median ${M.tps_pct[10]}` : 'Not scored this year'}</i></div>
        <div className="hp-kpi"><b style={{ color: q.hacpen ? 'var(--red)' : undefined }}>{q.hacpen == null ? 'n/a' : q.hacpen ? 'Penalized' : 'No penalty'}</b><span>hospital-acquired condition program</span><i>{q.hac != null ? `Total HAC score ${q.hac} (higher is worse)` : ''}{q.psi90 != null ? `; PSI 90 safety composite ${q.psi90}` : ''}</i></div>
        <div className="hp-kpi"><b style={{ color: q.err_hi ? 'var(--red)' : undefined }}>{q.err_hi ?? 'n/a'}{q.err ? ` of ${err.length}` : ''}</b><span>conditions with more readmissions than expected</span><i>Each one above expected adds to the readmission penalty</i></div>
      </div>
      {q.tps != null && <table className="cm-table" style={{ marginTop: 12 }}><thead><tr><th>Value-based purchasing domain (0 to 100)</th><th className="n">Score</th></tr></thead>
        <tbody>{[['Clinical outcomes', q.v_clin], ['Person and community engagement', q.v_pce], ['Safety', q.v_safe], ['Efficiency and cost reduction', q.v_eff]].map(([l, v]) => <tr key={l}><td>{l}</td><td className="n">{v ?? 'n/a'}</td></tr>)}</tbody></table>}
      {err.length > 0 && <table className="cm-table" style={{ marginTop: 12 }}><thead><tr><th>Readmissions program condition</th><th className="n">Excess readmission ratio</th><th>Compared with expected</th></tr></thead>
        <tbody>{err.map(([k, v]) => <tr key={k}><td>{READM_LABEL[k]}</td><td className="n" style={{ color: v > 1 ? 'var(--red)' : 'var(--teal-dark)' }}>{v.toFixed(3)}</td><td>{v > 1 ? `${((v - 1) * 100).toFixed(1)}% more readmissions than expected` : `${((1 - v) * 100).toFixed(1)}% fewer than expected`}</td></tr>)}</tbody></table>}
      <p className="cm-note">Readmission ratios cover {M.hrrp_period}; patient experience covers {M.hcahps_period}. A ratio above 1.000 means more readmissions than CMS expected for the hospital&apos;s patients. Penalty amounts are set in each year&apos;s Medicare inpatient payment rule and are not in these files.</p>
    </ChartCard>
  );
}
