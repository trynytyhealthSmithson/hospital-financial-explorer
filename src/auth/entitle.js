// Who may use a paid tool. Shared by the browser gate (src/auth/Gate.js), the edge middleware that
// guards /data (middleware.js) and the session API (api/session.js).
//
// Access lives in Clerk public metadata and reaches us through custom session-token claims:
//   single license: user public metadata  { "tools": ["ma", "hospital", "physician"], "until": "2027-12-31" }
//   team license:   organization metadata { "tools": [...], "until": "..." }  (members get it while that organization is active)
// Session token claims (Clerk > Configure > Sessions > Customize session token):
//   { "tools": "{{user.public_metadata.tools}}", "until": "{{user.public_metadata.until}}",
//     "org_tools": "{{org.public_metadata.tools}}", "org_until": "{{org.public_metadata.until}}",
//     "email": "{{user.primary_email_address}}", "org_domains": "{{org.public_metadata.team_domains}}" }
// "all" in tools grants every paid tool. A missing "until" means no end date.

const list = v => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    try { const j = JSON.parse(v); if (Array.isArray(j)) return j; } catch (e) { /* plain text */ }
    return v.split(',').map(s => s.trim());
  }
  return [];
};
const live = (until, now) => !until || until === 'null' || !(Date.parse(until) <= now);

// A team plan covers people whose email is on one of the team's domains, when the team lists any
// (claims "email" and "org_domains"; teams with no list, such as ones set up by hand, cover everyone).
export const orgDomainOk = claims => {
  const c = claims || {};
  const doms = list(c.org_domains).map(d => String(d).toLowerCase()).filter(Boolean);
  if (!doms.length) return true;
  const d = String(c.email || '').toLowerCase().split('@')[1] || '';
  return doms.includes(d);
};

export const grantOf = (claims, tool, now = Date.now()) => {
  const c = claims || {};
  const has = t => { const l = list(t); return l.includes(tool) || l.includes('all'); };
  if (has(c.tools) && live(c.until, now)) return 'user';
  if (has(c.org_tools) && live(c.org_until, now) && orgDomainOk(c)) return 'org';
  return null;
};

export const decodeClaims = token => {
  try {
    const p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const s = typeof atob === 'function' ? atob(p) : Buffer.from(p, 'base64').toString('binary');
    return JSON.parse(decodeURIComponent(escape(s)));
  } catch (e) { return {}; }
};

// The paid tools, for the no-access screen.
export const TOOLS = {
  ma: { name: 'MA Enrollment Explorer', url: 'https://maenroll.trynytyhealth.com' },
  hospital: { name: 'Hospital Financial Explorer', url: 'https://hospitals.trynytyhealth.com' },
  physician: { name: 'Physician & Practice Explorer', url: 'https://physicians.trynytyhealth.com' },
};

// What an account holds right now, and what it held that has ended.
export const planSummary = (claims, now = Date.now()) => {
  const c = claims || {};
  const have = new Set(); const ended = {};
  [[c.tools, c.until], [orgDomainOk(c) ? c.org_tools : null, c.org_until]].forEach(([t, until]) => {
    let l = list(t); if (l.includes('all')) l = Object.keys(TOOLS);
    l.filter(k => TOOLS[k]).forEach(k => {
      if (live(until, now)) have.add(k);
      else if (!ended[k] || Date.parse(until) > Date.parse(ended[k])) ended[k] = until;
    });
  });
  have.forEach(k => delete ended[k]);
  return { have: [...have], ended };
};
