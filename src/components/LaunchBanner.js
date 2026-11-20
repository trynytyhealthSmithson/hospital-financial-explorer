// Heads-up before subscriptions start: shown while sign-in is off (that is, before launch), and
// hidden for good once it is on. REACT_APP_LAUNCH_DATE (e.g. "December 1") makes the date exact.
import React, { useState } from 'react';
import { AUTH_ON } from '../auth/Gate';
import { TOOL_NAME } from '../auth/tool';

const WHEN = process.env.REACT_APP_LAUNCH_DATE ? `on ${process.env.REACT_APP_LAUNCH_DATE}` : 'in December';
const KEY = 'ty_launch_banner_closed';
// Previews have sign-in on, so ?banner=1 shows the notice there for review.
const FORCE = typeof window !== 'undefined' && /[?&]banner=1/.test(window.location.search);

export default function LaunchBanner() {
  const [closed, setClosed] = useState(() => { try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; } });
  if ((AUTH_ON && !FORCE) || closed) return null;
  const close = () => { try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* private mode */ } setClosed(true); };
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '9px 28px', background: 'var(--navy, #0B1829)', color: '#fff', fontSize: 13.5, lineHeight: 1.5 }}>
      <span style={{ flex: '1 1 320px' }}>
        <b>Subscriptions to the {TOOL_NAME} start {WHEN}.</b> Annual plans for one person or a team of five. Beta testers who send feedback get 50% off their first year.
      </span>
      <a href="https://www.trynytyhealth.com/pricing" style={{ color: '#5fd3c9', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>See pricing →</a>
      <button type="button" onClick={close} aria-label="Hide this notice" style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '0 4px' }}>×</button>
    </div>
  );
}
