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
  const detail = raw || t('cameras.debug.editor.error.unknown_details');
  return /[.!?]$/.test(detail) ? detail : detail + '.';
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// Keep the icon and every part of a message the same color.
function EditorNotice({ variant, children }) {
  const styles = {
    unsaved: 'font-bold text-white',
    success: 'text-green-400',
    warning: 'text-yellow-300',
    error: 'text-red-400',
  };
  const alert = variant === 'error' || variant === 'warning';

  return (
    <div role={alert ? 'alert' : 'status'} className="mb-4">
      <span className={'inline-flex max-w-full items-start gap-2 rounded-md bg-slate-700 px-3 py-2 text-base ' + styles[variant]}>
        <svg aria-hidden="true" className="mt-0.5 h-[22px] w-[22px] shrink-0" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {variant === 'success' ? (
            <><circle cx="12" cy="12" r="10" /><path d="m8 12 3 3 5-6" /></>
          ) : variant === 'error' ? (
            <><circle cx="12" cy="12" r="10" /><path d="m9 9 6 6M15 9l-6 6" /></>
          ) : (
            <><path d="m10.29 3.86-8.12 14a2 2 0 0 0 1.71 3h16.24a2 2 0 0 0 1.71-3l-8.12-14a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>
          )}
        </svg>
        <span className="min-w-0 whitespace-pre-wrap break-words">{children}</span>
      </span>
    </div>
  );
}

export default function LiveZoneEditor({ camera, width, height, displayWidth, trackedObjects = [], onClose, onDirtyChange, streamReady = true, children }) {
  const svgRef = useRef(null);
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
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const [objectLabel, setObjectLabel] = useState(trackedObjects[0] || 'person');
  const [validationAttempted, setValidationAttempted] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await axios.get('cameras/' + encodeURIComponent(camera) + '/polygons');
      const loaded = { zones: response.data.zones, motion_masks: response.data.motion_masks, object_masks: response.data.object_masks };
      setData(loaded);
      setSavedSnapshot(JSON.stringify(loaded));
      setRevision(response.data.revision);
      setSelected(null);
      setStatus('');
    } catch (e) {
      setError(t('cameras.debug.editor.error.load_failed', { details: readableDetail(e) }));
    } finally {
      setBusy(false);
    }
  }, [camera]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    // A draft is not an invalid user action until Save is attempted.
    // Do not clear errors here: pending effects must not hide a freshly
    // reported invalid or duplicate name.
    setValidationAttempted(false);
  }, [data]);

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
    if (typeof svgRef.current.setPointerCapture === 'function' && event.pointerId != null) {
      svgRef.current.setPointerCapture(event.pointerId);
    }
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    const { id, index } = dragRef.current;
    const point = eventPoint(event);
    setData((current) => editShape(current, id, (points) => points.map((p, i) => i === index ? point : p)));
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
  };

  const addZone = () => {
    const name = window.prompt(t('cameras.debug.editor.prompt.zone_name'));
    if (!name) return;
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      setError(t('cameras.debug.editor.error.invalid_zone_name'));
      return;
    }
    if (Object.prototype.hasOwnProperty.call(data.zones, name)) {
      setError(t('cameras.debug.editor.error.duplicate_zone_name'));
      return;
    }
    setData((current) => ({ ...current, zones: { ...current.zones, [name]: [] } }));
    setSelected('zone:' + name);
    setStatus('');
    setError('');
  };

  const addMotionMask = () => {
    const index = data.motion_masks.length;
    setData((current) => ({ ...current, motion_masks: [...current.motion_masks, []] }));
    setSelected('motion:' + index);
    setStatus('');
    setError('');
  };

  const addObjectMask = () => {
    const name = objectLabel.trim();
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      setError(t('cameras.debug.editor.error.invalid_object_name'));
      return;
    }
    const index = (data.object_masks[name] || []).length;
    setData((current) => ({
      ...current,
      object_masks: { ...current.object_masks, [name]: [...(current.object_masks[name] || []), []] },
    }));
    setSelected('object:' + name + ':' + index);
    setStatus('');
    setError('');
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
    setStatus('');
  };

  const removePoint = (index) => {
    if (!selected) return;
    setData((current) => editShape(current, selected, (points) => points.filter((_, i) => i !== index)));
    setStatus('');
  };

  const save = async () => {
    if (invalidShape) {
      setValidationAttempted(true);
      return;
    }
    setValidationAttempted(false);
    setBusy(true);
    setError('');
    try {
      const response = await axios.put('cameras/' + encodeURIComponent(camera) + '/polygons', { revision, ...data });
      setRevision(response.data.revision);
      setSavedSnapshot(JSON.stringify(data));
      setSelected(null);
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
      setError(t('cameras.debug.editor.error.save_failed', { details: readableDetail(e) }));
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (!isDirty || window.confirm(t('cameras.debug.editor.prompt.discard_unsaved'))) onClose();
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
    ? 'cameras.debug.editor.warning.invalid_zone'
    : invalidShape?.id.startsWith('motion:')
      ? 'cameras.debug.editor.warning.invalid_covered_area'
      : 'cameras.debug.editor.warning.invalid_object_filter';

  const toolButtonClass = 'inline-flex w-auto items-center justify-center rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const secondaryButtonClass = toolButtonClass + ' border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-700';

  return (
    <div className="mt-2 w-full">
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <aside
          aria-label={t('cameras.debug.editor.label.sidebar')}
          className="order-first w-full shrink-0 rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800 xl:order-last xl:w-[330px]"
        >
          <h2 className="mb-3 text-sm font-semibold xl:hidden">{t('cameras.debug.editor.header.mobile_menu')}</h2>
          <div id="live-polygon-tools" className="space-y-3">
            <section aria-label={t('cameras.debug.editor.header.new_area')} className="space-y-2">
              <h3 className="text-sm font-semibold">{t('cameras.debug.editor.header.new_area')}</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} onClick={addZone} disabled={busy}>{t('cameras.debug.editor.button.zone')}</button>
                <button type="button" className={secondaryButtonClass} onClick={addMotionMask} disabled={busy}>{t('cameras.debug.editor.button.mask')}</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="w-[145px] max-w-full shrink-0 rounded border-slate-300 bg-white py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  aria-label={t('cameras.debug.editor.label.object_class')}
                  value={objectLabel}
                  onChange={(e) => setObjectLabel(e.target.value)}
                >
                  {[...new Set([objectLabel, ...trackedObjects, ...Object.keys(data.object_masks)])].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <button type="button" className={secondaryButtonClass} onClick={addObjectMask} disabled={busy}>{t('cameras.debug.editor.button.object_filter')}</button>
              </div>
            </section>

            <section aria-label={t('cameras.debug.editor.header.existing_areas', { count: shapes.length })} className="space-y-2 border-t border-slate-300 pt-3 dark:border-slate-600">
              <h3 className="text-sm font-semibold">{t('cameras.debug.editor.header.existing_areas', { count: shapes.length })}</h3>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {areaGroups.map((group) => {
                  const groupShapes = shapes.filter((shape) => shape.id.startsWith(group.key));
                  return (
                    <div key={group.key} className="space-y-1.5">
                      <h4 className="flex items-center gap-2 text-sm font-semibold">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                        {t(group.titleKey, { count: groupShapes.length })}
                      </h4>
                      {groupShapes.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {groupShapes.map((shape) => (
                            <button
                              key={shape.id}
                              type="button"
                              aria-pressed={selected === shape.id}
                              aria-label={shape.label}
                              title={shape.label}
                              onClick={() => setSelected((current) => current === shape.id ? null : shape.id)}
                              className={selected === shape.id
                                ? 'inline-flex w-auto max-w-full items-center rounded border border-blue-500 bg-blue-600 px-2 py-1 text-sm font-semibold text-white ring-1 ring-blue-400'
                                : 'inline-flex w-auto max-w-full items-center rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700'}
                            >
                              <span className="break-all">{shape.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('cameras.debug.editor.label.empty')}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-label={t('cameras.debug.editor.header.selected_area')} className="space-y-2 border-t border-slate-300 pt-3 dark:border-slate-600">
              <h3 className="text-sm font-semibold">{t('cameras.debug.editor.header.selected_area')}</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} onClick={() => setSelected(null)} disabled={!selected || busy}>{t('cameras.debug.editor.button.end_editing')}</button>
                <button type="button" className={toolButtonClass + ' border-red-600 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950'} onClick={removeSelected} disabled={!selected || busy}>{t('cameras.debug.editor.button.delete_area')}</button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-300 pt-3 dark:border-slate-600">
                <button type="button" className={secondaryButtonClass} onClick={load} disabled={busy}>{t('cameras.debug.editor.button.discard')}</button>
                <button type="button" className={toolButtonClass + ' border-green-700 bg-green-700 text-white hover:bg-green-600'} onClick={save} disabled={busy || !revision || !isDirty}>{t('cameras.debug.editor.button.save')}</button>
                <button type="button" className={secondaryButtonClass} onClick={handleClose}>{t('cameras.debug.editor.button.close')}</button>
              </div>
            </section>
          </div>
        </aside>

        <div className="order-last w-full min-w-0 flex-1 xl:order-first">
          {/* Reserve enough room for one ordinary status message from the start.
              Additional errors and warnings can grow the container naturally. */}
          <div data-testid="live-editor-notices" className="mb-4 min-h-[56px]">
            {validationAttempted && invalidShape && (
              <EditorNotice variant="warning">{t(invalidWarningKey, { name: invalidShape.label })}</EditorNotice>
            )}
            {error && <EditorNotice variant="error">{error}</EditorNotice>}
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
          <div className="relative" style={{ width: (displayWidth || width) + 'px', maxWidth: '100%', aspectRatio: width + ' / ' + height }}>
        {children}
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
          </div>
        </div>
      </div>
    </div>
  );
}
