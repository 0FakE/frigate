import { h } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import axios from 'axios';

const empty = () => ({ zones: {}, motion_masks: [], object_masks: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));

function shapesFrom(data) {
  const shapes = [];
  Object.entries(data.zones).forEach(([name, points]) => {
    shapes.push({ id: 'zone:' + name, label: 'Zone: ' + name, points, color: '#22c55e' });
  });
  data.motion_masks.forEach((points, i) => {
    shapes.push({ id: 'motion:' + i, label: 'Motion-Maske ' + (i + 1), points, color: '#ef4444' });
  });
  Object.entries(data.object_masks).forEach(([name, masks]) => masks.forEach((points, i) => {
    shapes.push({ id: 'object:' + name + ':' + i, label: 'Objektmaske: ' + name + ' ' + (i + 1), points, color: '#3b82f6' });
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

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export default function LiveZoneEditor({ camera, width, height, displayWidth, trackedObjects = [], onClose, onDirtyChange, children }) {
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      setError(e.response?.data?.message || e.message);
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
    setStatus('Nicht gespeicherte Änderungen');
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
    setStatus('Nicht gespeicherte Änderungen');
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
    const name = window.prompt('Zonenname (Buchstaben, Zahlen, Unterstriche):');
    if (!name) return;
    if (!/^[A-Za-z0-9_]+$/.test(name) || data.zones[name]) {
      setError('Ungültiger oder bereits vergebener Zonenname');
      return;
    }
    setData((current) => ({ ...current, zones: { ...current.zones, [name]: [] } }));
    setSelected('zone:' + name);
    setStatus('Zum Zeichnen ins Videobild klicken');
    setError('');
  };

  const addMotionMask = () => {
    const index = data.motion_masks.length;
    setData((current) => ({ ...current, motion_masks: [...current.motion_masks, []] }));
    setSelected('motion:' + index);
    setStatus('Zum Zeichnen ins Videobild klicken');
  };

  const addObjectMask = () => {
    const name = objectLabel.trim();
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      setError('Ungültiger Objektname');
      return;
    }
    const index = (data.object_masks[name] || []).length;
    setData((current) => ({
      ...current,
      object_masks: { ...current.object_masks, [name]: [...(current.object_masks[name] || []), []] },
    }));
    setSelected('object:' + name + ':' + index);
    setStatus('Zum Zeichnen ins Videobild klicken');
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
    setStatus('Nicht gespeicherte Änderungen');
  };

  const removePoint = (index) => {
    if (!selected) return;
    setData((current) => editShape(current, selected, (points) => points.filter((_, i) => i !== index)));
    setStatus('Nicht gespeicherte Änderungen');
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await axios.put('cameras/' + encodeURIComponent(camera) + '/polygons', { revision, ...data });
      setRevision(response.data.revision);
      setSavedSnapshot(JSON.stringify(data));
      setStatus('In config.yml gespeichert. Neustart zum Aktivieren erforderlich.');
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (!isDirty || window.confirm('Ungespeicherte Änderungen verwerfen?')) onClose();
  };

  // Radius is expressed in source video coordinates; keep hit targets in screen pixels.
  const visibleRadius = Math.max(4, width / 150) * (2 / 3);
  const hitRadiusX = Math.max(visibleRadius + 1, 18 * width / Math.max(1, svgPixelSize.width));
  const hitRadiusY = Math.max(visibleRadius + 1, 18 * height / Math.max(1, svgPixelSize.height));

  const areaGroups = [
    { key: 'zone:', title: 'Zonen', color: '#22c55e' },
    { key: 'motion:', title: 'Bewegungsmasken', color: '#ef4444' },
    { key: 'object:', title: 'Objektmasken', color: '#3b82f6' },
  ];

  const toolButtonClass = 'inline-flex w-auto items-center justify-center rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const secondaryButtonClass = toolButtonClass + ' border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-700';

  return (
    <div className="mt-2 w-full">
      <div className="flex flex-col items-start gap-4 xl:flex-row">
        <aside
          aria-label="Werkzeuge und Bereiche"
          className="order-first w-full shrink-0 rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800 xl:order-last xl:w-72"
        >
          <button
            type="button"
            aria-controls="live-polygon-tools"
            aria-expanded={mobileMenuOpen}
            className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold xl:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span>Bearbeitungsmenü {selected ? '· Bereich ausgewählt' : ''}</span>
            <span aria-hidden="true">{mobileMenuOpen ? '▲' : '▼'}</span>
          </button>
          <div
            id="live-polygon-tools"
            className={mobileMenuOpen ? 'mt-3 space-y-3 xl:mt-0' : 'hidden xl:block xl:space-y-3'}
          >
            <section aria-label="Neuen Bereich erstellen" className="space-y-2">
              <h3 className="text-sm font-semibold">Neuen Bereich erstellen</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} onClick={addZone} disabled={busy}>+ Zone</button>
                <button type="button" className={secondaryButtonClass} onClick={addMotionMask} disabled={busy}>+ Motion-Maske</button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="min-w-0 flex-1 rounded border-slate-300 bg-white py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                  aria-label="Objektklasse"
                  value={objectLabel}
                  onChange={(e) => setObjectLabel(e.target.value)}
                >
                  {[...new Set([objectLabel, ...trackedObjects, ...Object.keys(data.object_masks)])].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                <button type="button" className={secondaryButtonClass} onClick={addObjectMask} disabled={busy}>+ Objektmaske</button>
              </div>
            </section>

            <section aria-label="Vorhandene Bereiche" className="space-y-2 border-t border-slate-300 pt-3 dark:border-slate-600">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Vorhandene Bereiche</h3>
                <span className="text-xs text-slate-500 dark:text-slate-400">{shapes.length}</span>
              </div>
              <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                {areaGroups.map((group) => {
                  const groupShapes = shapes.filter((shape) => shape.id.startsWith(group.key));
                  return (
                    <div key={group.key} className="space-y-1.5">
                      <h4 className="flex items-center gap-2 text-xs font-semibold">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />
                        {group.title} ({groupShapes.length})
                      </h4>
                      {groupShapes.length ? (
                        <div className="flex flex-wrap gap-1.5">
                          {groupShapes.map((shape) => (
                            <button
                              key={shape.id}
                              type="button"
                              aria-pressed={selected === shape.id}
                              title={shape.label}
                              onClick={() => setSelected((current) => current === shape.id ? null : shape.id)}
                              className={selected === shape.id
                                ? 'inline-flex w-auto max-w-full items-center rounded border border-blue-500 bg-blue-600 px-2 py-1 text-xs font-semibold text-white ring-1 ring-blue-400'
                                : 'inline-flex w-auto max-w-full items-center rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-700'}
                            >
                              <span className="break-all">{selected === shape.id ? '✓ ' : ''}{shape.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400">Keine</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section aria-label="Bearbeitung" className="space-y-2 border-t border-slate-300 pt-3 dark:border-slate-600">
              <h3 className="text-sm font-semibold">Bearbeitung</h3>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={secondaryButtonClass} onClick={() => setSelected(null)} disabled={!selected || busy}>Bearbeitung beenden</button>
                <button type="button" className={toolButtonClass + ' border-red-600 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950'} onClick={removeSelected} disabled={!selected || busy}>Bereich löschen</button>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-300 pt-3 dark:border-slate-600">
                <button type="button" className={secondaryButtonClass} onClick={load} disabled={busy}>Verwerfen</button>
                <button type="button" className={toolButtonClass + ' border-green-700 bg-green-700 text-white hover:bg-green-600'} onClick={save} disabled={busy || !revision || !isDirty || !!invalidShape}>Speichern</button>
                <button type="button" className={secondaryButtonClass} onClick={handleClose}>Editor schließen</button>
              </div>
            </section>
          </div>
        </aside>

        <div className="order-last w-full min-w-0 flex-1 xl:order-first">
          {invalidShape && (
            <p role="alert" className="mb-3 text-sm text-amber-600 dark:text-amber-400">
              {invalidShape.label}: Mindestens 3 nicht auf einer Linie liegende Eckpunkte erforderlich, bevor gespeichert werden kann.
            </p>
          )}
          {error && <p role="alert" className="mb-3 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">{error}</p>}
          {status && status !== 'Nicht gespeicherte Änderungen' && !isDirty && (
            <p role="status" className="mb-3 text-sm text-green-700 dark:text-green-400">{status}</p>
          )}
          {isDirty && (
            <div role="status" className="mb-4">
              <span className="inline-flex items-center gap-2 rounded-md bg-slate-700 px-3 py-2 text-lg font-bold text-white">
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m10.29 3.86-8.12 14a2 2 0 0 0 1.71 3h16.24a2 2 0 0 0 1.71-3l-8.12-14a2 2 0 0 0-3.42 0Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                Nicht gespeicherte Änderungen
              </span>
            </div>
          )}
      <div className="relative" style={{ width: (displayWidth || width) + 'px', maxWidth: '100%', aspectRatio: width + ' / ' + height }}>
        {children}
        <svg ref={svgRef} viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full z-20 touch-none cursor-crosshair"
          onPointerDown={handleCanvasPointerDown}
          onClick={addPoint}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}>
          {shapes.map((shape) => (
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
          {selected && shapes.filter((shape) => shape.id === selected).map((shape) => (
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
                    aria-label={'Eckpunkt ' + (i + 1) + ' von ' + shape.label}
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
