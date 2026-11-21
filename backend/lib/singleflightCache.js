function createSingleflightCache(
  load,
  { ttlMs = 30_000, maxEntries = 1_000, shouldCache = () => true } = {}
) {
  const entries = new Map();
  const inFlight = new Map();

  return async function get(key) {
    const cached = entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      entries.delete(key);
      entries.set(key, cached);
      return cached.value;
    }
    if (cached) entries.delete(key);
    if (inFlight.has(key)) return inFlight.get(key);

    const request = Promise.resolve()
      .then(() => load(key))
      .then((value) => {
        if (shouldCache(value, key)) {
          entries.set(key, { value, expiresAt: Date.now() + ttlMs });
          while (entries.size > maxEntries) {
            entries.delete(entries.keys().next().value);
          }
        }
        return value;
      })
      .finally(() => inFlight.delete(key));

    inFlight.set(key, request);
    return request;
  };
}

module.exports = { createSingleflightCache };
