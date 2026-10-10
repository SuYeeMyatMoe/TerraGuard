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
export function visibleImagery(snapshot: ImagerySnapshot,id: string | undefined,days: number,options: ImageryOptions): ImagerySnapshot {
  const key=imageryKey(id,days,options);
  if (snapshot.key===key) return snapshot;
  const compatible=snapshot.key.startsWith(`${id??''}:${days}:${options.mode??'context'}:`);
  return {key,loading:true,error:null,data:compatible?snapshot.data:null};
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
  };

  private publish(snapshot: ImagerySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  async load(
    id: string | undefined,
    days: number,
    refresh = false,
    options: ImageryOptions = {},
  ) {
    const sequence = ++this.sequence;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const key = imageryKey(id, days, options);
    const identity = `${id ?? ""}:${days}:${options.mode ?? "context"}`;
    const retained = this.identity === identity ? this.snapshot.data : null;
    this.identity = identity;
    this.publish({ key, loading: true, data: retained, error: null });
    try {
      const data = await this.request(id, days, refresh, {
        ...options,
        signal: abort.signal,
      });
      if (sequence === this.sequence)
        this.publish({ key, loading: false, data, error: null });
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
