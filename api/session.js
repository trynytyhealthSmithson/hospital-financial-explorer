// One person per license: when an account signs in, every other active session for that account is
// signed out. The explorer calls this once per new session (src/auth/Gate.js).
const { createClerkClient, verifyToken } = require('@clerk/backend');

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return res.status(503).json({ error: 'Sign-in is not set up here.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in first.' });
  let claims;
  try { claims = await verifyToken(token, { secretKey }); } catch (e) { return res.status(401).json({ error: 'Sign-in expired.' }); }
  try {
    const clerk = createClerkClient({ secretKey });
    const got = await clerk.sessions.getSessionList({ userId: claims.sub, status: 'active', limit: 100 });
    const others = (got.data || got || []).filter(s => s.id !== claims.sid);
    await Promise.all(others.map(s => clerk.sessions.revokeSession(s.id)));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, signedOutElsewhere: others.length });
  } catch (e) {
    return res.status(502).json({ error: 'Could not check other sessions.' });
  }
};
