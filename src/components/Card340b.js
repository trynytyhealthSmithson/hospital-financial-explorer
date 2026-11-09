import React, { useEffect, useState } from 'react';
import ChartCard from './ChartCard';
import { load340b, pctRank, fmtInt } from '../data';

const yrs = d => (d ? Math.max(0, (Date.now() - new Date(d).getTime()) / 3.156e10) : null);

/** 340B Drug Pricing Program participation from HRSA OPAIS. */
export default function Card340b({ ccn }) {
  const [B, setB] = useState(null);
  useEffect(() => { load340b().then(setB); }, []);
  if (!B) return null;
  const M = B.meta, r = B.h[ccn];
  const sub = `From HRSA's 340B covered entity registry as of ${M.as_of}. 340B lets eligible hospitals buy outpatient drugs at steep discounts; savings are not reported publicly.`;
  if (!r) return <ChartCard title="340B Drug Pricing Program" style={{ marginTop: 14 }} sub={sub}><p className="cm-note" style={{ marginTop: 0 }}>This hospital has never registered for 340B as a hospital covered entity.</p></ChartCard>;
  const [type, start, on, kids, cp, cpOut, term, why, id] = r;
  const cpr = pctRank(cp, M.cp_pct);
  return (
    <ChartCard title="340B Drug Pricing Program" style={{ marginTop: 14 }} sub={sub}
      csvName={`hospital-${ccn}-340b`} csv={() => [['measure', 'value'], ['340B id', id], ['entity type', M.types[type]], ['participating', on ? 'yes' : 'no'], ['participating since', start], ['active child sites', kids], ['active contract pharmacies', cp], ['contract pharmacies in other states', cpOut], ['termination date', term || ''], ['termination reason', why || '']]}>
      {on ? <div className="hp-grid">
        <div className="hp-kpi"><b style={{ color: 'var(--teal-dark)' }}>Participating</b><span>{M.types[type]}</span><i>Since {start ? start.slice(0, 4) : 'n/a'} ({Math.floor(yrs(start))} years) · {id}</i></div>
        <div className="hp-kpi"><b>{fmtInt(kids)}</b><span>registered child sites</span><i>Off-site outpatient locations that can also use 340B drugs</i></div>
        <div className="hp-kpi"><b>{fmtInt(cp)}</b><span>active contract pharmacies</span><i>{cpr != null ? `More than about ${cpr}% of participating hospitals (median ${M.cp_median})` : ''}</i></div>
        <div className="hp-kpi"><b>{fmtInt(cpOut)}</b><span>contract pharmacies in other states</span><i>Usually mail-order and specialty pharmacies</i></div>
      </div> : <p className="cm-note" style={{ marginTop: 0 }}><b>Not participating.</b> Registered as a {M.types[type].toLowerCase()} ({id}){term ? `; terminated ${term}` : ''}{why ? ` (${why.toLowerCase()})` : ''}.</p>}
    </ChartCard>
  );
}
