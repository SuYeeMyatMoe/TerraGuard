const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { loadModule } = require("./modules.cjs");

function controller(load) {
  assert.ok(fs.existsSync(path.resolve(__dirname, "../src/lib/earth-engine.ts")), "Earth Engine request controller is missing");
  return new (loadModule("src/lib/earth-engine.ts", {}, { Error }).EarthEngineController)(load);
}

test("changing incidents clears the old imagery and ignores an out-of-order response", async () => {
  const waits = {};
  const state = controller((id) => new Promise((resolve) => { waits[id] = resolve; }));
  const a = state.load("A", 30);
  const b = state.load("B", 30);
  assert.equal(state.getSnapshot().loading, true);
  assert.equal(state.getSnapshot().data, null);
  waits.B({ incident_id: "B", status: "ready" });
  await b;
  waits.A({ incident_id: "A", status: "ready" });
  await a;
  assert.equal(state.getSnapshot().data.incident_id, "B");
});

test("errors are visible and retry replaces them with the latest data", async () => {
  let fail = true;
  const state = controller(async () => {
    if (fail) throw new Error("Connection interrupted");
    return { status: "not_configured" };
  });
  await state.load(undefined, 30);
  assert.equal(state.getSnapshot().error, "Connection interrupted");
  fail = false;
  await state.load(undefined, 30);
  assert.equal(state.getSnapshot().error, null);
  assert.equal(state.getSnapshot().data.status, "not_configured");
});

test("unmount invalidates pending requests", async () => {
  let resolve;
  const state = controller(() => new Promise((r) => { resolve = r; }));
  const pending = state.load("A", 14);
  state.cancel();
  resolve({ status: "ready" });
  await pending;
  assert.equal(state.getSnapshot().data, null);
});

test("API uses the selected historical window and handles no-selection status", async () => {
  const urls = [];
  const { api } = loadModule("src/lib/api.ts", {}, { fetch: async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ status: "not_configured" }) };
  }});
  assert.equal(typeof api.earthEngine, "function");
  await api.earthEngine("INC/A", 60);
  await api.earthEngine(undefined, 30);
  await api.earthEngine("A", 14, true);
  assert.deepEqual(urls, ["/api/earth-engine/INC%2FA?days=60", "/api/earth-engine", "/api/earth-engine/A?days=14&refresh=true"]);
});

test("imagery panel distinguishes missing data from numeric vegetation evidence", () => {
  const { renderToStaticMarkup } = require("react-dom/server");
  const { createElement } = require("react");
  const { EarthEnginePanel } = loadModule("src/components/command/EarthEnginePanel.tsx");
  const props = { layer: "ndvi", setLayer() {}, days: 30, setDays() {}, opacity: 1, setOpacity() {}, retry() {}, tileError: false };
  const ready = renderToStaticMarkup(createElement(EarthEnginePanel, { ...props, state: {
    loading: false, error: null, data: { status: "ready", analysis: { scene_count: 2, ndvi_mean: -0.3,
      valid_coverage_pct: 42, acquisition_start: "2025-07-01", acquisition_end: "2025-07-28" } },
  }}));
  assert.match(ready, /-0\.30/);
  assert.match(ready, /42\.0/);
  assert.match(ready, /Limited clear coverage/);
  assert.match(ready, /Satellite opacity/);
  const empty = renderToStaticMarkup(createElement(EarthEnginePanel, { ...props, state: {
    loading: false, error: null, data: { status: "no_data", reason: "No clear satellite pixels", analysis: { ndvi_mean: null, valid_coverage_pct: 0 } },
  }}));
  assert.match(empty, /No clear satellite pixels/);
  assert.doesNotMatch(empty, /Mean NDVI|Connected/);
});

test("map layers can change while tiles are pending and stale style listeners are removed", () => {
  assert.ok(fs.existsSync(path.resolve(__dirname, "../src/lib/map-style.ts")), "Map style lifecycle helper is missing");
  const { afterStyleReady } = loadModule("src/lib/map-style.ts");
  let style, callback, event, applied = 0;
  const map = { getStyle: () => style, once: (name, fn) => { event = name; callback = fn; },
    off: (name, fn) => { if (event === name && callback === fn) callback = null; } };
  const cancel = afterStyleReady(map, () => { applied++; });
  assert.equal(event, "style.load");
  cancel();
  assert.equal(callback, null);
  style = { layers: [] }; // Style parsed, although source tiles may still be loading.
  afterStyleReady(map, () => { applied++; });
  assert.equal(applied, 1);
});
