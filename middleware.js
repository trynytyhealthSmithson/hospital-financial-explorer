// Vercel Routing Middleware: the data files behind a paid tool only go to a signed-in account that
// includes the tool. Inactive until CLERK_SECRET_KEY is set, so a deployment without Clerk keys
// behaves exactly as before.
import { verifyToken } from '@clerk/backend';
import { next } from '@vercel/functions';
import { grantOf } from './src/auth/entitle';
import { TOOL } from './src/auth/tool';

export const config = { matcher: ['/data/:path*'] };

const deny = (status, error) => new Response(JSON.stringify({ error }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

const fromCookie = header => {
  const jar = Object.fromEntries((header || '').split(/;\s*/).filter(Boolean).map(p => {
    const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
  }));
  if (jar.__session) return jar.__session;
  const k = Object.keys(jar).find(n => n.startsWith('__session_'));
  return k ? jar[k] : '';
};

export default async function middleware(request) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return next();
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '') || fromCookie(request.headers.get('cookie'));
  if (!token) return deny(401, 'Sign in to use this tool.');
  let claims;
  try { claims = await verifyToken(token, { secretKey }); } catch (e) { return deny(401, 'Your sign-in expired. Please refresh the page.'); }
  if (!grantOf(claims, TOOL)) return deny(403, 'Your account does not include this tool.');
  return next({ headers: { 'cache-control': 'private, no-store' } });
}
