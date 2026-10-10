import type { EarthEngineImagery } from "./types";
import type { Bounds } from "./map-geometry";
export type ImageryOptions = {
  bounds?: Bounds;
  mode?: "context" | "compare";
  signal?: AbortSignal;
};
export const imageryKey = (
  id: string | undefined,
  days: number,
  options: ImageryOptions = {},
) =>
  `${id ?? ""}:${days}:${options.mode ?? "context"}:${options.bounds?.join(",") ?? ""}`;

export type ImagerySnapshot = {
  key: string;
  loading: boolean;
  data: EarthEngineImagery | null;
  error: string | null;
};

// Camera movements retain a useful extent even before the debounced load starts.
export function visibleImagery(
  snapshot: ImagerySnapshot,
  id: string | undefined,
  days: number,
  options: ImageryOptions,
): ImagerySnapshot {
  const key = imageryKey(id, days, options);
  if (snapshot.key === key) return snapshot;
  const compatible = snapshot.key.startsWith(
    `${id ?? ""}:${days}:${options.mode ?? "context"}:`,
  );
  return {
    key,
    loading: true,
    error: null,
    data: compatible ? snapshot.data : null,
  };
}

// The response for an old incident/window must never replace the current layer.
export class EarthEngineController {
  private sequence = 0;
  private listeners = new Set<() => void>();
  private snapshot: ImagerySnapshot = {
    key: "",
    loading: false,
    data: null,
    error: null,
  };
  private identity = "";
  private abort: AbortController | null = null;
  private cache = new Map<
    string,
    { expires: number; data: EarthEngineImagery }
  >();
  private pending: { key: string; promise: Promise<void> } | null = null;

  constructor(
    private request: (
      id: string | undefined,
      days: number,
      refresh?: boolean,
      options?: ImageryOptions,
    ) => Promise<EarthEngineImagery>,
  ) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  cancel = () => {
    this.sequence++;
    this.abort?.abort();
    this.pending = null;
  };
  reset = () => {
    this.cancel();
    this.identity = "";
    this.publish({ key: "", loading: false, data: null, error: null });
  };

  private publish(snapshot: ImagerySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  load(
    id: string | undefined,
    days: number,
    refresh = false,
    options: ImageryOptions = {},
  ) {
    const key = imageryKey(id, days, options);
    if (!refresh && this.pending?.key === key) return this.pending.promise;
    const promise = this.performLoad(id, days, refresh, options);
    this.pending = { key, promise };
    void promise.finally(() => {
      if (this.pending?.promise === promise) this.pending = null;
    });
    return promise;
  }

  private async performLoad(
    id: string | undefined,
    days: number,
    refresh: boolean,
    options: ImageryOptions,
  ) {
    const sequence = ++this.sequence;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const key = imageryKey(id, days, options);
    const identity = `${id ?? ""}:${days}:${options.mode ?? "context"}`;
    const retained = this.identity === identity ? this.snapshot.data : null;
    this.identity = identity;
    const cached = this.cache.get(key);
    if (!refresh && cached && cached.expires > Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      this.publish({ key, loading: false, data: cached.data, error: null });
      return;
    }
    this.publish({ key, loading: true, data: retained, error: null });
    try {
      const data = await this.request(id, days, refresh, {
        ...options,
        signal: abort.signal,
      });
      if (sequence === this.sequence) {
        if (data.status === "ready") {
          this.cache.set(key, { expires: Date.now() + 480000, data });
          while (this.cache.size > 8)
            this.cache.delete(this.cache.keys().next().value!);
        }
        this.publish({ key, loading: false, data, error: null });
      }
    } catch (error) {
      if (sequence === this.sequence)
        this.publish({
          key,
          loading: false,
          data: retained,
          error:
            error instanceof Error
              ? error.message
              : "Satellite imagery is unavailable.",
        });
    }
  }
}
