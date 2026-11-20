// Sign-in and access gate for a paid explorer. With no REACT_APP_CLERK_PUBLISHABLE_KEY (production
// today) it renders the app unchanged. With a key it asks for sign-in, checks that the account
// includes this tool, signs the account out of other devices, and sends the sign-in token with
// every /data request so the edge middleware can check it too.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClerkProvider, SignIn, UserButton, OrganizationSwitcher, useAuth, useClerk, useOrganizationList } from '@clerk/react';
import { grantOf, decodeClaims, planSummary, orgDomainOk, TOOLS } from './entitle';
import { TOOL, TOOL_NAME } from './tool';
import './gate.css';

const PK = process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;
export const AUTH_ON = !!PK;
const PRICING = 'https://www.trynytyhealth.com/pricing';
const FREE = 'https://www.trynytyhealth.com/tools';
const ACCOUNT = process.env.REACT_APP_ACCOUNT_URL || 'https://www.trynytyhealth.com/account';

const CardIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" /><path d="M1.5 6.5h13" />
  </svg>
);
// The Clerk account menu, plus a link to the plan and billing page on the website.
const AccountUserButton = () => (
  <UserButton>
    <UserButton.MenuItems>
      <UserButton.Link label="Plan and billing" labelIcon={<CardIcon />} href={ACCOUNT} />
    </UserButton.MenuItems>
  </UserButton>
);

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

const fmtDate = d => { const t = Date.parse(d); return isNaN(t) ? '' : new Date(t).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };
const pricingFor = anchor => `${PRICING}?tool=${TOOL}#${anchor}`;

function NoAccessView({ claims, recheck, checking, inOrg }) {
  const { signOut } = useClerk();
  const { have, ended } = planSummary(claims);
  const endedThis = ended[TOOL];
  const teamPlan = inOrg && planSummary({ org_tools: claims && claims.org_tools, org_until: claims && claims.org_until }).have.length > 0;
  let title; let body;
  const doms = [].concat((claims && claims.org_domains) || []).filter(Boolean);
  if (inOrg && !orgDomainOk(claims)) {
    title = `Your team’s plan covers ${doms.map(d => `@${d}`).join(' or ')} email addresses`;
    body = <p className="gate-text">Sign in with your work email to use your team’s plan, or ask your team admin to contact us if you work with the team from another organization.</p>;
  } else if (endedThis) {
    title = `Your access to the ${TOOL_NAME} ended on ${fmtDate(endedThis)}`;
    body = <p className="gate-text">Renew on the pricing page to pick up where you left off.{inOrg ? ' If your team renews, ask your team admin to let us know.' : ''}</p>;
  } else if (have.length) {
    title = `The ${TOOL_NAME} is not part of your ${teamPlan ? 'team’s ' : ''}plan`;
    body = (
      <>
        <p className="gate-text">Your plan includes:</p>
        <ul className="gate-have">{have.map(k => <li key={k}><a href={TOOLS[k].url}>{TOOLS[k].name} →</a></li>)}</ul>
        <p className="gate-text">
          Add the {TOOL_NAME} on its own, or move to the plan with all three explorers, which covers them all in one annual subscription.
        </p>
      </>
    );
  } else {
    title = `Your account does not include the ${TOOL_NAME} yet`;
    body = <p className="gate-text">{inOrg ? 'Your team’s plan does not cover this tool. ' : ''}Plans are annual, for one person or a team of up to five, with one explorer or all three.</p>;
  }
  return (
    <Shell>
      <h1 className="gate-title">{title}</h1>
      {body}
      <p className="gate-text gate-beta">Beta testing period: 50% off the first year for testers who send feedback through the app.</p>
      <div className="gate-actions">
        {have.length && !endedThis
          ? <><a className="gate-btn primary" href={pricingFor('all-three')}>See the all-three plan</a><a className="gate-btn" href={pricingFor('one-explorer')}>Add this tool only</a></>
          : <a className="gate-btn primary" href={pricingFor('plans')}>{endedThis ? 'Renew' : 'See pricing'}</a>}
        <button className="gate-btn" onClick={recheck} disabled={checking}>{checking ? 'Checking…' : 'I just got access, check again'}</button>
        <button className="gate-btn link" onClick={() => signOut()}>Sign out</button>
      </div>
      <div className="gate-user"><AccountUserButton /></div>
    </Shell>
  );
}

function Inner({ children }) {
  const { isLoaded, isSignedIn, sessionId, orgId, getToken } = useAuth();
  const { setActive, userMemberships, isLoaded: orgsLoaded } = useOrganizationList({ userMemberships: true });
  const [state, setState] = useState({ key: null, grant: null, claims: {} });
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
    const claims = token ? decodeClaims(token) : {};
    setState({ key: `${sessionId}|${orgId || ''}`, grant: grantOf(claims, TOOL), claims });
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

  // Re-check now and then, so a plan that ends or changes takes effect without a page reload.
  useEffect(() => {
    if (!isSignedIn) return undefined;
    const again = () => { if (document.visibilityState === 'visible') check(true); };
    const timer = setInterval(again, 5 * 60 * 1000);
    window.addEventListener('focus', again);
    return () => { clearInterval(timer); window.removeEventListener('focus', again); };
  }, [isSignedIn, check]);

  if (!isLoaded) return <Waiting />;
  if (!isSignedIn) return <SignedOutView />;
  if (state.key !== `${sessionId}|${orgId || ''}`) return <Waiting text="Checking your access…" />;
  if (!state.grant) return <NoAccessView claims={state.claims} inOrg={!!orgId} checking={checking} recheck={async () => { setChecking(true); await check(true); setChecking(false); }} />;
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
  return <AccountMenu />;
}

// The team picker only shows for people who belong to a team.
function AccountMenu() {
  const { userMemberships } = useOrganizationList({ userMemberships: true });
  const teams = (userMemberships && userMemberships.count) || 0;
  return (
    <span className="gate-account">
      {teams > 0 && <OrganizationSwitcher hidePersonal={teams > 0} />}
      <AccountUserButton />
    </span>
  );
}
