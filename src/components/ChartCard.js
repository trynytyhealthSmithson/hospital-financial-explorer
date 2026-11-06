import React, { useRef, useState } from 'react';
import { exportChartPNG } from '../utils';

/**
 * ChartCard — wraps any chart with a hover-reveal "↓ PNG" export button.
 * Usage: <ChartCard title="My Chart" filename="my-chart">
 *          <ResponsiveContainer>...</ResponsiveContainer>
 *        </ChartCard>
 */
export default function ChartCard({ title, sub, filename, children, style, headerRight }) {
  const cardRef  = useRef(null);
  const [hover, setHover] = useState(false);
  const exportName = filename || (title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'chart');

  return (
    <div
      className="chart-card"
      ref={cardRef}
      style={{ position: 'relative', ...style }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Header row */}
      {(title || headerRight) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: sub ? 2 : 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            {title && <div className="chart-title">{title}</div>}
            {sub   && <div className="chart-sub">{sub}</div>}
          </div>
          {headerRight}
        </div>
      )}

      {/* Content */}
      {children}

      {/* Export button — appears on hover */}
      {hover && (
        <button
          onClick={() => exportChartPNG(cardRef.current, exportName)}
          title="Export chart as PNG"
          style={{
            position: 'absolute', top: 10, right: 10,
            padding: '3px 9px', fontSize: 11, fontFamily: 'var(--font)',
            border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)',
            background: 'white', color: 'var(--gray-600)', cursor: 'pointer',
            opacity: 0.9, zIndex: 10, fontWeight: 500,
            boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
          }}
          onMouseEnter={e => { e.target.style.background = 'var(--teal-light)'; e.target.style.color = 'var(--teal-dark)'; }}
          onMouseLeave={e => { e.target.style.background = 'white'; e.target.style.color = 'var(--gray-600)'; }}
        >
          ↓ PNG
        </button>
      )}
    </div>
  );
}
