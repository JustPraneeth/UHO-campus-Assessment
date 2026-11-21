const DEFAULT_TTL_MS = 30_000;

export function getSessionCache(key, ttlMs = DEFAULT_TTL_MS) {
  if (typeof window === "undefined") return null;
  try {
    const serialized = window.sessionStorage.getItem(key);
    if (!serialized) return null;
    const entry = JSON.parse(serialized);
    const age = Date.now() - entry.cachedAt;
    if (!Number.isFinite(entry.cachedAt) || age < 0 || age > ttlMs) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch (error) {
    console.warn(`[session-cache] Could not read cache: ${error.message}`);
    return null;
  }
}

export function setSessionCache(key, data) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), data }));
  } catch (error) {
    console.warn(`[session-cache] Could not write cache: ${error.message}`);
  }
}

export function removeSessionCache(key) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`[session-cache] Could not clear cache: ${error.message}`);
  }
}
