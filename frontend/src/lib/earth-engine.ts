import type { EarthEngineImagery } from "./types";
import type { Bounds } from "./map-geometry";
export type ImageryOptions = {
  bounds?: Bounds;
  mode?: "context" | "compare";
  signal?: AbortSignal;
  background?: boolean;
};
export const imageryKey = (
  id: string | undefined,
  days: number,
  options: ImageryOptions = {},
) =>
  `${id ?? ""}:${days}:${options.background ? `period-${options.mode ?? "context"}` : `${options.mode ?? "context"}:${options.bounds?.join(",") ?? ""}`}`;

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
    const identity = `${id ?? ""}:${days}`;
    const retained = options.background || this.identity === identity ? this.snapshot.data : null;
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
      const deadline = Date.now() + 180000;
      let first = true;
      while (!abort.signal.aborted && sequence === this.sequence) {
        const data = await this.request(id, days, first && refresh, {
          ...options,
          signal: abort.signal,
        });
        first = false;
        if (sequence !== this.sequence) return;
        const preparing = data.status === "preparing" || data.comparison?.status === "preparing";
        const pendingStats = data.analysis_status === "preparing" || data.comparison?.analysis_status === "preparing";
        const waitingPair = data.comparison?.status === "preparing" && retained?.comparison?.status === "ready";
        const visible = data.status === "preparing" || waitingPair ? retained ?? data : data;
        this.publish({ key, loading: preparing, data: visible, error: null });
        if (!options.background || (!preparing && !pendingStats)) {
          if (data.status === "ready") {
            this.cache.set(key, { expires: Date.now() + 480000, data });
            while (this.cache.size > 8)
              this.cache.delete(this.cache.keys().next().value!);
          }
          return;
        }
        if (Date.now() >= deadline) throw new Error("Imagery preparation is taking longer than expected. Retry imagery.");
        // Stop polling immediately on unmount/settings changes; old replies cannot win.
        await new Promise<void>((resolve) => {
          const finish = () => { clearTimeout(timer); abort.signal.removeEventListener("abort", finish); resolve(); };
          const timer = setTimeout(finish, 750);
          abort.signal.addEventListener("abort", finish, { once: true });
          if (abort.signal.aborted) finish();
        });
      }
    } catch (error) {
      if (sequence === this.sequence)
        this.publish({
          key,
          loading: false,
          data: this.snapshot.key === key ? this.snapshot.data : retained,
          error:
            error instanceof Error
              ? error.message
              : "Satellite imagery is unavailable.",
        });
    }
  }
}
