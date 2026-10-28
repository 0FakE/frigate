import { baseUrl } from '../api/baseUrl';

export const RESTART_CHECK_INTERVAL_MS = 3000;
export const RESTART_MONITOR_TIMEOUT_MS = 180000;
export const RESTART_REQUEST_TIMEOUT_MS = 8000;

// Derive the old/new process start from the existing Frigate 0.13.2 stats
// endpoint. The response is never allowed to be served from browser cache.
export async function getFrigateStarted(signal) {
  const response = await fetch(`${baseUrl}api/stats`, {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' },
    signal,
  });
  if (!response.ok) throw new Error('Frigate status unavailable');
  const data = await response.json();
  const { last_updated: lastUpdated, uptime } = data?.service || {};
  if (!Number.isFinite(lastUpdated) || !Number.isFinite(uptime) || uptime < 0) {
    throw new Error('Frigate status missing process uptime');
  }
  return lastUpdated - uptime;
}

// Frigate's stats timestamps have second resolution and may differ by one
// second at the read boundary; don't mistake that jitter for a new process.
export function isNewFrigateProcess(previous, current) {
  return Number.isFinite(previous) && Number.isFinite(current) &&
    current > previous + 1;
}

export function reloadFrigatePage() {
  window.location.reload();
}
