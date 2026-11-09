import React, { useRef } from 'react';
import { exportChartPNG } from '../utils';
import { downloadCSV } from '../data';

/**
 * ChartCard: a titled card with download buttons in its header.
 *  - png: pass `png` (or a `filename`) on charts and maps to offer "PNG", an image of the card.
 *  - csv: pass `csv={() => rows}` (an array of rows, header first) to offer "CSV" of the data behind it.
 * Tables should pass csv only; charts can pass both.
 */
export default function ChartCard({ title, sub, filename, png, csv, csvName, children, style, headerRight }) {
  const cardRef = useRef(null);
  const base = filename || csvName || (title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'export');
  const showPng = png || !!filename;
  const btn = { padding: '3px 9px', fontSize: 11, fontFamily: 'var(--font)', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)', background: 'white', color: 'var(--gray-600)', cursor: 'pointer', fontWeight: 500 };
  const tools = (showPng || csv) && (
    <span className="cc-tools" data-html2canvas-ignore="true" style={{ display: 'flex', gap: 6 }}>
      {csv && <button style={btn} title="Download the data as a CSV file" onClick={() => downloadCSV(csv(), `${(csvName || base).replace(/\.csv$/, '')}.csv`)}>↓ CSV</button>}
      {showPng && <button style={btn} title="Download as an image" onClick={() => exportChartPNG(cardRef.current, base)}>↓ PNG</button>}
    </span>
  );
  return (
    <div className="chart-card" ref={cardRef} style={{ position: 'relative', ...style }}>
      {(title || headerRight || tools) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: sub ? 2 : 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: '1 1 320px' }}>
            {title && <div className="chart-title">{title}</div>}
            {sub && <div className="chart-sub">{sub}</div>}
          </div>
          {(headerRight || tools) && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>{headerRight}{tools}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
