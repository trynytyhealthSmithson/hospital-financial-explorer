import React, { useEffect, useState } from 'react';

// Beta registration, feedback and data-issue reports. Posts to this project's /api/beta, which stores the
// submission in the shared TRYNYTY beta database. TOOL and ENDPOINT are set per explorer.
const TOOL = 'hospital-financial';
const ENDPOINT = '/api/beta';
const TOOLS = [['ma-enrollment', 'MA Enrollment Explorer'], ['hospital-financial', 'Hospital Financial Explorer'], ['physician-practice', 'Physician & Practice Explorer']];
const ROLES = ['Health system or hospital', 'Health plan', 'ACO, IPA or PSHP', 'Physician group', 'Consultant or advisor', 'Investor', 'Other'];
const TITLES = { signup: 'Join the beta', feedback: 'Send feedback', issue: 'Report a data issue' };
const INTRO = {
  signup: 'This explorer is free during the beta. Beta members who share feedback get 50% off their first year when it moves to paid licenses, and credit toward the TRYNYTY Market Terminal.',
  feedback: 'What works, what is missing, what would make this worth paying for. Every note is read.',
  issue: 'Tell us what looks wrong. The page you are on is attached automatically, so we can find it.',
};

const field = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--gray-700)' };
const input = { font: 'inherit', fontSize: 14, padding: '9px 10px', border: '1px solid var(--gray-300, #dee2e6)', borderRadius: 6, background: '#fff', color: 'var(--gray-900, #212529)' };
const btn = { font: 'inherit', fontSize: 13, fontWeight: 600, padding: '7px 12px', minHeight: 34, borderRadius: 6, cursor: 'pointer' };

export function BetaButtons() {
  const [open, setOpen] = useState(null);
  return (
    <>
      <button type="button" onClick={() => setOpen('signup')} style={{ ...btn, border: 'none', background: 'var(--teal-dark)', color: '#fff' }}>Join the beta</button>
      <button type="button" onClick={() => setOpen('issue')} style={{ ...btn, border: '1px solid var(--gray-300, #dee2e6)', background: '#fff', color: 'var(--gray-700)' }}>Report a data issue</button>
      {open && <BetaDialog kind={open} setKind={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}

function BetaDialog({ kind, setKind, onClose }) {
  const [f, setF] = useState({ name: '', email: '', organization: '', role: '', tools: [TOOL], use_case: '', message: '', consent: true, website: '' });
  const [state, setState] = useState('idle');   // idle | sending | done | error
  const [err, setErr] = useState('');
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const toggleTool = t => set('tools', f.tools.includes(t) ? f.tools.filter(x => x !== t) : [...f.tools, t]);
  const submit = async e => {
    e.preventDefault(); setState('sending'); setErr('');
    try {
      const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, kind, tool: TOOL, page: window.location.href, page_title: document.title }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
      setState('done');
    } catch (x) { setErr(x.message); setState('error'); }
  };
  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(11,24,41,0.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '6vh 16px' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="beta-title" onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 520, padding: '22px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 id="beta-title" style={{ margin: 0, fontFamily: 'var(--serif)', fontWeight: 400, color: 'var(--navy)', fontSize: 24 }}>{TITLES[kind]}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...btn, border: 'none', background: 'none', fontSize: 20, lineHeight: 1, color: 'var(--gray-600)' }}>×</button>
        </div>
        {state === 'done' ? (
          <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6, color: 'var(--gray-700)' }}>
            <p>{kind === 'signup' ? 'You are on the beta list. We will email you before licenses go on sale, with your founding price.' : 'Thank you. We will look into it and follow up if you left an email address.'}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {kind !== 'feedback' && <button type="button" style={{ ...btn, border: '1px solid var(--gray-300, #dee2e6)', background: '#fff' }} onClick={() => { setState('idle'); setKind('feedback'); }}>Send feedback too</button>}
              <button type="button" style={{ ...btn, border: 'none', background: 'var(--teal-dark)', color: '#fff' }} onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--gray-700)' }}>{INTRO[kind]}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ ...field, flex: '1 1 200px' }}>Name<input style={input} value={f.name} onChange={e => set('name', e.target.value)} autoComplete="name" required={kind === 'signup'} /></label>
              <label style={{ ...field, flex: '1 1 200px' }}>Work email{kind !== 'signup' ? ' (optional)' : ''}<input style={input} type="email" value={f.email} onChange={e => set('email', e.target.value)} autoComplete="email" required={kind === 'signup'} /></label>
            </div>
            {kind === 'signup' && <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ ...field, flex: '1 1 200px' }}>Organization<input style={input} value={f.organization} onChange={e => set('organization', e.target.value)} autoComplete="organization" /></label>
                <label style={{ ...field, flex: '1 1 200px' }}>Role<select style={input} value={f.role} onChange={e => set('role', e.target.value)}><option value="">Choose one</option>{ROLES.map(r => <option key={r}>{r}</option>)}</select></label>
              </div>
              <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <legend style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 4 }}>Tools you are interested in</legend>
                {TOOLS.map(([id, nm]) => <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={f.tools.includes(id)} onChange={() => toggleTool(id)} />{nm}</label>)}
              </fieldset>
              <label style={field}>What would you use it for?<textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={f.use_case} onChange={e => set('use_case', e.target.value)} /></label>
            </>}
            {kind !== 'signup' && <label style={field}>{kind === 'issue' ? 'What looks wrong, and what did you expect?' : 'Your feedback'}<textarea style={{ ...input, minHeight: 110, resize: 'vertical' }} value={f.message} onChange={e => set('message', e.target.value)} required /></label>}
            <label aria-hidden="true" style={{ position: 'absolute', left: -10000, width: 1, height: 1, overflow: 'hidden' }}>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={e => set('website', e.target.value)} /></label>
            {kind === 'signup' && <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--gray-700)' }}><input type="checkbox" checked={f.consent} onChange={e => set('consent', e.target.checked)} style={{ marginTop: 3 }} />Email me about founding pricing and new features. You can unsubscribe at any time.</label>}
            {err && <p role="alert" style={{ margin: 0, color: '#9a2c2c', fontSize: 13 }}>{err}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <a href="https://www.trynytyhealth.com/privacy" target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Privacy policy</a>
              <button type="submit" disabled={state === 'sending'} style={{ ...btn, border: 'none', background: 'var(--teal-dark)', color: '#fff', minHeight: 40, padding: '9px 18px', opacity: state === 'sending' ? 0.7 : 1 }}>{state === 'sending' ? 'Sending' : kind === 'signup' ? 'Join the beta' : 'Send'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
