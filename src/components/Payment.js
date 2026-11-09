import React, { useEffect, useState } from 'react';
import ChartCard from './ChartCard';
import { loadIpps, pctRank, fmtPct, fmtUsd, fmtInt, fmtAdj } from '../data';

/** Medicare inpatient payment profile from the FY 2027 IPPS Impact File. */
export default function PaymentCard({ ccn }) {
  const [P, setP] = useState(null);
  useEffect(() => { loadIpps().then(setP); }, []);
  if (!P) return null;
  const p = P.h[ccn];
  if (!p) return null; // Only hospitals paid under the inpatient prospective payment system are in the file
  const M = P.meta, cr = pctRank(p.cmi, M.cmi_pct);
  const net = p.vbp_f != null && p.hrrp_f != null ? p.vbp_f * p.hrrp_f : null;
  const moved = p.pay_cbsa && p.cbsa && p.pay_cbsa !== p.cbsa;
  const rows = [
    ['Case mix index', p.cmi != null ? p.cmi.toFixed(2) : 'n/a', cr != null ? `Higher than about ${cr}% of inpatient PPS hospitals (median ${M.cmi_pct[10].toFixed(2)})` : ''],
    ['Wage index', p.wi != null ? p.wi.toFixed(4) : 'n/a', moved ? 'Paid in a different labor market than where it sits (reclassified)' : 'Paid in its own labor market'],
    ['Rural reclassification (Section 401)', p.s401 === 'Y' ? 'Yes' : 'No', p.s401 === 'Y' ? 'Treated as rural for some Medicare purposes, often to qualify for 340B or other programs' : ''],
    ['DSH patient percentage', p.dshpct != null ? fmtPct(p.dshpct) : 'n/a', 'Medicare SSI and Medicaid days that drive disproportionate share payments'],
    ['DSH add-on to operating payments', p.dshadj != null ? fmtPct(p.dshadj, 2) : 'n/a', ''],
    ['Uncompensated care payment per claim', p.ucp_claim != null ? fmtUsd(p.ucp_claim) : 'n/a', 'Interim amount added to each Medicare inpatient claim'],
    ['Teaching (residents per bed)', p.rtb != null ? p.rtb.toFixed(3) : 'n/a', p.rtb > 0 ? 'Drives indirect medical education payments' : 'No IME payments'],
    ['Medicare inpatient claims (FY 2025)', p.bills != null ? fmtInt(p.bills) : 'n/a', ''],
  ];
  return (
    <ChartCard title={`Medicare payment profile, FY ${M.fy}`} style={{ marginTop: 14 }}
      sub="From the Medicare inpatient payment rule: what drives this hospital's Medicare rates, and the quality adjustments it will receive. Applies only to hospitals paid under the inpatient prospective payment system."
      csvName={`medicare-payment-${ccn}`} csv={() => [['measure', 'value', 'note'], ...rows, ['Value-based purchasing adjustment', fmtAdj(p.vbp_f), ''], ['Readmissions adjustment', fmtAdj(p.hrrp_f), ''], ['Combined quality adjustment', fmtAdj(net), '']]}>
      <div className="hp-grid" style={{ marginBottom: 12 }}>
        <div className="hp-kpi"><b>{p.cmi != null ? p.cmi.toFixed(2) : 'n/a'}</b><span>case mix index (patient acuity)</span><i>{cr != null ? `Higher than about ${cr}% of hospitals` : ''}</i></div>
        <div className="hp-kpi"><b style={{ color: p.vbp_f < 1 ? 'var(--red)' : 'var(--teal-dark)' }}>{fmtAdj(p.vbp_f)}</b><span>value-based purchasing adjustment to Medicare inpatient payments</span></div>
        <div className="hp-kpi"><b style={{ color: p.hrrp_f < 1 ? 'var(--red)' : undefined }}>{fmtAdj(p.hrrp_f)}</b><span>readmissions penalty</span></div>
        <div className="hp-kpi"><b style={{ color: net < 1 ? 'var(--red)' : net > 1 ? 'var(--teal-dark)' : undefined }}>{fmtAdj(net)}</b><span>combined quality adjustment</span><i>The hospital-acquired condition cut (1%) applies on top when the hospital is penalized</i></div>
      </div>
      <table className="cm-table"><tbody>{rows.map(([l, v, n]) => <tr key={l}><td className="lab">{l}</td><td className="n" style={{ whiteSpace: 'nowrap' }}>{v}</td><td style={{ fontSize: 12, color: 'var(--gray-600)' }}>{n}</td></tr>)}</tbody></table>
      <p className="cm-note">Source: {M.source}. CMS labels the value-based purchasing and readmission factors as proxies published with the rule; the factors used for payment can differ slightly. Case mix index uses the MS-DRG version 44 weights.</p>
    </ChartCard>
  );
}
