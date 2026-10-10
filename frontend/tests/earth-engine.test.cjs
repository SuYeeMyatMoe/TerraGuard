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
  let resolve, signal;
  const state = controller((id,days,refresh,options) => new Promise((r) => { resolve = r; signal = options.signal; }));
  const pending = state.load("A", 14);
  state.cancel();
  assert.equal(signal.aborted,true);
  resolve({ status: "ready" });
  await pending;
  assert.equal(state.getSnapshot().data, null);
});

test('roads and labels remain above satellite without toggling scientific overlays', () => {
  const {rasterInsertionPoint,isReferenceLabel}=loadModule('src/lib/map-style.ts');
  assert.equal(rasterInsertionPoint([{id:'background',type:'background'},{id:'water',type:'fill'},{id:'road_minor',type:'line'},{id:'place',type:'symbol'}]),'road_minor');
  assert.equal(isReferenceLabel({id:'place',type:'symbol'}),true);
  assert.equal(isReferenceLabel({id:'analysis-label',type:'symbol'}),false);
  assert.equal(isReferenceLabel({id:'pas-label',type:'symbol'}),false);
});

test('comparison cameras preserve asymmetric panel padding and align geographic pixels', () => {
  const {syncCamera}=loadModule('src/lib/map-style.ts');
  let camera;
  const padding={top:0,bottom:0,left:300,right:420};
  syncCamera({getCenter:()=>({lng:111,lat:2}),getZoom:()=>10,getBearing:()=>0,getPitch:()=>0,getPadding:()=>padding},{jumpTo:value=>{camera=value;}});
  assert.equal(camera.padding,padding);
  assert.equal(camera.center.lng,111);
});

test('viewport refresh retains useful imagery but comparison changes clear it and stale extents cannot win', async () => {
  const waits = [];
  const state = controller(() => new Promise(resolve => waits.push(resolve)));
  const a = state.load('A',30,false,{bounds:[110,1,112,3],mode:'context'});
  waits[0]({status:'ready',incident_id:'A',bounds:[110,1,112,3]}); await a;
  const b = state.load('A',30,false,{bounds:[111,2,113,4],mode:'context'});
  assert.equal(state.getSnapshot().data.incident_id,'A');
  const c = state.load('A',30,false,{bounds:[111,2,113,4],mode:'compare'});
  assert.equal(state.getSnapshot().data,null);
  waits[2]({status:'ready',comparison:{status:'ready'}}); await c;
  waits[1]({status:'ready',incident_id:'wrong'}); await b;
  assert.equal(state.getSnapshot().data.comparison.status,'ready');
});

test('the view retains a compatible extent while its next request is being scheduled',()=>{
  const {visibleImagery,imageryKey}=loadModule('src/lib/earth-engine.ts');
  const previous={key:imageryKey('A',30,{mode:'context',bounds:[110,1,112,3]}),loading:false,error:null,data:{incident_id:'A',status:'ready'}};
  const current=visibleImagery(previous,'A',30,{mode:'context',bounds:[111,2,113,4]});
  assert.equal(current.data,previous.data);assert.equal(current.loading,true);
  assert.equal(visibleImagery(previous,'B',30,{}).data,null);
  assert.equal(visibleImagery(previous,'A',14,{}).data,null);
  assert.equal(visibleImagery(previous,'A',30,{mode:'compare'}).data,null);
});

test('API sends view bounds and retrospective comparison explicitly', async () => {
  let url;
  const {api}=loadModule('src/lib/api.ts',{}, {fetch: async u => {url=u;return {ok:true,json:async()=>({})};}});
  await api.earthEngine('A',30,false,{bounds:[110,1,112,3],mode:'compare'});
  const params=new URL(url,'http://localhost').searchParams;
  assert.equal(params.get('bbox'),'110,1,112,3');
  assert.equal(params.get('mode'),'compare');
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

test('overview hides incident statistics and comparison exposes independent retrospective dates', () => {
  const {renderToStaticMarkup}=require('react-dom/server');
  const {createElement}=require('react');
  const {EarthEnginePanel}=loadModule('src/components/command/EarthEnginePanel.tsx');
  const analysis={scene_count:2,ndvi_mean:.5,valid_coverage_pct:80,acquisition_start:'2025-07-01',acquisition_end:'2025-07-28'};
  const props={layer:'rgb',setLayer(){},days:30,setDays(){},opacity:1,setOpacity(){},retry(){},tileError:false,mode:'compare',overview:true,state:{loading:false,error:null,data:{status:'ready',analysis,display:analysis,comparison:{status:'ready',analysis,display:{...analysis,acquisition_start:'2025-08-03',acquisition_end:'2025-08-28'},window:{start:'2025-07-29',end:'2025-08-28'}}}}};
  const html=renderToStaticMarkup(createElement(EarthEnginePanel,props));
  assert.match(html,/2025-08-03/);
  assert.match(html,/retrospective/);
  assert.match(html,/Never used for the incident prediction/);
  assert.doesNotMatch(html,/Mean NDVI|1 km mean NDVI/);
});

test('a failed tile keeps available acquisition dates and valid analysis visible',()=>{
  const {renderToStaticMarkup}=require('react-dom/server');const {createElement}=require('react');
  const {EarthEnginePanel}=loadModule('src/components/command/EarthEnginePanel.tsx');
  const html=renderToStaticMarkup(createElement(EarthEnginePanel,{layer:'rgb',setLayer(){},days:30,setDays(){},opacity:1,setOpacity(){},retry(){},tileError:true,state:{loading:false,error:null,data:{status:'ready',analysis:{scene_count:2,ndvi_mean:.5,valid_coverage_pct:80,acquisition_start:'2025-07-01',acquisition_end:'2025-07-28'}}}}));
  assert.match(html,/Satellite tiles could not load/);assert.match(html,/2025-07-01/);assert.match(html,/Mean NDVI/);
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
