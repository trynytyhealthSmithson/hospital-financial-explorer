import React, { useEffect, useState } from 'react';
import ChartCard from './ChartCard';
import { loadAco, MSSP_URL } from '../data';

/** Medicare Shared Savings Program ACO participation, matched by legal business name. */
export default function CardAco({ ccn }) {
  const [A, setA] = useState(null);
  useEffect(() => { loadAco().then(setA); }, []);
  if (!A) return null;
  const M = A.meta, r = A.h[ccn] || {}, Ly = String(M.latest);
  const cur = r[Ly] || [];
  const yrs = M.years.map(String);
  const sub = `Medicare Shared Savings Program participant lists, performance years ${M.years[0]} to ${M.latest}. CMS lists participants by legal business name only, so hospitals are matched by name; a hospital that joins through its parent company or physician group under another name will not show here.`;
  return (
    <ChartCard title="Medicare Shared Savings Program ACOs" style={{ marginTop: 14 }} sub={sub}
      csvName={`hospital-${ccn}-aco`} csv={() => [['performance_year', 'aco_id', 'aco_name', 'participant_legal_name', 'track', 'aco_initial_start'], ...yrs.flatMap(y => (r[y] || []).map(x => [y, ...x]))]}>
      {cur.length ? <table className="cm-table"><thead><tr><th>ACO ({Ly})</th><th>Participant listed as</th><th>Track</th><th>ACO in MSSP since</th></tr></thead>
        <tbody>{cur.map(x => <tr key={x[0]}><td className="lab"><a href={`${MSSP_URL}/#aco/${encodeURIComponent(x[0])}`} target="_blank" rel="noreferrer">{x[1]}</a> <span style={{ color: 'var(--gray-500)', fontSize: 11 }}>{x[0]}</span></td>
          <td>{x[2]}</td><td>{x[3] ? x[3].replace('BASIC', 'Basic level').replace('ENHANCED', 'Enhanced') : ''}</td><td>{x[4] ? x[4].slice(-4) : ''}</td></tr>)}</tbody></table>
        : <p className="cm-note" style={{ marginTop: 0 }}>Not found on the {Ly} participant list under this hospital&apos;s names.</p>}
      <p className="cm-note">Participation by year: {yrs.map(y => `${y} ${r[y] ? '✓' : '–'}`).join(' · ')}. ACO names link to the ACO in the TRYNYTY MSSP Explorer.</p>
    </ChartCard>
  );
}
