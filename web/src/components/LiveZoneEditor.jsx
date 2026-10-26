import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import axios from 'axios';
import { mutate } from 'swr';
import { t } from '../locales';

const empty = () => ({ zones: {}, motion_masks: [], object_masks: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));

function shapesFrom(data) {
  const shapes = [];
  Object.entries(data.zones).forEach(([name, points]) => {
    shapes.push({ id: 'zone:' + name, label: name, points, color: '#22c55e' });
  });
  data.motion_masks.forEach((points, i) => {
    shapes.push({ id: 'motion:' + i, label: t('cameras.debug.editor.label.mask_name', { number: i + 1 }), points, color: '#ef4444' });
  });
  Object.entries(data.object_masks).forEach(([name, masks]) => masks.forEach((points, i) => {
    shapes.push({ id: 'object:' + name + ':' + i, label: t('cameras.debug.editor.label.object_filter_name', { name, number: i + 1 }), points, color: '#3b82f6' });
  }));
  return shapes;
}

function editShape(data, id, fn) {
  const next = clone(data);
  const [type, key, subkey] = id.split(':');
  if (type === 'zone') next.zones[key] = fn(next.zones[key]);
  if (type === 'motion') next.motion_masks[Number(key)] = fn(next.motion_masks[Number(key)]);
  if (type === 'object') next.object_masks[key][Number(subkey)] = fn(next.object_masks[key][Number(subkey)]);
  return next;
}

function readableDetail(error) {
  const raw = String(error.response?.data?.message || error.message || '').trim();
  const detail = raw || t('cameras.debug.editor.modal.error.unknown_details');
  return /[.!?]$/.test(detail) ? detail : detail + '.';
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Hit-test mouse positions in original camera coordinates. Polygons remain
// pointer-transparent so ordinary edit clicks still reach the SVG.
function insidePolygon(point, vertices) {
  if (vertices.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[j], b = vertices[i];
    if (segmentDistance(point, a, b) < 1e-6) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

// The shoelace centroid is visual center for ordinary convex zones. For
// concave shapes, find a safe interior point instead of labeling empty space.
function polygonLabelPoint(vertices) {
  if (vertices.length < 3) return null;
  let twiceArea = 0, cx = 0, cy = 0;
  vertices.forEach(([x, y], i) => {
    const [nextX, nextY] = vertices[(i + 1) % vertices.length];
    const cross = x * nextY - nextX * y;
    twiceArea += cross;
    cx += (x + nextX) * cross;
    cy += (y + nextY) * cross;
  });
  if (Math.abs(twiceArea) > 1e-8) {
    const centroid = [cx / (3 * twiceArea), cy / (3 * twiceArea)];
    if (insidePolygon(centroid, vertices)) return centroid;
  }
  const xs = vertices.map((p) => p[0]), ys = vertices.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  let best = null, clearance = -1;
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) {
      const point = [
        minX + (col + 0.5) * (maxX - minX) / 16,
        minY + (row + 0.5) * (maxY - minY) / 16,
      ];
      if (!insidePolygon(point, vertices)) continue;
      const distance = Math.min(...vertices.map((vertex, i) =>
        segmentDistance(point, vertex, vertices[(i + 1) % vertices.length])));
      if (distance > clearance) {
        best = point;
        clearance = distance;
      }
    }
  }
  return best || vertices[0];
}

// Keep the icon and every part of a message the same color.
function EditorNotice({ variant, children }) {
  const styles = {
    unsaved: 'font-bold text-white',
    success: 'text-green-400',
  };

  return (
    <div role="status">
      <span className={'inline-flex max-w-full items-start gap-2 rounded-md bg-slate-700 px-3 py-2 text-base ' + styles[variant]}>
        <svg aria-hidden="true" className="mt-0.5 h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {variant === 'success' ? (
            <><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></>
          ) : (
            <><path d="m10.29 3.86-8.12 14a2 2 0 0 0 1.71 3h16.24a2 2 0 0 0 1.71-3l-8.12-14a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>
          )}
        </svg>
        <span className="min-w-0 whitespace-pre-wrap break-words">{children}</span>
      </span>
    </div>
  );
}

export default function LiveZoneEditor({ camera, width, height, displayWidth, trackedObjects = [], onDirtyChange, streamReady = true, toolbar = null, optionsPanel = null, children }) {
  const svgRef = useRef(null);
  const hoverLabelRef = useRef(null);
  const dragRef = useRef(null);
  const suppressNextClickRef = useRef(false);
  const [svgPixelSize, setSvgPixelSize] = useState({
    width: displayWidth || width,
    height: (displayWidth || width) * height / width,
  });
  const [data, setData] = useState(empty);
  const [revision, setRevision] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hoverLabelWidth, setHoverLabelWidth] = useState(0);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const [objectLabel, setObjectLabel] = useState(trackedObjects[0] || 'person');

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const response = await axios.get('cameras/' + encodeURIComponent(camera) + '/polygons');
      const loaded = { zones: response.data.zones, motion_masks: response.data.motion_masks, object_masks: response.data.object_masks };
      setData(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
      setRevision(response.data.revision);
      setSelected(null);
      setHovered(null);
      setStatus('');
    } catch (e) {
      window.alert(t('cameras.debug.editor.modal.error.load_failed', { details: readableDetail(e) }));
    } finally {
      setBusy(false);
    }
  }, [camera]);

  useEffect(() => { load(); }, [load]);

  const shapes = shapesFrom(data);
  const isDirty = Boolean(revision) && JSON.stringify(data) !== savedSnapshot;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const updateSize = () => {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSvgPixelSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [width, height]);
  const invalidShape = shapes.find(({ points }) =>
    points.length < 3 || Math.abs(points.reduce((total, point, i) => {
      const next = points[(i + 1) % points.length];
      return total + point[0] * next[1] - next[0] * point[1];
    }, 0)) === 0
  );
  const eventPoint = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return [
      Math.max(0, Math.min(width, Math.round((event.clientX - rect.left) / rect.width * width))),
      Math.max(0, Math.min(height, Math.round((event.clientY - rect.top) / rect.height * height))),
    ];
  };

  const addPoint = (event) => {
    // A pointer drag can finish with a synthetic click targeting the SVG.
    // Never turn that click into another vertex.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    if (event.button !== 0 || event.target !== svgRef.current || !selected || dragRef.current || busy) return;
    const point = eventPoint(event);
    setData((current) => editShape(current, selected, (points) => {
      const next = [...points];
      if (next.length < 3) next.push(point);
      else {
        let closest = { index: next.length, distance: Infinity };
        for (let i = 0; i < next.length; i++) {
          const dist = segmentDistance(point, next[i], next[(i + 1) % next.length]);
          if (dist < closest.distance) closest = { index: i + 1, distance: dist };
        }
        next.splice(closest.index, 0, point);
      }
      return next;
    }));
    setStatus('');
  };

  const startDrag = (event, id, index) => {
    // Only a primary-button press is a drag. Right-click stays available to remove points.
    if ((event.button != null && event.button !== 0) || busy) return;
    event.stopPropagation();
    event.preventDefault();
    suppressNextClickRef.current = true;
    dragRef.current = { id, index, pointerId: event.pointerId };
    setHovered(null);
    if (typeof svgRef.current.setPointerCapture === 'function' && event.pointerId != null) {
      svgRef.current.setPointerCapture(event.pointerId);
    }
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    const { id, index } = dragRef.current;
    const point = eventPoint(event);
    setData((current) => editShape(current, id, (points) => points.map((p, i) => i === index ? point : p)));
    setHovered(null);
    setStatus('');
  };
  const endDrag = (event) => {
    if (dragRef.current && dragRef.current.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handleCanvasPointerDown = (event) => {
    // A fresh click on the background must work even if a prior drag was cancelled.
    if (event.target === svgRef.current) suppressNextClickRef.current = false;
    setHovered(null);
  };

  const addZone = () => {
    const name = window.prompt(t('cameras.debug.editor.prompt.zone_name'));
    if (!name) return;
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      window.alert(t('cameras.debug.editor.modal.error.invalid_zone_name'));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(data.zones, name)) {
      window.alert(t('cameras.debug.editor.modal.error.duplicate_zone_name'));
      return;
    }
    setData((current) => ({ ...current, zones: { ...current.zones, [name]: [] } }));
    setSelected('zone:' + name);
    setStatus('');
  };

  const addMotionMask = () => {
    const index = data.motion_masks.length;
    setData((current) => ({ ...current, motion_masks: [...current.motion_masks, []] }));
    setSelected('motion:' + index);
    setStatus('');
  };

  const addObjectMask = () => {
    const name = objectLabel.trim();
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      window.alert(t('cameras.debug.editor.modal.error.invalid_object_name'));
      return;
    }
    const index = (data.object_masks[name] || []).length;
    setData((current) => ({
      ...current,
      object_masks: { ...current.object_masks, [name]: [...(current.object_masks[name] || []), []] },
    }));
    setSelected('object:' + name + ':' + index);
    setStatus('');
  };

  const removeSelected = () => {
    if (!selected) return;
    const [type, key, subkey] = selected.split(':');
    setData((current) => {
      const next = clone(current);
      if (type === 'zone') delete next.zones[key];
      else if (type === 'motion') next.motion_masks.splice(Number(key), 1);
      else if (type === 'object') {
        next.object_masks[key].splice(Number(subkey), 1);
        if (!next.object_masks[key].length) delete next.object_masks[key];
      }
      return next;
    });
    setSelected(null);
    setHovered(null);
    setStatus('');
  };

  const removePoint = (index) => {
    if (!selected) return;
    setData((current) => editShape(current, selected, (points) => points.filter((_, i) => i !== index)));
    setStatus('');
  };

  const save = async () => {
    if (invalidShape) {
      window.alert(t(invalidWarningKey, { name: invalidShape.label }));
      return;
    }
    setBusy(true);
    try {
      const response = await axios.put('cameras/' + encodeURIComponent(camera) + '/polygons', { revision, ...data });
      setRevision(response.data.revision);
      setSavedSnapshot(JSON.stringify(data));
      setSelected(null);
      setHovered(null);
      setStatus('saved');
      // Refresh the raw YAML separately; it is different from the runtime /config endpoint.
      try {
        const raw = await axios.get('config/raw');
        await mutate('config/raw', raw.data, false);
      } catch (refreshError) {
        // An unsuccessful refresh does not mean the polygons failed to save.
        await mutate('config/raw');
      }
    } catch (e) {
      window.alert(t('cameras.debug.editor.modal.error.save_failed', { details: readableDetail(e) }));
    } finally {
      setBusy(false);
    }
  };

  // Radius is expressed in source video coordinates; keep hit targets in screen pixels.
  const visibleRadius = Math.max(4, width / 150) * (2 / 3);
  const hitRadiusX = Math.max(visibleRadius + 1, 18 * width / Math.max(1, svgPixelSize.width));
  const hitRadiusY = Math.max(visibleRadius + 1, 18 * height / Math.max(1, svgPixelSize.height));

  const areaGroups = [
    { key: 'zone:', titleKey: 'cameras.debug.editor.header.zones', color: '#22c55e' },
    { key: 'motion:', titleKey: 'cameras.debug.editor.header.covered_areas', color: '#ef4444' },
    { key: 'object:', titleKey: 'cameras.debug.editor.header.object_filters', color: '#3b82f6' },
  ];
  const invalidWarningKey = invalidShape?.id.startsWith('zone:')
    ? 'cameras.debug.editor.modal.warning.invalid_zone'
    : invalidShape?.id.startsWith('motion:')
      ? 'cameras.debug.editor.modal.warning.invalid_covered_area'
      : 'cameras.debug.editor.modal.warning.invalid_object_filter';

  const toolButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-40';
  const secondaryButtonClass = toolButtonClass + ' border-slate-700 bg-slate-800/90 text-slate-100 hover:border-slate-500 hover:bg-slate-700';
  const selectedShape = shapes.find((shape) => shape.id === selected);
  // Only hovering an existing list entry triggers this label; pointer
  // movement within the camera preview never selects a label.
  const hoveredShape = streamReady && !dragRef.current
    ? shapes.find((shape) => shape.id === hovered) : null;
  const hoveredPosition = hoveredShape ? polygonLabelPoint(hoveredShape.points) : null;
  // A max-content label stays on one line unless it genuinely exceeds the
  // image width. Measure it to keep its center inside the viewport at edges.
  useEffect(() => {
    const label = hoverLabelRef.current;
    if (!label) return;
    const measure = () => {
      const measured = label.getBoundingClientRect().width;
      setHoverLabelWidth((previous) => Math.abs(previous - measured) > 0.5 ? measured : previous);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => observer.disconnect();
  }, [hoveredShape?.id, svgPixelSize.width]);
  const halfLabel = Math.min(hoverLabelWidth, Math.max(0, svgPixelSize.width - 16)) / 2;
  const lowerX = halfLabel + 8;
  const upperX = Math.max(lowerX, svgPixelSize.width - halfLabel - 8);
  const hoverLabelX = hoveredPosition
    ? Math.min(Math.max(hoveredPosition[0] / width * svgPixelSize.width, lowerX), upperX)
    : 0;
  const panelCardClass = 'rounded-lg border border-slate-700/80 bg-slate-800/90 p-3 shadow-xl shadow-black/10';
  const headingClass = 'mb-2 flex items-center gap-2 text-sm font-bold text-white';
  const headingIconClass = 'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-400';

  return (
    <div className="w-full" data-testid="modern-zone-editor">
      <div className="flex flex-col items-start gap-3 xl:flex-row">
        <aside
          aria-label={t('cameras.debug.editor.label.sidebar')}
          className="order-first w-full shrink-0 text-slate-100 xl:order-last xl:w-[360px]"
        >
          <div id="live-polygon-tools" className="space-y-2">
            <section aria-label={t('cameras.debug.editor.header.new_area')} className={panelCardClass}>
              <h3 className={headingClass}>
                <span aria-hidden="true" className={headingIconClass}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                {t('cameras.debug.editor.header.new_area')}
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  className={toolButtonClass + ' h-10 min-w-0 border-green-500 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'}
                  onClick={addZone} disabled={busy}>
                  <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="4 2">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                  {t('cameras.debug.editor.button.zone')}
                </button>
                <button type="button"
                  className={toolButtonClass + ' h-10 min-w-0 border-red-500 bg-slate-800/70 text-slate-200 hover:bg-slate-700'}
                  onClick={addMotionMask} disabled={busy}>
                  <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="m3 3 18 18M10.6 5.4A10.6 10.6 0 0 1 12 5c5 0 9 7 9 7a16.6 16.6 0 0 1-3 3.5M6.2 6.2A17.7 17.7 0 0 0 3 12s4 7 9 7c1.4 0 2.8-.5 4-1.3" />
                  </svg>
                  {t('cameras.debug.editor.button.mask')}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  className="h-10 w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-2 text-sm text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-400"
                  aria-label={t('cameras.debug.editor.label.object_class')}
                  title={t('cameras.debug.editor.label.object_filter_select')}
                  value={objectLabel}
                  onChange={(e) => setObjectLabel(e.target.value)}
                >
                  {[...new Set([objectLabel, ...trackedObjects, ...Object.keys(data.object_masks)])].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <button type="button" className={toolButtonClass + ' h-10 w-full min-w-0 border-blue-500 bg-slate-800/90 text-slate-100 hover:border-blue-400 hover:bg-slate-700'}
                  onClick={addObjectMask} disabled={busy}>
                  <svg aria-hidden="true" className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 5h16l-6 7v6l-4 2v-8Z" />
                  </svg>
                  {t('cameras.debug.editor.button.object_filter')}
                </button>
              </div>
            </section>

            <section aria-label={t('cameras.debug.editor.header.existing_areas')} className={panelCardClass}>
              <h3 className={headingClass}>
                <span aria-hidden="true" className={headingIconClass}>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m4 6 6 4 6-4 4 2v10l-4-2-6 4-6-4Z" />
                    <path d="M10 10v10M16 6v10" />
                  </svg>
                </span>
                {t('cameras.debug.editor.header.existing_areas')}
              </h3>
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {areaGroups.map((group) => {
                  const groupShapes = shapes.filter((shape) => shape.id.startsWith(group.key));
                  return (
                    <div key={group.key} className="space-y-1.5">
                      <h4 className="flex items-center gap-2 rounded-lg bg-slate-950/50 px-2 py-1.5 text-sm font-semibold text-slate-200">
                        <span aria-hidden="true" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                        <span className="min-w-0 flex-1">{t(group.titleKey)}</span>
                        <span className="ml-auto inline-flex min-w-[2rem] shrink-0 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/70 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-400">{groupShapes.length}</span>
                      </h4>
                      {groupShapes.length ? (
                        <div className="space-y-0.5">
                          {groupShapes.map((shape) => (
                            <button key={shape.id} type="button"
                              aria-pressed={selected === shape.id}
                              aria-label={shape.label}
                              title={shape.label}
                              onClick={() => setSelected((current) => current === shape.id ? null : shape.id)}
                              onMouseEnter={() => setHovered(shape.id)}
                              onMouseLeave={() => setHovered((current) => current === shape.id ? null : current)}
                              className={selected === shape.id
                                ? 'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-blue-500/50 bg-blue-600/20 px-2 py-1.5 text-left text-sm font-semibold text-white ring-1 ring-blue-500/30 transition-colors'
                                : 'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-transparent bg-slate-950/35 px-2 py-1.5 text-left text-sm text-slate-200 transition-colors hover:border-slate-600 hover:bg-slate-800'}
                            >
                              <span aria-hidden="true" className={selected === shape.id
                                ? 'h-3.5 w-3.5 shrink-0 rounded-full border-4 border-blue-400 bg-white'
                                : 'h-3.5 w-3.5 shrink-0 rounded-full border border-slate-500'} />
                              <span className="min-w-0 flex-1 break-all">{shape.label}</span>
                              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: shape.color }} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="px-2 text-sm text-slate-400">{t('cameras.debug.editor.label.empty')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-label={t('cameras.debug.editor.header.selected_area')} className={panelCardClass}>
              <h3 className={headingClass}>
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" />
                    <circle cx="12" cy="10" r="2" />
                  </svg>
                </span>
                {t('cameras.debug.editor.header.selected_area')}
              </h3>
              {selectedShape ? (
                <div className="mb-2 rounded-lg border border-slate-700 bg-slate-950/50 px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: selectedShape.color }} />
                    <span className="min-w-0 flex-1 break-all text-sm font-semibold text-white">{selectedShape.label}</span>
                    <span className="shrink-0 text-xs text-slate-400">{t('cameras.debug.editor.label.vertex_count', { count: selectedShape.points.length })}</span>
                  </div>
                </div>
              ) : (
                <p className="mb-3 text-sm leading-5 text-slate-400">{t('cameras.debug.editor.label.no_selection')}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={secondaryButtonClass + ' w-full'} onClick={() => setSelected(null)} disabled={!selected || busy}>
                  {t('cameras.debug.editor.button.end_editing')}
                </button>
                <button type="button"
                  className={toolButtonClass + ' w-full border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20'}
                  onClick={removeSelected} disabled={!selected || busy}>
                  {t('cameras.debug.editor.button.delete_area')}
                </button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-slate-700 pt-2">
                <button type="button" className={secondaryButtonClass + ' w-full'} onClick={load} disabled={busy}>
                  {t('cameras.debug.editor.button.discard_changes')}
                </button>
                <button type="button"
                  className={toolButtonClass + ' w-full border-blue-500 bg-blue-600 text-white shadow-lg shadow-blue-900/20 hover:bg-blue-500'}
                  onClick={save} disabled={busy || !revision || !isDirty}>
                  {t('cameras.debug.editor.button.save_changes')}
                </button>
              </div>
            </section>
          </div>
        </aside>

        <div className="order-last w-full min-w-0 flex-1 xl:order-first">
          {/* Only success and unsaved status appear inline. Errors and validation
              warnings use native browser alerts and do not take up layout space. */}
          {((status === 'saved' && !isDirty) || isDirty || Boolean(selected)) && (
            <div data-testid="live-editor-notices" className="mb-4 flex flex-col gap-4">
              {status === 'saved' && !isDirty && (
                <EditorNotice variant="success">
                  {t('cameras.debug.editor.status.saved')}{' '}
                  <strong>{t('cameras.debug.editor.status.restart_required')}</strong>
                </EditorNotice>
              )}
              {(isDirty || selected) && (
                <EditorNotice variant="unsaved">{t('cameras.debug.editor.status.unsaved')}</EditorNotice>
              )}
            </div>
          )}
          {/* One authoritative viewport controls the JSMpeg canvas, the loading
              background, and the polygon SVG. JSMpeg must not increase the
              height independently and leave a strip outside the overlay. */}
          <div data-testid="live-editor-viewport" className="relative live-polygon-preview overflow-hidden"
            style={{ width: (displayWidth || width) + 'px', maxWidth: '100%', aspectRatio: width + ' / ' + height }}>
            <div data-testid="live-editor-video-slot" className="absolute inset-0">{children}</div>
        {!streamReady && (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-900/80 px-4 text-center text-base font-semibold text-white" role="status">
            {t('cameras.debug.editor.status.loading_stream')}
          </div>
        )}
        <svg ref={svgRef} viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none"
          className={"absolute inset-0 w-full h-full z-20 touch-none cursor-crosshair " + (!streamReady ? "invisible pointer-events-none" : "")}
          onPointerDown={handleCanvasPointerDown}
          onClick={addPoint}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}>
          {streamReady && shapes.map((shape) => (
            <g key={shape.id} style={{ pointerEvents: 'none' }}>
              {shape.points.length >= 3 && (
                <polygon
                  points={shape.points.map((p) => p.join(',')).join(' ')}
                  fill={shape.color} fillOpacity="0.2" stroke={shape.color}
                  strokeWidth="3" vectorEffect="non-scaling-stroke"
                />
              )}
              {shape.points.length === 2 && (
                <polyline
                  points={shape.points.map((p) => p.join(',')).join(' ')}
                  stroke={shape.color} strokeWidth="3" fill="none"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          ))}
          {/* Active vertices are always drawn last, above any overlapping polygons. */}
          {streamReady && selected && shapes.filter((shape) => shape.id === selected).map((shape) => (
            <g key={shape.id}>
              {shape.points.map(([x, y], i) => (
                <g key={i}>
                  <circle cx={x} cy={y} r={visibleRadius} fill="white"
                    stroke={shape.color} strokeWidth="2" style={{ pointerEvents: 'none' }} />
                  <ellipse cx={x} cy={y} rx={hitRadiusX} ry={hitRadiusY}
                    fill="transparent" style={{ pointerEvents: 'all' }}
                    className="cursor-grab"
                    onPointerDown={(e) => startDrag(e, shape.id, i)}
                    onClick={(e) => e.stopPropagation()}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!busy) removePoint(i);
                    }}
                    aria-label={t('cameras.debug.editor.label.vertex', { number: i + 1, name: shape.label })}
                  />
                </g>
              ))}
            </g>
          ))}
        </svg>
        {hoveredShape && hoveredPosition && (
          <div ref={hoverLabelRef} data-testid="live-editor-hover-label" aria-hidden="true"
            className="pointer-events-none absolute z-30 w-max max-w-[calc(100%-16px)] -translate-x-1/2 -translate-y-1/2 break-words rounded-lg border border-slate-600/90 bg-slate-950/95 px-2 py-1 text-center text-xs font-semibold text-white shadow-lg"
            style={{
              left: hoverLabelX + 'px', top: hoveredPosition[1] / height * 100 + '%',
            }}>
            <span className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: hoveredShape.color }} />
            <span>{hoveredShape.label}</span>
          </div>
        )}
          </div>
          {toolbar}
          {optionsPanel}
        </div>
      </div>
    </div>
  );
}
