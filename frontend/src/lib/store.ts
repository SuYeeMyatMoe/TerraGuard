"use client";

import { create } from "zustand";
import { api, ApiError } from "./api";
import { pct, shortId } from "./format";
import type {
  ActionRecord,
  ActionType,
  AIResult,
  FieldBrief,
  IncidentBriefing,
  IncidentOverride,
  IncidentReports,
  IncidentsResponse,
  PolicyKey,
  Prediction,
  SimulateResponse,
} from "./types";

export type View = "earth" | "sim";

/** One named crew is the scarce resource; the model and simulation are always run for a single team. */
export const TEAMS = 1;

export interface Toast {
  id: number;
  tone: "success" | "info" | "error" | "warning";
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
  archivedActions: ActionRecord[];
  actionsLoading: boolean;
  actionsError: string | null;
  toasts: Toast[];
  briefings: Record<string, AIResult<IncidentBriefing>>;
  briefingLoading: Record<string, boolean>;
  fieldBrief: { open: boolean; loading: boolean; result: AIResult<FieldBrief> | null; error: string | null };
  methodologyOpen: boolean;
  recordOpen: boolean;
  controlsOpen: boolean;
  cameraCommand: { kind: "zoomIn" | "zoomOut" | "rotateL" | "rotateR" | "reset"; n: number } | null;

  load: (scenario?: string) => Promise<void>;
  loadActions: (scenario?: string) => Promise<void>;
  select: (id: string | null) => void;
  setView: (v: View) => void;
  setParam: (k: "responseDelay" | "steps", v: number) => void;
  setOverride: (id: string, o: IncidentOverride) => void;
  resetOverride: (id: string) => void;
  setPickingIgnition: (v: boolean) => void;
  runSimulation: (opts?: { autoplay?: boolean }) => Promise<void>;
  report: { open: boolean; loading: boolean; incidentId: string | null; data: IncidentReports | null; error: string | null; tab: "prediction" | "recommendation" };
  openReport: (incidentId?: string | null, tab?: "prediction" | "recommendation") => Promise<void>;
  setReportTab: (tab: "prediction" | "recommendation") => void;
  closeReport: () => void;
  setPolicy: (p: PolicyKey) => void;
  setStep: (s: number) => void;
  setPlaying: (v: boolean) => void;
  setSpeed: (v: number) => void;
  decide: (id: string, action: ActionType, reason: string) => Promise<ActionRecord | null>;
  explain: (id: string) => Promise<void>;
  openFieldBrief: (id: string, action?: ActionRecord) => Promise<void>;
  closeFieldBrief: () => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  setMethodology: (v: boolean) => void;
  setRecordOpen: (v: boolean) => void;
  setControlsOpen: (v: boolean) => void;
  camera: (kind: "zoomIn" | "zoomOut" | "rotateL" | "rotateR" | "reset") => void;
}

let toastId = 0;
let actionsRequestId = 0;
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong.");

export const useStore = create<State>((set, get) => ({
  data: null,
  loadError: null,
  loading: false,
  predictions: {},
  predictionErrors: {},
  selectedId: null,
  view: "earth",
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
  archivedActions: [],
  actionsLoading: false,
  actionsError: null,
  toasts: [],
  briefings: {},
  briefingLoading: {},
  fieldBrief: { open: false, loading: false, result: null, error: null },
  methodologyOpen: false,
  recordOpen: false,
  controlsOpen: true,
  cameraCommand: null,

  load: async (scenario) => {
    set({ loading: true, loadError: null });
    const activeScenario = scenario ?? get().data?.scenario.id;
    const actionsRequest = get().loadActions(activeScenario);
    try {
      const data = await api.incidents(activeScenario);
      const keep = get().selectedId;
      set({
        data,
        actions: get().actions.filter((a) => a.scenario_id === data.scenario.id),
        archivedActions: get().archivedActions.filter((a) => a.scenario_id === data.scenario.id),
        loading: false,
        predictions: {},
        predictionErrors: {},
        sim: null,
        overrides: {},
        briefings: {},
        step: 0,
        playing: false,
        selectedId: keep && data.incidents.some((i) => i.id === keep) ? keep : null,
      });
      await Promise.all(
        data.incidents.map(async (inc) => {
          try {
            const p = await api.predict(inc.id, TEAMS);
            set((s) => ({ predictions: { ...s.predictions, [inc.id]: p } }));
          } catch (e) {
            set((s) => ({ predictionErrors: { ...s.predictionErrors, [inc.id]: errMsg(e) } }));
          }
        }),
      );
      if (get().view === "sim") get().runSimulation({ autoplay: false });
    } catch (e) {
      set({ loading: false, loadError: errMsg(e) });
    } finally {
      await actionsRequest;
    }
  },

  loadActions: async (scenario) => {
    const scen = scenario ?? get().data?.scenario.id;
    const requestId = ++actionsRequestId;
    set({ actionsLoading: true, actionsError: null });
    try {
      const all = await api.actions(scen, true);
      if (requestId !== actionsRequestId) return;
      const currentScenario = scen ?? get().data?.scenario.id;
      const records = all.actions.filter((a) => !currentScenario || a.scenario_id === currentScenario);
      set({
        actions: records.filter((a) => !a.archived_at),
        archivedActions: records.filter((a) => !!a.archived_at),
        actionsLoading: false,
      });
    } catch (error) {
      if (requestId !== actionsRequestId) return;
      set({ actionsLoading: false, actionsError: errMsg(error) });
    }
  },

  select: (id) => set({ selectedId: id, pickingIgnition: false }),
  setView: (v) => {
    set({ view: v, pickingIgnition: false });
    // the 3D test runs on demand: first visit, or after a decision changed the crew's assignment
    const s = get();
    if (v === "sim" && s.data && !s.simLoading && (!s.sim || s.simStale)) s.runSimulation({ autoplay: false });
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

  runSimulation: async (opts) => {
    const s = get();
    if (!s.data) return;
    set({ simLoading: true, simError: null, playing: false, pickingIgnition: false });
    try {
      const sim = await api.simulate({
        scenario_id: s.data.scenario.id,
        teams: TEAMS,
        response_delay: s.responseDelay,
        steps: s.steps,
        seed: s.seed,
        n_seeds: s.nSeeds,
        per_incident: s.overrides,
      });
      const policy: PolicyKey = sim.policies.coordinator ? "coordinator" : get().policy === "coordinator" ? "ai_priority" : get().policy;
      set({ sim, simLoading: false, simStale: false, step: 0, playing: opts?.autoplay ?? true, policy });
      // a user-run response test ends with the Prediction Report for the selected (or top-ranked) incident
      if (opts?.autoplay ?? true) {
        const target = get().selectedId ?? sim.ai_order[0] ?? null;
        if (target) setTimeout(() => get().openReport(target, "prediction"), 1800);
      }
    } catch (e) {
      set({ simLoading: false, simError: errMsg(e) });
      get().toast({ tone: "error", title: "Response test failed", body: errMsg(e) });
    }
  },
  report: { open: false, loading: false, incidentId: null, data: null, error: null, tab: "prediction" },
  openReport: async (incidentId, tab = "prediction") => {
    const s = get();
    const id = incidentId ?? s.selectedId ?? s.sim?.ai_order[0] ?? s.data?.incidents[0]?.id ?? null;
    if (!id) return;
    if (s.report.data?.incident_id === id && !s.simStale) {
      set({ report: { ...s.report, open: true, tab } });
      return;
    }
    set({ report: { open: true, loading: true, incidentId: id, data: null, error: null, tab } });
    try {
      const data = await api.reports(id, { response_delay: s.responseDelay, steps: s.steps, seed: s.seed, n_seeds: s.nSeeds, per_incident: s.overrides });
      if (get().report.incidentId === id) set((st) => ({ report: { ...st.report, loading: false, data } }));
    } catch (e) {
      set((st) => ({ report: { ...st.report, loading: false, error: errMsg(e) } }));
    }
  },
  setReportTab: (tab) => set((st) => ({ report: { ...st.report, tab } })),
  closeReport: () => set((st) => ({ report: { ...st.report, open: false } })),
  setPolicy: (p) => set({ policy: p, step: 0, playing: true }),
  setStep: (step) => set({ step }),
  setPlaying: (playing) => {
    const s = get();
    if (playing && s.sim && s.step >= s.sim.steps) set({ step: 0 });
    set({ playing });
  },
  setSpeed: (speed) => set({ speed }),

  decide: async (id, action, reason) => {
    try {
      const r = await api.action(id, action, reason, TEAMS);
      set((s) => ({
        actions: [r.action, ...s.actions],
        simStale: !!s.sim,
        data: s.data && {
          ...s.data,
          team: r.team,
          record_backend: r.record_backend,
          incidents: s.data.incidents.map((i) => ({
            ...i,
            attendance: r.attendance[i.id] ?? i.attendance,
            status:
              i.id === id
                ? r.incident_status
                : r.attendance[i.id] === "unattended"
                  ? "Unattended — waiting"
                  : r.attendance[i.id] === "open"
                    ? "Awaiting decision"
                    : i.status,
            status_updated_at: i.id === id ? r.action.created_at : i.status_updated_at,
          })),
        },
      }));
      const preds = get().predictions;
      const label = (iid: string) => {
        const inc = get().data?.incidents.find((i) => i.id === iid);
        return `${shortId(iid)}${inc ? ` · ${inc.region}` : ""}`;
      };
      const time = new Date(r.action.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (action === "ASSIGN_INSPECTION") {
        const waiting = (r.action.left_waiting ?? [])
          .filter((w) => r.attendance[w.incident_id] === "unattended")
          .map((w) => `${label(w.incident_id)} · ${pct(w.probability ?? preds[w.incident_id]?.probability)}`);
        get().toast({
          tone: "success",
          title: `${r.team.name} → ${label(id)}`,
          body: `${waiting.length ? `Now waiting: ${waiting.join(", ")}. ` : ""}Recorded at ${time}.`,
        });
      } else {
        get().toast({
          tone: "success",
          title: `${r.incident_status}: ${label(id)}`,
          body: `${r.team.status === "available" ? "The crew is available. " : ""}Recorded at ${time}.`,
        });
      }
      if (r.action.stored_in === "local_fallback") {
        get().toast({ tone: "warning", title: "Saved locally", body: "Supabase is unreachable. This decision is in the local record and can be synced later." });
      }
      return r.action;
    } catch (e) {
      get().toast({ tone: "error", title: "Decision not recorded", body: errMsg(e) });
      return null;
    }
  },

  explain: async (id) => {
    set((s) => ({ briefingLoading: { ...s.briefingLoading, [id]: true } }));
    try {
      const sim = get().sim;
      const r = await api.explain(id, TEAMS, sim && !get().simStale ? sim.comparison : undefined);
      set((s) => ({ briefings: { ...s.briefings, [id]: r } }));
    } catch (e) {
      get().toast({ tone: "error", title: "Briefing unavailable", body: errMsg(e) });
    } finally {
      set((s) => ({ briefingLoading: { ...s.briefingLoading, [id]: false } }));
    }
  },

  openFieldBrief: async (id, action) => {
    set({ fieldBrief: { open: true, loading: true, result: null, error: null } });
    try {
      const r = await api.fieldBrief(id, TEAMS, action?.id, action?.stored_in);
      set({ fieldBrief: { open: true, loading: false, result: r, error: null } });
    } catch (e) {
      set({ fieldBrief: { open: true, loading: false, result: null, error: errMsg(e) } });
    }
  },
  closeFieldBrief: () => set({ fieldBrief: { open: false, loading: false, result: null, error: null } }),

  toast: (t) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(() => get().dismissToast(id), 6500);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setMethodology: (v) => set({ methodologyOpen: v }),
  setRecordOpen: (v) => {
    set({ recordOpen: v });
    if (v) get().loadActions();
  },
  setControlsOpen: (v) => set({ controlsOpen: v }),
  camera: (kind) => set((s) => ({ cameraCommand: { kind, n: (s.cameraCommand?.n ?? 0) + 1 } })),
}));
