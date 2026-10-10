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
