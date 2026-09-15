/** In-memory `Storage` for tests, with an optional character quota. */
export const createMemoryStorage = (options: { quotaChars?: number } = {}): Storage => {
  const data = new Map<string, string>();
  const size = () => [...data.entries()].reduce((total, [k, v]) => total + k.length + v.length, 0);

  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      const next = size() - (data.get(key)?.length ?? 0) - (data.has(key) ? key.length : 0) + key.length + value.length;
      if (options.quotaChars !== undefined && next > options.quotaChars) {
        throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
      }
      data.set(key, value);
    },
  };
};
