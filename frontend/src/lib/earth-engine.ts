import type { EarthEngineImagery } from "./types";

export type ImagerySnapshot = {
  key: string;
  loading: boolean;
  data: EarthEngineImagery | null;
  error: string | null;
};

// The response for an old incident/window must never replace the current layer.
export class EarthEngineController {
  private sequence = 0;
  private listeners = new Set<() => void>();
  private snapshot: ImagerySnapshot = { key: "", loading: false, data: null, error: null };

  constructor(private request: (id: string | undefined, days: number, refresh?: boolean) => Promise<EarthEngineImagery>) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  cancel = () => { this.sequence++; };

  private publish(snapshot: ImagerySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  async load(id: string | undefined, days: number, refresh = false) {
    const sequence = ++this.sequence;
    const key = `${id ?? ""}:${days}`;
    this.publish({ key, loading: true, data: null, error: null });
    try {
      const data = await this.request(id, days, refresh);
      if (sequence === this.sequence) this.publish({ key, loading: false, data, error: null });
    } catch (error) {
      if (sequence === this.sequence) this.publish({ key, loading: false, data: null, error: error instanceof Error ? error.message : "Satellite imagery is unavailable." });
    }
  }
}
