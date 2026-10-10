const test = require("node:test");
const assert = require("node:assert/strict");
const { loadModule } = require("./modules.cjs");

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function makeStore(api) {
  return loadModule("src/lib/store.ts", { "./api": { api, ApiError } }).useStore;
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
  releaseIncidents({ incidents: [] });
  releaseActions({ actions: [] });
  await loading;
  assert.equal(store.getState().actionsLoading, false);
});

test("audit failure is visible and a successful retry clears it", async () => {
  let failed = true;
  const action = { id: 1, incident_id: "I1" };
  const store = makeStore({
    incidents: async () => ({ incidents: [] }),
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

test("decision captures the currently selected team count", async () => {
  let captured;
  const store = makeStore({ action: async (...args) => {
    captured = args;
    return { action: { id: 1, created_at: "2026-10-10T00:00:00Z" }, incident_status: "Recheck requested" };
  } });
  store.setState({ teams: 0 });
  await store.getState().takeAction("I1", "REQUEST_RECHECK", "Review");
  assert.equal(captured[3], 0);
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
