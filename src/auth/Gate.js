// Sign-in and access gate for a paid explorer. With no REACT_APP_CLERK_PUBLISHABLE_KEY (production
// today) it renders the app unchanged. With a key it asks for sign-in, checks that the account
// includes this tool, signs the account out of other devices, and sends the sign-in token with
// every /data request so the edge middleware can check it too.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClerkProvider, SignIn, UserButton, OrganizationSwitcher, useAuth, useClerk, useOrganizationList } from '@clerk/react';
import { grantOf, decodeClaims } from './entitle';
import { TOOL, TOOL_NAME } from './tool';
import './gate.css';

const PK = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
export const AUTH_ON = !!PK;
const PRICING = 'https://www.trynytyhealth.com/pricing';
const FREE = 'https://www.trynytyhealth.com/tools';

// Add the sign-in token to same-site /data requests. Installed once; reads the current getter.
const tokenGetter = { fn: null };
let patched = false;
const patchFetch = () => {
  if (patched || typeof window === 'undefined') return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    let path = '';
    try { const u = new URL(url, window.location.href); if (u.origin === window.location.origin) path = u.pathname; } catch (e) { /* ignore */ }
    if (!path.startsWith('/data/') || !tokenGetter.fn) return orig(input, init);
    const token = await tokenGetter.fn().catch(() => null);
    if (!token) return orig(input, init);
    const headers = new Headers((init && init.headers) || (typeof input !== 'string' && input.headers) || undefined);
    headers.set('Authorization', `Bearer ${token}`);
    if (typeof input === 'string') return orig(input, { ...(init || {}), headers });
    return orig(new Request(input, { ...(init || {}), headers }));
  };
};

const Shell = ({ children }) => (
  <div className="gate">
    <div className="gate-card">
      <a className="gate-brand" href="https://www.trynytyhealth.com"><img src="/logo.png" alt="TRYNYTY" /></a>
      {children}
    </div>
  </div>
);

const Waiting = ({ text }) => <Shell><p className="gate-wait">{text || 'Loading…'}</p></Shell>;

function SignedOutView() {
  const bumped = (() => { try { return sessionStorage.getItem('ty_signed_in') === '1'; } catch (e) { return false; } })();
  return (
    <Shell>
      <h1 className="gate-title">Sign in to the {TOOL_NAME}</h1>
      {bumped && <p className="gate-note">You were signed out, most likely because this account signed in on another device. Each license is for one person at a time.</p>}
      <div className="gate-signin"><SignIn routing="virtual" withSignUp /></div>
      <p className="gate-foot">
        No account yet? Create one above, then choose a plan on the <a href={PRICING}>pricing page</a>.
        The MSSP, ACO REACH and MA Quality tools stay open without an account: <a href={FREE}>see all tools</a>.
      </p>
    </Shell>
  );
}

function NoAccessView({ recheck, checking, inOrg }) {
  const { signOut } = useClerk();
  return (
    <Shell>
      <h1 className="gate-title">Your account does not include the {TOOL_NAME} yet</h1>
      <p className="gate-text">
        {inOrg ? 'Your team’s plan does not cover this tool, or it has ended. ' : ''}
        Plans are annual, for one person or a team of up to five. During the beta testing period, licenses are 50% off the first year for testers who send feedback through the app.
      </p>
      <div className="gate-actions">
        <a className="gate-btn primary" href={PRICING}>See pricing</a>
        <button className="gate-btn" onClick={recheck} disabled={checking}>{checking ? 'Checking…' : 'I just got access, check again'}</button>
        <button className="gate-btn link" onClick={() => signOut()}>Sign out</button>
      </div>
      <div className="gate-user"><UserButton /></div>
    </Shell>
  );
}

function Inner({ children }) {
  const { isLoaded, isSignedIn, sessionId, orgId, getToken } = useAuth();
  const { setActive, userMemberships, isLoaded: orgsLoaded } = useOrganizationList({ userMemberships: true });
  const [state, setState] = useState({ key: null, grant: null });
  const [checking, setChecking] = useState(false);
  const claimed = useRef(null);
  tokenGetter.fn = isSignedIn ? () => getToken() : null;

  // Team members: make their organization active so its plan applies.
  const memberships = (userMemberships && userMemberships.data) || [];
  useEffect(() => {
    if (isSignedIn && orgsLoaded && !orgId && memberships.length && setActive) setActive({ organization: memberships[0].organization.id });
  }, [isSignedIn, orgsLoaded, orgId, memberships.length, setActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = useCallback(async fresh => {
    const token = await getToken(fresh ? { skipCache: true } : undefined).catch(() => null);
    setState({ key: `${sessionId}|${orgId || ''}`, grant: token ? grantOf(decodeClaims(token), TOOL) : null });
  }, [getToken, sessionId, orgId]);

  useEffect(() => {
    if (!isSignedIn) return;
    try { sessionStorage.setItem('ty_signed_in', '1'); } catch (e) { /* private mode */ }
    check(false);
    if (claimed.current !== sessionId) {           // one person per license: sign out other devices
      claimed.current = sessionId;
      getToken().then(t => t && fetch('/api/session', { method: 'POST', headers: { Authorization: `Bearer ${t}` } })).catch(() => {});
    }
  }, [isSignedIn, sessionId, orgId, check, getToken]);

  if (!isLoaded) return <Waiting />;
  if (!isSignedIn) return <SignedOutView />;
  if (state.key !== `${sessionId}|${orgId || ''}`) return <Waiting text="Checking your access…" />;
  if (!state.grant) return <NoAccessView inOrg={!!orgId} checking={checking} recheck={async () => { setChecking(true); await check(true); setChecking(false); }} />;
  return children;
}

export default function Gate({ children }) {
  if (!AUTH_ON) return children;
  patchFetch();
  return <ClerkProvider publishableKey={PK} afterSignOutUrl="/"><Inner>{children}</Inner></ClerkProvider>;
}

// Account menu for the top bar: renders nothing when sign-in is off.
export function AccountButton() {
  if (!AUTH_ON) return null;
  return (
    <span className="gate-account">
      <OrganizationSwitcher />
      <UserButton />
    </span>
  );
}
