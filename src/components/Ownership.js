import React, { useEffect, useState } from 'react';
import ChartCard from './ChartCard';
import { titleCase } from './HospitalMap';
import { loadOwnership } from '../data';

const KIND = { new_owner: 'New owner', absorbed: 'Absorbed another hospital', merged_into: 'Merged into another hospital' };
const fmtD = d => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'n/a');

/** Banner for hospitals on the Sheps Center closures list. */
export function ClosureBanner({ ccn }) {
  const [O, setO] = useState(null);
  useEffect(() => { loadOwnership().then(setO); }, []);
  const c = O && O.closed[ccn];
  if (!c) return null;
  const [yr, pay, svc] = c;
  return <div className="hp-flag" style={{ borderColor: 'var(--red)' }}><b>Closed or converted in {yr}.</b> This rural hospital stopped providing inpatient care{pay === 'REH' ? ' and converted to a Rural Emergency Hospital' : ''}, according to the UNC Sheps Center. {svc && svc !== 'None' ? `Services that remain: ${svc}.` : 'No services remain listed.'}</div>;
}

/** Ownership history from CMS change-of-ownership records. */
export default function OwnershipCard({ ccn }) {
  const [O, setO] = useState(null);
  useEffect(() => { loadOwnership().then(setO); }, []);
  if (!O) return null;
  const ev = O.chow[ccn] || [];
  if (!ev.length) return null;
  return (
    <ChartCard title="Ownership changes" style={{ marginTop: 14 }}
      sub={`Changes of ownership and mergers recorded in Medicare enrollment (CMS), ${O.meta.chow_from.slice(0, 4)} to ${O.meta.chow_to.slice(0, 7)}.`}
      csvName={`hospital-${ccn}-ownership`} csv={() => [['effective_date', 'event', 'other_hospital', 'other_ccn', 'owner_after', 'owner_before'], ...ev.map(e => [e[0], KIND[e[1]], e[2] || '', e[3] || '', e[4] || '', e[5] || ''])]}>
      <table className="cm-table"><thead><tr><th>Effective</th><th>Event</th><th>Details</th></tr></thead>
        <tbody>{ev.map((e, i) => <tr key={i}><td>{fmtD(e[0])}</td><td>{KIND[e[1]]}</td><td style={{ fontSize: 12 }}>
          {e[1] === 'new_owner' && <>Now owned by <b>{titleCase(e[4] || '')}</b>{e[5] ? <> (previously {titleCase(e[5])})</> : ''}</>}
          {e[1] === 'absorbed' && <>Took in <a href={`#h/${e[3]}`}>{titleCase(e[2] || '')}</a> ({e[3]}), which now bills under this hospital</>}
          {e[1] === 'merged_into' && <>Merged into <a href={`#h/${e[3]}`}>{titleCase(e[2] || '')}</a> ({e[3]}); later cost reports are filed there</>}
        </td></tr>)}</tbody></table>
    </ChartCard>
  );
}
