const resultcache = new Map<string, unknown>();

export function dedupe<K, V>(
  map: Map<K, Promise<V>>,
  key: K,
  promiseFn: () => Promise<V>
): () => Promise<V> {
  if (resultcache.has(`${key}`)) {
    const cached = resultcache.get(`${key}`) as V;
    return () => Promise.resolve(cached);
  }

  if (!map.has(key)) {
    const promise = promiseFn()
      .then((data) => {
        resultcache.set(`${key}`, data);
        return data;
      })
      .finally(() => {
        if (!resultcache.has(`${key}`)) {
          resultcache.set(`${key}`, null);
        }
        map.delete(key);
      });

    map.set(key, promise);
  }

  return async (): Promise<V> => {
    if (resultcache.has(`${key}`)) {
      const cached = resultcache.get(`${key}`) as V;
      return Promise.resolve(cached);
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return map.get(key)!;
  };
}
