// Shared lightweight utilities for the extension UI and modules.

export function formatDuration(ms) {
  if (isNaN(ms) || ms < 0) return '0m';
  const MAX = 24 * 60 * 60 * 1000;
  if (ms > MAX) ms = MAX;
  const s = Math.floor(ms / 1000);
  if (s === 0) return '0m';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

export default { formatDuration, clamp };
