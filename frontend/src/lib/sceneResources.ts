/** Acquire only in a committed effect. Deferred release tolerates StrictMode replay. */
export function createSceneResourceCache<K, V>(create: (key: K) => V, dispose: (value: V) => void) {
  const entries = new Map<K, { value: V; users: number; timer?: ReturnType<typeof setTimeout> }>();
  return {
    acquire(key: K) {
      let entry = entries.get(key);
      if (!entry) { entry = { value: create(key), users: 0 }; entries.set(key, entry); }
      if (entry.timer != null) { clearTimeout(entry.timer); entry.timer = undefined; }
      entry.users++;
      const held = entry;
      let released = false;
      return {
        value: held.value,
        release() {
          if (released) return;
          released = true;
          if (--held.users === 0) held.timer = setTimeout(() => {
            if (held.users === 0 && entries.get(key) === held) {
              entries.delete(key);
              dispose(held.value);
            }
          }, 0);
        },
      };
    },
  };
}
