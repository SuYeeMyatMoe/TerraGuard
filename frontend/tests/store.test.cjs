const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./modules.cjs");

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function makeStore(api) {
  return loadModule("src/lib/store.ts", { "./api": { api, ApiError }, "./format": loadModule("src/lib/format.ts") }, { setTimeout: () => 0 }).useStore;
}

test("audit loading starts without waiting for incidents and predictions", async () => {
  let releaseIncidents;
  let releaseActions;
  const store = makeStore({
    incidents: () => new Promise(resolve => { releaseIncidents = resolve; }),
    actions: () => new Promise(resolve => { releaseActions = resolve; }),
  });
  const loading = store.getState().load();
  assert.equal(store.getState().actionsLoading, true);
  releaseIncidents({ scenario: { id: "S1" }, incidents: [] });
  releaseActions({ actions: [] });
  await loading;
  assert.equal(store.getState().actionsLoading, false);
});

test("audit failure is visible and a successful retry clears it", async () => {
  let failed = true;
  const action = { id: 1, scenario_id: "S1", incident_id: "I1" };
  const store = makeStore({
    incidents: async () => ({ scenario: { id: "S1" }, incidents: [] }),
    actions: async () => { if (failed) throw new ApiError(503, "Audit unavailable"); return { actions: [action] }; },
  });
  await store.getState().load();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(store.getState().actionsError, "Audit unavailable");
  assert.equal(store.getState().actionsLoading, false);
  failed = false;
  await store.getState().loadActions();
  assert.equal(store.getState().actionsError, null);
  assert.equal(store.getState().actions[0].id, 1);
});

test("decision captures the single-crew context and full action response", async () => {
  let captured;
  const store = makeStore({ action: async (...args) => {
    captured = args;
    return { action: { id: 1, created_at: "2026-10-10T00:00:00Z" }, incident_status: "Recheck requested", team: { status: "available" }, attendance: {}, record_backend: "sqlite" };
  } });
  await store.getState().decide("I1", "REQUEST_RECHECK", "Review");
  assert.equal(captured[3], 1);
  assert.equal(store.getState().actions.length, 1);
});

test("action request sends the resource context to the backend", async () => {
  let sent;
  const { api } = loadModule("src/lib/api.ts", {}, { fetch: async (_url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, json: async () => ({}) };
  } });
  await api.action("I1", "REQUEST_RECHECK", "Review", 0);
  assert.equal(sent.teams, 0);
});

test("scenario records and archives survive when the audit response arrives before incidents", async () => {
  let captured;
  let calls = 0;
  const store = makeStore({
    incidents: async scenario => { await new Promise(setImmediate); return { scenario: { id: scenario }, incidents: [] }; },
    actions: async (...args) => { captured = args; calls++; return { actions: [
      { id: 1, scenario_id: "S2" }, { id: 2, scenario_id: "S2", archived_at: "2026-01-01" }, { id: 3, scenario_id: "S1" },
    ] }; },
  });
  store.setState({ data: { scenario: { id: "S1" }, incidents: [] } });
  await store.getState().load("S2");
  assert.deepEqual(captured, ["S2", true]);
  assert.equal(calls, 1);
  assert.deepEqual(Array.from(store.getState().actions, a => a.id), [1]);
  assert.deepEqual(Array.from(store.getState().archivedActions, a => a.id), [2]);
});

test("the initial default replay filters records that arrived before the incident scenario", async () => {
  const store = makeStore({
    incidents: async () => { await new Promise(setImmediate); return { scenario: { id: "S1" }, incidents: [] }; },
    actions: async () => ({ actions: [{ id: 1, scenario_id: "S1" }, { id: 2, scenario_id: "S2" }] }),
  });
  await store.getState().load();
  assert.deepEqual(Array.from(store.getState().actions, a => a.id), [1]);
});

test("a slow previous audit request cannot overwrite the selected replay", async () => {
  let release;
  const store = makeStore({ actions: scenario => scenario === "S1"
    ? new Promise(resolve => { release = resolve; })
    : Promise.resolve({ actions: [{ id: 2, scenario_id: "S2" }] }) });
  const old = store.getState().loadActions("S1");
  await store.getState().loadActions("S2");
  release({ actions: [{ id: 1, scenario_id: "S1" }] });
  await old;
  assert.deepEqual(Array.from(store.getState().actions, a => a.id), [2]);
  assert.equal(store.getState().actionsLoading, false);
});

test("decide applies authoritative crew and waiting state while retaining fallback audit context", async () => {
  let captured;
  const action = { id: 1, created_at: "2026-10-10T00:00:00Z", stored_in: "local_fallback",
    reason: "Verify before suppression", left_waiting: [{ incident_id: "I2", probability: 0.4 }], reassigned_from: "I3" };
  const team = { name: "Terra crew", status: "assigned", assigned_incident_id: "I1" };
  const store = makeStore({ action: async (...args) => {
    captured = args;
    return { action, incident_status: "Crew assigned", team, attendance: { I1: "assigned", I2: "unattended", I3: "unattended" }, record_backend: "sqlite_fallback" };
  } });
  store.setState({ data: { scenario: { id: "S1" }, incidents: ["I1", "I2", "I3"].map(id => ({ id, region: "Forest", attendance: "open", status: "Awaiting decision" })) }, sim: {} });
  const result = await store.getState().decide("I1", "ASSIGN_INSPECTION", action.reason);
  assert.deepEqual(captured, ["I1", "ASSIGN_INSPECTION", action.reason, 1]);
  assert.equal(result, action);
  assert.equal(store.getState().data.team, team);
  assert.equal(store.getState().data.record_backend, "sqlite_fallback");
  assert.equal(store.getState().data.incidents[1].attendance, "unattended");
  assert.equal(store.getState().data.incidents[1].status, "Unattended — waiting");
  assert.equal(store.getState().data.incidents[0].status_updated_at, action.created_at);
  assert.equal(store.getState().actions[0], action);
  assert.equal(store.getState().simStale, true);
  assert.ok(store.getState().toasts.some(t => t.title === "Saved locally"));
  assert.ok(store.getState().toasts.some(t => t.body?.includes("I2")));
});

test("a rejected decision preserves state and shows the backend error", async () => {
  const store = makeStore({ action: async () => { throw new ApiError(503, "Storage unavailable"); } });
  const before = { scenario: { id: "S1" }, incidents: [] };
  store.setState({ data: before });
  assert.equal(await store.getState().decide("I1", "DISMISS", "False alarm"), null);
  assert.equal(store.getState().data, before);
  assert.equal(store.getState().actions.length, 0);
  assert.equal(store.getState().toasts[0].body, "Storage unavailable");
});

test("field brief identifies the action storage backend and single-crew context", async () => {
  let captured;
  const store = makeStore({ fieldBrief: async (...args) => { captured = args; return { content: {} }; } });
  await store.getState().openFieldBrief("I1", { id: 8, stored_in: "local_fallback" });
  assert.deepEqual(captured, ["I1", 1, 8, "local_fallback"]);
});

test("actions API encodes replay and archive inclusion; omitted resource count defaults to one", async () => {
  let url, body;
  const { api } = loadModule("src/lib/api.ts", {}, { fetch: async (path, init) => { url = path; body = init.body && JSON.parse(init.body); return { ok: true, json: async () => ({ actions: [] }) }; } });
  await api.actions("S 1", true);
  const query = new URL(url, "http://localhost").searchParams;
  assert.equal(query.get("scenario"), "S 1");
  assert.equal(query.get("include_archived"), "true");
  await api.action("I1", "REQUEST_RECHECK", "Review");
  assert.equal(body.teams, 1);
  assert.equal(body.reason, "Review");
});


test("the response test defaults to one shared crew, three crews on request, and a consequence uses one crew", async () => {
  const requests = [];
  const store = makeStore({ simulate: async request => {
    requests.push(request);
    return { teams: request.teams, ai_order: ["I1"], policies: { ai_priority: {}, none: {}, coordinator: request.coordinator_assignment ? {} : undefined } };
  } });
  store.setState({ data: { scenario: { id: "S1" }, incidents: [], team: { assigned_incident_id: null } } });
  assert.equal(store.getState().crewMode, 1);
  await store.getState().runSimulation({ autoplay: false });
  assert.equal(requests[0].teams, 1);
  assert.equal("coordinator_assignment" in requests[0], false);
  await store.getState().watchConsequence("I1", "ASSIGN_INSPECTION");
  assert.equal(requests[1].teams, 1);
  assert.equal(requests[1].coordinator_assignment, "I1");
  assert.equal(store.getState().policy, "coordinator");
  assert.equal(store.getState().selectedId, "I1");
  assert.equal(store.getState().playbackRun, 1);
  store.setState({ crewMode: 3 });
  await store.getState().runSimulation({ autoplay: false });
  assert.equal(requests[2].teams, 3);
  assert.equal(store.getState().policy, "ai_priority");
});

test("a consequence without a crew uses the no-intervention policy", async () => {
  let request;
  const store = makeStore({ simulate: async input => {
    request = input;
    return { teams: 1, ai_order: [], policies: { ai_priority: {}, none: {} } };
  } });
  store.setState({ data: { scenario: { id: "S1" }, incidents: [], team: { assigned_incident_id: null } } });
  await store.getState().watchConsequence("I1", "DISMISS");
  assert.equal(request.teams, 1);
  assert.equal(request.coordinator_assignment, null);
  assert.equal(store.getState().policy, "none");
});

test("a failed consequence request does not resume an old simulation", async () => {
  const store = makeStore({ simulate: async () => { throw new ApiError(503, "Simulation unavailable"); } });
  store.setState({ data: { scenario: { id: "S1" }, incidents: [], team: { assigned_incident_id: null } },
    sim: { teams: 3, ai_order: [], policies: {} }, step: 7, playing: true });
  await store.getState().watchConsequence("I1", "DISMISS");
  assert.equal(store.getState().playing, false);
  assert.equal(store.getState().step, 7);
  assert.equal(store.getState().simError, "Simulation unavailable");
});

test("a user-started playback continues into the Prediction report; scrubbing and previews do not", async () => {
  const opened = [];
  const store = makeStore({ reports: async (id) => { opened.push(id); return { incident_id: id }; } });
  const sim = { steps: 48, ai_order: ["B", "C", "A"], policies: {} };
  store.setState({ sim, selectedId: "B", step: 48 });

  store.getState().playbackEnded();                       // silent first run / scrubbing: not armed
  assert.deepEqual(opened, []);

  store.getState().setPlaying(true);                      // user presses play
  store.setState({ step: 48 });
  store.getState().playbackEnded();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(opened, ["B"]);
  assert.equal(store.getState().report.open, true);
  assert.equal(store.getState().report.tab, "prediction");

  store.setState({ report: { ...store.getState().report, open: false }, consequence: { incidentId: "B", action: "CONTINUE_MONITORING", crewHere: false } });
  store.getState().setPlaying(true);                      // consequence preview keeps its banner instead
  store.getState().playbackEnded();
  assert.deepEqual(opened, ["B"]);
  assert.equal(store.getState().playing, false);
});

test("a report prefetched during playback is reused when the report opens", async () => {
  let calls = 0;
  const store = makeStore({ reports: async (id) => { calls++; return { incident_id: id }; } });
  store.setState({ sim: { steps: 48, ai_order: ["B"], policies: {} }, selectedId: "B", step: 0 });
  store.getState().setPlaying(true);
  await store.getState().openReport("B", "prediction");
  assert.equal(calls, 1);
  assert.equal(store.getState().report.data.incident_id, "B");
});

test("switching crew mode reruns the response test with that many crews", async () => {
  const teams = [];
  const store = makeStore({ simulate: async r => { teams.push(r.teams); return { teams: r.teams, ai_order: [], policies: { ai_priority: {}, none: {} } }; } });
  store.setState({ data: { scenario: { id: "S1" }, incidents: [], team: { assigned_incident_id: null } } });
  store.getState().setCrewMode(3);
  await new Promise(resolve => setTimeout(resolve, 0));
  store.getState().setCrewMode(1);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(teams, [3, 1]);
});

test("clicking an incident selects it and requests a camera focus; automatic selection does not", () => {
  const store = makeStore({});
  store.getState().select("A");
  assert.equal(store.getState().focusRequest, 0);
  store.getState().focusIncident("B");
  store.getState().focusIncident("B");
  assert.equal(store.getState().selectedId, "B");
  assert.equal(store.getState().focusRequest, 2);
});

test("reports match the burn duration and refresh after rerunning with new settings", async () => {
  const bodies = [];
  const store = makeStore({ reports: async (id, body) => {
    bodies.push(body);
    return { incident_id: id, duration: body.burn_duration_steps };
  } });
  await store.getState().openReport("B");
  assert.equal(bodies[0].burn_duration_steps, 8);
  store.getState().setParam("burnDuration", 12);
  store.setState({ simStale: false }); // a rerun has applied the new settings
  await store.getState().openReport("B");
  assert.equal(bodies.length, 2);
  assert.equal(store.getState().report.data.duration, 12);
  await store.getState().openReport("B");
  assert.equal(bodies.length, 2);
});

test("a previous report failure cannot replace a newer report", async () => {
  let rejectOld;
  const store = makeStore({ reports: id => id === "A"
    ? new Promise((resolve, reject) => { rejectOld = reject; })
    : Promise.resolve({ incident_id: id }) });
  const old = store.getState().openReport("A");
  await store.getState().openReport("B");
  rejectOld(new ApiError(503, "Old report unavailable"));
  await old;
  assert.equal(store.getState().report.error, null);
  assert.equal(store.getState().report.data.incident_id, "B");
});

test("a slower report for the same incident cannot overwrite updated settings", async () => {
  let releaseOld;
  const store = makeStore({ reports: (id, body) => body.burn_duration_steps === 8
    ? new Promise(resolve => { releaseOld = resolve; })
    : Promise.resolve({ incident_id: id, duration: body.burn_duration_steps }) });
  const old = store.getState().openReport("B");
  store.getState().setParam("burnDuration", 12);
  await store.getState().openReport("B");
  releaseOld({ incident_id: "B", duration: 8 });
  await old;
  assert.equal(store.getState().report.data.duration, 12);
});
