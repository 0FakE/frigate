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

export default function LiveZoneEditor({ camera, width, height, displayWidth, trackedObjects = [], onClose, children }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const [data, setData] = useState(empty);
  const [revision, setRevision] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const [objectLabel, setObjectLabel] = useState(trackedObjects[0] || 'person');

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const response = await axios.get('cameras/' + encodeURIComponent(camera) + '/polygons');
      setData({ zones: response.data.zones, motion_masks: response.data.motion_masks, object_masks: response.data.object_masks });
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
  const selectedShape = shapes.find((item) => item.id === selected);
  const eventPoint = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    return [
      Math.max(0, Math.min(width, Math.round((event.clientX - rect.left) / rect.width * width))),
      Math.max(0, Math.min(height, Math.round((event.clientY - rect.top) / rect.height * height))),
    ];
  };

  const addPoint = (event) => {
    if (!selected || dragRef.current || busy) return;
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
    event.stopPropagation();
    setSelected(id);
    dragRef.current = { id, index };
    svgRef.current.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event) => {
    if (!dragRef.current) return;
    const { id, index } = dragRef.current;
    const point = eventPoint(event);
    setData((current) => editShape(current, id, (points) => points.map((p, i) => i === index ? point : p)));
    setStatus('Nicht gespeicherte Änderungen');
  };
  const endDrag = () => { dragRef.current = null; };

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
      setStatus('In config.yml gespeichert. Neustart zum Aktivieren erforderlich.');
    } catch (e) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2 mb-2 text-sm">
        <button type="button" className="rounded bg-green-700 text-white px-3 py-2" onClick={addZone} disabled={busy}>+ Zone</button>
        <button type="button" className="rounded bg-red-700 text-white px-3 py-2" onClick={addMotionMask} disabled={busy}>+ Motion-Maske</button>
        <select className="rounded dark:bg-gray-800" aria-label="Objektklasse" value={objectLabel} onChange={(e) => setObjectLabel(e.target.value)}>
          {[...new Set([objectLabel, ...trackedObjects, ...Object.keys(data.object_masks)])].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button type="button" className="rounded bg-blue-700 text-white px-3 py-2" onClick={addObjectMask} disabled={busy}>+ Objektmaske</button>
        <button type="button" className="rounded bg-slate-700 text-white px-3 py-2" onClick={removeSelected} disabled={!selected || busy}>Polygon löschen</button>
        <button type="button" className="rounded bg-slate-700 text-white px-3 py-2" onClick={load} disabled={busy}>Verwerfen</button>
        <button type="button" className="rounded bg-green-800 text-white px-3 py-2" onClick={save} disabled={busy || !revision}>Speichern</button>
        <button type="button" className="rounded px-3 py-2 border" onClick={onClose}>Editor schließen</button>
      </div>
      <p className="text-xs mb-2">Polygon auswählen, Punkte durch Klick ins Bild ergänzen, Punkte ziehen, Rechtsklick entfernt den Punkt. Bearbeitung erfolgt auf dem JSMpeg-Livestream.</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {shapes.map((shape) => (
          <button key={shape.id} type="button" onClick={() => setSelected(shape.id)}
            className={selected === shape.id ? 'px-2 py-1 rounded border ring-2 ring-blue-500' : 'px-2 py-1 rounded border'}
            style={{ borderColor: shape.color }}>{shape.label}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-red-500 whitespace-pre-wrap">{error}</p>}
      {status && <p role="status" className="text-green-500">{status}</p>}
      <div className="relative" style={{ width: (displayWidth || width) + 'px', maxWidth: '100%', aspectRatio: width + ' / ' + height }}>
        {children}
        <svg ref={svgRef} viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full z-20 touch-none cursor-crosshair"
          onClick={addPoint} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {shapes.map((shape) => (
            <g key={shape.id}>
              {shape.points.length >= 3 && <polygon points={shape.points.map((p) => p.join(',')).join(' ')} fill={shape.color} fillOpacity="0.2" stroke={shape.color} strokeWidth="3" vectorEffect="non-scaling-stroke" onClick={(e) => { e.stopPropagation(); setSelected(shape.id); }} />}
              {shape.points.length === 2 && <polyline points={shape.points.map((p) => p.join(',')).join(' ')} stroke={shape.color} strokeWidth="3" fill="none" vectorEffect="non-scaling-stroke" />}
              {selected === shape.id && shape.points.map(([x, y], i) => (
                <circle key={i} cx={x} cy={y} r={Math.max(4, width / 150)} fill="white" stroke={shape.color} strokeWidth="3"
                  onPointerDown={(e) => startDrag(e, shape.id, i)}
                  onClick={(e) => e.stopPropagation()}
                  onContextMenu={(e) => { e.preventDefault(); removePoint(i); }} />
              ))}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
