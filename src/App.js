import React, { useCallback, useEffect, useState } from 'react';
import HospitalMap from './components/HospitalMap';
import Overview from './components/Overview';
import Screener from './components/Screener';
import Compare from './components/Compare';
import HospitalProfile from './components/HospitalProfile';
import Methodology from './components/Methodology';
import { loadMeta } from './data';
import { DATA_RELEASE } from './content';

const NAV = [
  { id: 'overview', label: 'Overview', section: 'Explore' },
  { id: 'map', label: 'Hospital Map', section: 'Explore' },
  { id: 'screener', label: 'Hospital Screener', section: 'Explore' },
  { id: 'compare', label: 'Compare Hospitals', section: 'Explore' },
  { id: 'methodology', label: 'Methodology', section: 'Reference' },
];
const PAGE_TITLES = { overview: 'Overview', map: 'Hospital Map', screener: 'Hospital Screener', compare: 'Compare Hospitals', h: 'Hospital Profile', methodology: 'Methodology' };
const APP = 'Hospital Financial Explorer';

// Hash routes: #overview, #map, #map/OH, #map/39061, #map/area/39061,21015, #h/360180, #screener?t=CAH&tm_max=0, #methodology
function parseHash() {
  const [h, q] = (window.location.hash || '').replace(/^#\/?/, '').split('?');
  const [page, id, sub] = h.split('/');
  return { page: PAGE_TITLES[page] ? page : 'overview', id: id ? decodeURIComponent(id) : null, sub: sub ? decodeURIComponent(sub) : null, q: q || '' };
}

function Brand() {
  return (
    <a className="sidebar-brand" href="https://www.trynytyhealth.com/tools" title="TRYNYTY health:enablement">
      <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="" />
      <span className="brand-word">TRYNYTY<span className="t2">health<b>:enablement</b></span></span>
    </a>
  );
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [meta, setMeta] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => { loadMeta().then(setMeta); }, []);
  useEffect(() => {
    const apply = () => {
      const r = parseHash(); setRoute(r);
      if (r.page !== 'h') document.title = `${PAGE_TITLES[r.page]} | ${APP} | TRYNYTY health:enablement`;
      if (typeof window.gtag === 'function') window.gtag('event', 'page_view', { page_title: PAGE_TITLES[r.page], page_location: window.location.href });
    };
    apply(); window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);
  const scrollKey = route.page === 'h' ? 'h:' + route.id : route.page;
  useEffect(() => { document.querySelector('.page-content')?.scrollTo(0, 0); }, [scrollKey]);

  const setPage = useCallback(p => { window.location.hash = `#${p}`; setDrawerOpen(false); }, []);
  const onHospital = useCallback(c => { window.location.hash = `#h/${c}`; }, []);
  const active = route.page === 'h' ? 'map' : route.page;
  const sections = [...new Set(NAV.map(n => n.section))];
  const nav = (
    <nav className="sidebar-nav">{sections.map(section => (
      <div key={section}><div className="nav-section-label">{section}</div>
        {NAV.filter(n => n.section === section).map(item => <button key={item.id} className={`nav-item ${active === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>{item.label}</button>)}</div>))}
    </nav>
  );
  const last = meta ? meta.years[meta.years.length - 1] : '';

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Brand /><div className="sidebar-app">{APP}</div>{nav}
        <div className="sidebar-footer">
          Data: CMS Hospital Provider Cost Reports<br />{meta ? `${meta.years[0]} to ${last}` : ''} &nbsp;|&nbsp; {meta ? meta.counts[last].hospitals.toLocaleString() : ''} hospitals
          <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
            Last updated: {DATA_RELEASE.lastUpdated}<br />Source: {DATA_RELEASE.source}<br /><a href="#methodology">Methodology and release notes</a>
          </div>
        </div>
      </aside>
      <div className={`mobile-overlay ${drawerOpen ? 'open' : ''}`} onClick={() => setDrawerOpen(false)} />
      <div className={`mobile-drawer ${drawerOpen ? 'open' : ''}`}><Brand /><div className="sidebar-app">{APP}</div>{nav}</div>
      <div className="main-area">
        <div className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="hamburger-btn" onClick={() => setDrawerOpen(o => !o)} aria-label="Menu"
              style={{ display: 'none', flexDirection: 'column', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>
              {[0, 1, 2].map(i => <span key={i} style={{ display: 'block', width: 20, height: 2, background: 'var(--gray-600)', borderRadius: 2 }} />)}
            </button>
            <div className="topbar-title">{PAGE_TITLES[route.page]}</div>
          </div>
          <div className="topbar-links">
            <span className="topbar-badge">Beta · cost reports {meta ? `${meta.years[0]} to ${last}` : ''}</span>
            <a href="#methodology">Methodology</a>
            <a href="https://www.trynytyhealth.com/tools">More TRYNYTY tools</a>
          </div>
        </div>
        <div className="page-content">
          {!meta ? <div style={{ padding: 60, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div> : <>
            {route.page === 'overview' && <Overview meta={meta} setPage={setPage} />}
            {route.page === 'compare' && <Compare meta={meta} ids={route.id} />}
            {route.page === 'screener' && <Screener meta={meta} query={route.q} onHospital={onHospital} />}
            {route.page === 'map' && <HospitalMap key={route.id || 'us'} meta={meta} route={route} onHospital={onHospital} />}
            {route.page === 'h' && <HospitalProfile key={route.id} ccn={route.id} meta={meta} />}
            {route.page === 'methodology' && <Methodology meta={meta} />}
          </>}
        </div>
      </div>
    </div>
  );
}
