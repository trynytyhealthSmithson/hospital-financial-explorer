// Vercel serverless function: stores beta sign-ups, feedback and data-issue reports in the shared
// TRYNYTY beta database (Neon Postgres, connected to each explorer through Vercel Storage).
const { neon } = require('@neondatabase/serverless');

const KINDS = new Set(['signup', 'feedback', 'issue']);
const TOOLS = new Set(['ma-enrollment', 'hospital-financial', 'physician-practice']);
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
let ready = false;

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Use POST.' }); }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return res.status(400).json({ error: 'Invalid request.' }); } }
  if (b.website) return res.status(200).json({ ok: true });   // honeypot field: bots fill it, people never see it
  const kind = KINDS.has(b.kind) ? b.kind : null;
  const email = str(b.email, 200).toLowerCase();
  const message = str(b.message, 5000);
  if (!kind) return res.status(400).json({ error: 'Invalid request.' });
  if (kind === 'signup' && !EMAIL.test(email)) return res.status(400).json({ error: 'Please enter a valid work email.' });
  if (email && !EMAIL.test(email)) return res.status(400).json({ error: 'Please check the email address.' });
  if (kind !== 'signup' && !message) return res.status(400).json({ error: 'Please add a short description.' });
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return res.status(503).json({ error: 'The form is not connected yet. Please email andrew@trynytyhealth.com.' });
  const tools = (Array.isArray(b.tools) ? b.tools : []).filter(t => TOOLS.has(t));
  const tool = TOOLS.has(b.tool) ? b.tool : null;
  try {
    const sql = neon(url);
    if (!ready) {
      await sql`CREATE TABLE IF NOT EXISTS beta_submissions (
        id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), tool text, kind text NOT NULL,
        name text, email text, organization text, role text, tools text[], use_case text, message text,
        page text, page_title text, consent boolean, user_agent text)`;
      ready = true;
    }
    await sql`INSERT INTO beta_submissions (tool, kind, name, email, organization, role, tools, use_case, message, page, page_title, consent, user_agent)
      VALUES (${tool}, ${kind}, ${str(b.name, 200) || null}, ${email || null}, ${str(b.organization, 200) || null}, ${str(b.role, 100) || null},
              ${tools}, ${str(b.use_case, 3000) || null}, ${message || null}, ${str(b.page, 1000) || null}, ${str(b.page_title, 300) || null},
              ${kind === 'signup' ? b.consent === true : null}, ${str(req.headers['user-agent'], 300) || null})`;
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('beta submission failed', e);
    return res.status(500).json({ error: 'Something went wrong. Please try again, or email andrew@trynytyhealth.com.' });
  }
};
