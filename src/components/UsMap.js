import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { zoom as d3zoom, zoomIdentity, zoomTransform } from 'd3-zoom';
import { select } from 'd3-selection';
import 'd3-transition';
import { MAP_W as W, MAP_H as H, RAMP, NODATA, DIV_NEG, DIV_POS, rampIndex } from '../data';

// Bounding box helpers for cross-state views
export const unionBounds = list => list.reduce((u, b) => (!b ? u : !u ? [[...b[0]], [...b[1]]] : [[Math.min(u[0][0], b[0][0]), Math.min(u[0][1], b[0][1])], [Math.max(u[1][0], b[1][0]), Math.max(u[1][1], b[1][1])]]), null);
export const padBounds = (b, f) => { if (!b) return b; const dx = (b[1][0] - b[0][0]) * f + 4, dy = (b[1][1] - b[0][1]) * f + 4; return [[b[0][0] - dx, b[0][1] - dy], [b[1][0] + dx, b[1][1] + dy]]; };
const overlaps = (a, b) => a[0][0] <= b[1][0] && a[1][0] >= b[0][0] && a[0][1] <= b[1][1] && a[1][1] >= b[0][1];

/**
 * Counties to draw when drilled in: everything in the focus state or selected area, plus
 * neighboring counties in other states that fall inside a padded box around it, so a
 * market that crosses a state line (Cincinnati and Northern Kentucky) is visible.
 */
export function visibleCounties(geo, focusState, area) {
  if (!geo) return [];
  const inArea = area && area.length ? new Set(area) : null;
  let box;
  if (inArea) box = padBounds(unionBounds(geo.counties.filter(c => inArea.has(c.id)).map(c => c.b)), 0.25);
  else if (focusState) box = padBounds(geo.states.find(s => s.id === focusState)?.b, 0.1);
  if (!box) return [];
  const inBox = c => (c.c ? c.c[0] >= box[0][0] && c.c[0] <= box[1][0] && c.c[1] >= box[0][1] && c.c[1] <= box[1][1] : overlaps(c.b, box));
  return geo.counties.filter(c => (inArea ? inArea.has(c.id) : c.id.slice(0, 2) === focusState) || inBox(c)).map(c => c.id);
}

/**
 * Zoomable U.S. choropleth.
 * mode 'states': states, plus the counties in `counties` (the drilled-in view).
 * mode 'counties': every county (used for footprints).
 * selectMode: dragging draws a box; counties whose center falls inside are passed to onSelectBox.
 * Shift-click on a county calls onCounty(id, true) so the caller can add or remove it from an area.
 */
const UsMap = forwardRef(function UsMap({ geo, mode = 'states', focusState = '', counties, area, selected = null, stateFill, countyFill, onState, onCounty, onSelectBox, selectMode = false, tip, legend, extraButtons, overlay }, ref) {
  const svgRef = useRef(null), gRef = useRef(null), zoomRef = useRef(null), selRef = useRef(selectMode);
  const [hover, setHover] = useState(null);
  const [box, setBox] = useState(null);
  selRef.current = selectMode;

  useEffect(() => {
    if (!svgRef.current) return;
    const z = d3zoom().scaleExtent([0.9, 60]).translateExtent([[-200, -200], [W + 200, H + 200]])
      .filter(e => (selRef.current ? e.type === 'wheel' : (!e.ctrlKey || e.type === 'wheel') && !e.button))
      .on('zoom', e => select(gRef.current).attr('transform', e.transform));
    zoomRef.current = z;
    select(svgRef.current).call(z).on('dblclick.zoom', null);
  }, []);
  const zoomTo = useCallback(b => {
    if (!zoomRef.current) return;
    const s = select(svgRef.current).transition().duration(650);
    if (!b) { s.call(zoomRef.current.transform, zoomIdentity); return; }
    const [[x0, y0], [x1, y1]] = b, k = Math.min(40, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H));
    s.call(zoomRef.current.transform, zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }, []);
  useImperativeHandle(ref, () => ({ zoomTo }), [zoomTo]);

  const at = (e, kind, id) => { if (box) return; const r = svgRef.current.getBoundingClientRect(); setHover({ kind, id, x: e.clientX - r.left, y: e.clientY - r.top, w: r.width }); };
  const byId = useMemo(() => new Map(geo.counties.map(c => [c.id, c])), [geo]);
  const areaSet = useMemo(() => new Set(area || []), [area]);
  const showCounties = mode === 'counties' ? geo.counties
    : counties ? counties.map(id => byId.get(id)).filter(Boolean)
    : focusState ? geo.counties.filter(c => c.id.slice(0, 2) === focusState) : [];
  const home = c => (areaSet.size ? areaSet.has(c.id) : !focusState || c.id.slice(0, 2) === focusState);
  const sel = selected && byId.get(selected);
  const tipBody = hover && tip ? tip(hover.kind, hover.id) : null;

  // Drag-to-select, in viewBox coordinates
  const vb = e => { const r = svgRef.current.getBoundingClientRect(); return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]; };
  const down = e => { if (!selectMode) return; e.preventDefault(); e.currentTarget.setPointerCapture && e.currentTarget.setPointerCapture(e.pointerId); const p = vb(e); setHover(null); setBox([p, p]); };
  const move = e => { if (box) setBox([box[0], vb(e)]); };
  const up = () => {
    if (!box) return;
    const t = zoomTransform(svgRef.current), a = t.invert(box[0]), b = t.invert(box[1]);
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    setBox(null);
    if (x1 - x0 < 1 && y1 - y0 < 1) return;
    const ids = geo.counties.filter(c => c.c && c.c[0] >= x0 && c.c[0] <= x1 && c.c[1] >= y0 && c.c[1] <= y1).map(c => c.id);
    onSelectBox && onSelectBox(ids);
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div className="cm-zoom">
          <button type="button" onClick={() => zoomRef.current && select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.6)} aria-label="Zoom in">+</button>
          <button type="button" onClick={() => zoomRef.current && select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1 / 1.6)} aria-label="Zoom out">&minus;</button>
          <button type="button" className="w" onClick={() => zoomTo(null)}>Whole U.S.</button>
          {focusState && !areaSet.size && mode === 'states' && <button type="button" className="w" onClick={() => zoomTo(geo.states.find(x => x.id === focusState)?.b)}>Fit state</button>}
          {extraButtons}
        </div>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={`cm-svg${selectMode ? ' selecting' : ''}`} onMouseLeave={() => setHover(null)} role="img" aria-label="Map of the United States">
          <rect width={W} height={H} fill="transparent" onClick={() => onState && onState('')} />
          <g ref={gRef}>
            {mode === 'states' && geo.states.filter(s => s.id !== focusState || areaSet.size).map(s => (
              <path key={'s' + s.id} d={s.d} className="cm-s" fill={stateFill ? stateFill(s.id) : NODATA} opacity={focusState || areaSet.size ? 0.35 : 1}
                onMouseMove={e => at(e, 's', s.id)} onClick={e => { e.stopPropagation(); onState && onState(s.id); }} />
            ))}
            {showCounties.map(c => (
              <path key={c.id} d={c.d} className={`cm-c${home(c) ? '' : ' nb'}${selected === c.id ? ' sel' : ''}`} fill={countyFill ? countyFill(c.id) : NODATA}
                onMouseMove={e => at(e, 'c', c.id)} onClick={e => { e.stopPropagation(); onCounty && onCounty(c.id, e.shiftKey); }} />
            ))}
            <path d={geo.stateMesh} className="cm-st" />
            <path d={geo.nation} className="cm-nat" />
            {areaSet.size > 0 && showCounties.filter(c => areaSet.has(c.id)).map(c => <path key={'a' + c.id} d={c.d} className="cm-area" />)}
            {sel && <path d={sel.d} className="cm-hl" />}
            {overlay}
          </g>
          {selectMode && <rect width={W} height={H} fill="transparent" style={{ cursor: 'crosshair', touchAction: 'none' }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setBox(null)} />}
          {box && <rect className="cm-box" x={Math.min(box[0][0], box[1][0])} y={Math.min(box[0][1], box[1][1])} width={Math.abs(box[1][0] - box[0][0])} height={Math.abs(box[1][1] - box[0][1])} />}
        </svg>
        {selectMode && !box && <div className="cm-selhint">Drag a box over the counties you want. Every county whose center falls inside is selected, in any state.</div>}
        {tipBody && <div className="cm-tip" style={{ left: Math.min(hover.x + 14, hover.w - 250), top: hover.y + 10 }}>{tipBody}</div>}
      </div>
      {legend}
    </div>
  );
});
export default UsMap;

export function SeqLegend({ label, breaks, fmt }) {
  return (
    <div className="cm-legend">
      {label && <span style={{ fontWeight: 600 }}>{label}:</span>}
      {breaks.length > 0 && [null, ...breaks].map((b, i) => <span key={i}><i style={{ background: RAMP[rampIndex(i, breaks)] }} />{i === 0 ? `under ${fmt(breaks[0] ?? 0)}` : `${fmt(b)}+`}</span>)}
      <span><i style={{ background: NODATA }} />no data</span>
    </div>
  );
}
export function DivLegend({ label, breaks, fmt }) {
  const [a, b, c] = breaks;
  const items = [[DIV_NEG[0], `${fmt(-c)} or less`], [DIV_NEG[1], `${fmt(-c)} to ${fmt(-b)}`], [DIV_NEG[2], `${fmt(-b)} to ${fmt(-a)}`], [DIV_NEG[3], `${fmt(-a)} to 0`],
    [DIV_POS[0], `0 to ${fmt(a)}`], [DIV_POS[1], `${fmt(a)} to ${fmt(b)}`], [DIV_POS[2], `${fmt(b)} to ${fmt(c)}`], [DIV_POS[3], `${fmt(c)} or more`]];
  return (
    <div className="cm-legend">
      {label && <span style={{ fontWeight: 600 }}>{label}:</span>}
      {breaks.length === 3 && items.map(([col, t]) => <span key={t}><i style={{ background: col }} />{t}</span>)}
      <span><i style={{ background: NODATA }} />no data</span>
    </div>
  );
}
