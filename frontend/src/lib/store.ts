"use client";

import { create } from "zustand";
import { api, ApiError } from "./api";
import type {
  ActionRecord,
  ActionType,
  AIResult,
  FieldBrief,
  IncidentBriefing,
  IncidentOverride,
  IncidentsResponse,
  PolicyKey,
  Prediction,
  SimulateResponse,
} from "./types";

export type View = "earth" | "sim";

export interface Toast {
  id: number;
  tone: "success" | "info" | "error";
  title: string;
  body?: string;
}

interface State {
  data: IncidentsResponse | null;
  loadError: string | null;
  loading: boolean;
  predictions: Record<string, Prediction>;
  predictionErrors: Record<string, string>;
  selectedId: string | null;
  view: View;

  teams: number;
  responseDelay: number;
  steps: number;
  seed: number;
  nSeeds: number;
  overrides: Record<string, IncidentOverride>;
  pickingIgnition: boolean;

  sim: SimulateResponse | null;
  simLoading: boolean;
  simError: string | null;
  simStale: boolean;
  policy: PolicyKey;
  step: number;
  playing: boolean;
  speed: number;

  actions: ActionRecord[];
  actionsLoading: boolean;
  actionsError: string | null;
  toasts: Toast[];
  briefings: Record<string, AIResult<IncidentBriefing>>;
  briefingLoading: Record<string, boolean>;
  fieldBrief: { open: boolean; loading: boolean; result: AIResult<FieldBrief> | null; error: string | null };
  methodologyOpen: boolean;
  controlsOpen: boolean;
  cameraCommand: { kind: "zoomIn" | "zoomOut" | "rotateL" | "rotateR" | "reset"; n: number } | null;

  load: (scenario?: string) => Promise<void>;
  loadActions: () => Promise<void>;
  select: (id: string | null) => void;
  setView: (v: View) => void;
  setTeams: (n: number) => void;
  setParam: (k: "responseDelay" | "steps", v: number) => void;
  setOverride: (id: string, o: IncidentOverride) => void;
  resetOverride: (id: string) => void;
  setPickingIgnition: (v: boolean) => void;
  runSimulation: () => Promise<void>;
  setPolicy: (p: PolicyKey) => void;
  setStep: (s: number) => void;
  setPlaying: (v: boolean) => void;
  setSpeed: (v: number) => void;
  takeAction: (id: string, action: ActionType, reason?: string) => Promise<ActionRecord | null>;
  explain: (id: string) => Promise<void>;
  openFieldBrief: (id: string, actionId?: number) => Promise<void>;
  closeFieldBrief: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setMethodology: (v: boolean) => void;
  setControlsOpen: (v: boolean) => void;
  camera: (kind: "zoomIn" | "zoomOut" | "rotateL" | "rotateR" | "reset") => void;
}

let toastId = 0;
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");

export const useStore = create<State>((set, get) => ({
  data: null,
  loadError: null,
  loading: false,
  predictions: {},
  predictionErrors: {},
  selectedId: null,
  view: "earth",
  teams: 1,
  responseDelay: 4,
  steps: 48,
  seed: 7,
  nSeeds: 30,
  overrides: {},
  pickingIgnition: false,
  sim: null,
  simLoading: false,
  simError: null,
  simStale: false,
  policy: "ai_priority",
  step: 0,
  playing: false,
  speed: 1,
  actions: [],
  actionsLoading: false,
  actionsError: null,
  toasts: [],
  briefings: {},
  briefingLoading: {},
  fieldBrief: { open: false, loading: false, result: null, error: null },
  methodologyOpen: false,
  controlsOpen: true,
  cameraCommand: null,

  load: async (scenario) => {
    set({ loading: true, loadError: null });
    const actionsRequest = get().loadActions();
    try {
      const data = await api.incidents(scenario);
      set({
        data,
        loading: false,
        predictions: {},
        predictionErrors: {},
        sim: null,
        overrides: {},
        briefings: {},
        step: 0,
        playing: false,
        selectedId: get().selectedId && data.incidents.some((i) => i.id === get().selectedId) ? get().selectedId : null,
      });
      const teams = get().teams;
      await Promise.all(
        data.incidents.map(async (inc) => {
          try {
            const p = await api.predict(inc.id, teams);
            set((s) => ({ predictions: { ...s.predictions, [inc.id]: p } }));
          } catch (e) {
            set((s) => ({ predictionErrors: { ...s.predictionErrors, [inc.id]: errMsg(e) } }));
          }
        }),
      );
    } catch (e) {
      set({ loading: false, loadError: errMsg(e) });
    } finally {
      await actionsRequest;
    }
  },

  loadActions: async () => {
    set({ actionsLoading: true, actionsError: null });
    try {
      const result = await api.actions();
      set({ actions: result.actions, actionsLoading: false });
    } catch (error) {
      set({ actionsLoading: false, actionsError: errMsg(error) });
    }
  },

  select: (id) => set({ selectedId: id, pickingIgnition: false }),
  setView: (v) => set({ view: v, pickingIgnition: false }),

  setTeams: (n) => {
    set({ teams: n, simStale: !!get().sim });
    const data = get().data;
    if (!data) return;
    data.incidents.forEach(async (inc) => {
      try {
        const p = await api.predict(inc.id, n);
        set((s) => ({ predictions: { ...s.predictions, [inc.id]: p } }));
      } catch {
        /* keep previous */
      }
    });
  },
  setParam: (k, v) => set({ [k]: v, simStale: !!get().sim } as Partial<State>),
  setOverride: (id, o) =>
    set((s) => ({ overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...o } }, simStale: !!s.sim })),
  resetOverride: (id) =>
    set((s) => {
      const next = { ...s.overrides };
      delete next[id];
      return { overrides: next, simStale: !!s.sim };
    }),
  setPickingIgnition: (v) => set({ pickingIgnition: v }),

  runSimulation: async () => {
    const s = get();
    if (!s.data) return;
    set({ simLoading: true, simError: null, playing: false, pickingIgnition: false });
    try {
      const sim = await api.simulate({
        scenario_id: s.data.scenario.id,
        teams: s.teams,
        response_delay: s.responseDelay,
        steps: s.steps,
        seed: s.seed,
        n_seeds: s.nSeeds,
        per_incident: s.overrides,
      });
      set({ sim, simLoading: false, simStale: false, step: 0, playing: true });
    } catch (e) {
      set({ simLoading: false, simError: errMsg(e) });
      get().toast({ tone: "error", title: "Simulation failed", body: errMsg(e) });
    }
  },
  setPolicy: (p) => set({ policy: p, step: 0, playing: true }),
  setStep: (step) => set({ step }),
  setPlaying: (playing) => {
    const s = get();
    if (playing && s.sim && s.step >= s.sim.steps) set({ step: 0 });
    set({ playing });
  },
  setSpeed: (speed) => set({ speed }),

  takeAction: async (id, action, reason) => {
    try {
      const r = await api.action(id, action, reason, get().teams);
      set((s) => ({
        actions: [r.action, ...s.actions],
        data: s.data && {
          ...s.data,
          incidents: s.data.incidents.map((i) =>
            i.id === id ? { ...i, status: r.incident_status, status_updated_at: r.action.created_at } : i,
          ),
        },
      }));
      get().toast({
        tone: "success",
        title: r.incident_status,
        body: `${id} · decision saved to the audit log at ${new Date(r.action.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      });
      return r.action;
    } catch (e) {
      get().toast({ tone: "error", title: "Action not saved", body: errMsg(e) });
      return null;
    }
  },

  explain: async (id) => {
    set((s) => ({ briefingLoading: { ...s.briefingLoading, [id]: true } }));
    try {
      const sim = get().sim;
      const r = await api.explain(id, get().teams, sim && !get().simStale ? sim.comparison : undefined);
      set((s) => ({ briefings: { ...s.briefings, [id]: r } }));
    } catch (e) {
      get().toast({ tone: "error", title: "Briefing unavailable", body: errMsg(e) });
    } finally {
      set((s) => ({ briefingLoading: { ...s.briefingLoading, [id]: false } }));
    }
  },

  openFieldBrief: async (id, actionId) => {
    set({ fieldBrief: { open: true, loading: true, result: null, error: null } });
    try {
      const r = await api.fieldBrief(id, get().teams, actionId);
      set({ fieldBrief: { open: true, loading: false, result: r, error: null } });
    } catch (e) {
      set({ fieldBrief: { open: true, loading: false, result: null, error: errMsg(e) } });
    }
  },
  closeFieldBrief: () => set({ fieldBrief: { open: false, loading: false, result: null, error: null } }),

  toast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), 5200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setMethodology: (v) => set({ methodologyOpen: v }),
  setControlsOpen: (v) => set({ controlsOpen: v }),
  camera: (kind) => set((s) => ({ cameraCommand: { kind, n: (s.cameraCommand?.n ?? 0) + 1 } })),
}));
