import de from './de.json';

// The built-in German copy is the fallback for missing or invalid host keys.
// The server supplies the optional /config/lang/de.json override before App
// mounts, so existing components can continue using t(...) without changes.
let hostMessages = null;
const LEGACY_TRACKED_OBJECTS_EMPTY = 'Für diese Kamera sind keine Objektklassen verfügbar.';

export function setLocaleMessages(messages) {
  hostMessages = messages && typeof messages === 'object' && !Array.isArray(messages)
    ? messages
    : null;
}

function lookup(root, path) {
  return path.split('.').reduce(
    (node, key) => node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, key)
      ? node[key]
      : undefined,
    root
  );
}

// Translation keys match the JSON hierarchy exactly. Only the new
// cameras.debug.editor.modal.error/warning paths are supported: missing host
// entries use the bundled German defaults, not superseded host keys.
export function t(path, params = {}) {
  const translated = lookup(hostMessages, path);
  // Existing /config/lang/de.json files are not overwritten on upgrades.
  // Replace only the old bundled default; preserve actual host customizations.
  const outdatedDefault = path === 'cameras.page.tracked_objects_empty'
    && translated === LEGACY_TRACKED_OBJECTS_EMPTY;
  const value = typeof translated === 'string' && !outdatedDefault
    ? translated : lookup(de, path);
  if (typeof value !== 'string') return path;
  return value.replace(/\{([a-z_]+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
  );
}
