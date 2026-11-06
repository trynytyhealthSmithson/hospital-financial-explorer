export const fmt = {
  dollars: (v, decimals = 0) => {
    if (v == null || isNaN(v)) return '—';
    const s = v < 0 ? '-' : '', a = Math.abs(v);
    if (a >= 1e9) return `${s}$${(a / 1e9).toFixed(2)}B`;
    if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
    return `${s}$${Number(a).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  },
  pct: (v, decimals = 1) => {
    if (v == null) return '—';
    return `${(v * 100).toFixed(decimals)}%`;
  },
  pctRaw: (v, decimals = 1) => {
    // for values already in 0-100 scale
    if (v == null) return '—';
    return `${Number(v).toFixed(decimals)}%`;
  },
  num: (v, decimals = 0) => {
    if (v == null) return '—';
    return Number(v).toLocaleString('en-US', { maximumFractionDigits: decimals });
  },
  shortNum: (v) => {
    if (v == null) return '—';
    if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
    return String(v);
  },
  pbpm: (v) => {
    if (v == null) return '—';
    return `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
};

// Chart palette built on the TRYNYTY brand (navy #0B1829, teal #20B2AA); purple is retired in favor of navy-light
export const COLORS = {
  navy:        '#112240',
  teal:        '#20B2AA',
  blue:        '#4a6fa5',
  green:       '#178a84',
  red:         '#b4471f',
  amber:       '#d4860a',
  purple:      '#1a3a5c',
  coral:       '#e07b54',
  slate:       '#8892a4',
  lightBlue:   '#9fd8d5',
  gray:        '#c8d0db',
};

export const TRACK_COLORS = {
  'One-Sided':                    '#4a6fa5',
  'Two-Sided (Track 2)':          '#d4860a',
  'Two-Sided (Basic C-E/T1+)':    '#20B2AA',
  'Two-Sided (Enhanced/T3)':      '#112240',
  'Other':                        '#adb5bd',
};

export const YEARS = [2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];

// Annotations for major program events
export const PROGRAM_EVENTS = {
  2016: 'Quality measures expanded',
  2018: 'Track 1+ introduced; SNF waiver',
  2019: 'Pathways to Success launch',
  2020: 'COVID-19',
  2021: 'CAHPS measures added; sliding-scale quality',
  2023: 'Record $2.1B net savings',
};

// ── Chart PNG export via SVG serialization ───────────────────────────────
// Finds the recharts SVG inside a card element and downloads it as PNG
export function exportChartPNG(cardEl, filename = 'chart') {
  if (!cardEl) return;
  const svg = cardEl.querySelector('svg.recharts-surface, svg');
  if (!svg) { alert('No chart found to export.'); return; }

  // Clone and add white background
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%');
  bg.setAttribute('fill', 'white');
  clone.insertBefore(bg, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob   = new Blob([svgStr], { type: 'image/svg+xml' });
  const url    = URL.createObjectURL(blob);

  // Draw onto canvas for PNG
  const img = new Image();
  img.onload = () => {
    const w = svg.clientWidth  || parseInt(svg.getAttribute('width'))  || 800;
    const h = svg.clientHeight || parseInt(svg.getAttribute('height')) || 400;
    const canvas = document.createElement('canvas');
    canvas.width  = w * 2; canvas.height = h * 2; // 2x for retina
    const ctx = canvas.getContext('2d');
    ctx.scale(2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };
  img.src = url;
}
