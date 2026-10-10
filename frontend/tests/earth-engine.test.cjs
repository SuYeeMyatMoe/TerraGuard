const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { loadModule } = require("./modules.cjs");

function controller(load) {
  assert.ok(fs.existsSync(path.resolve(__dirname, "../src/lib/earth-engine.ts")), "Earth Engine request controller is missing");
  return new (loadModule("src/lib/earth-engine.ts", {}, { Error }).EarthEngineController)(load);
}

test('revisiting a completed view reuses its resource objects, while explicit refresh reloads',async()=>{
  let calls=0;
  const state=controller(async id=>({incident_id:id,status:'ready',layers:[],n:++calls}));
  await state.load('A',30); const first=state.getSnapshot().data;
  await state.load('A',30); assert.equal(calls,1);
  await state.load('B',30); await state.load('A',30);
  assert.equal(state.getSnapshot().data,first); assert.equal(calls,2);
  await state.load('A',30,true); assert.equal(calls,3);
});

test('identical pending analysis is deduplicated rather than aborted and resubmitted',async()=>{
  let resolve,calls=0,signal;
  const state=controller((id,days,refresh,options)=>new Promise(r=>{resolve=r;calls++;signal=options.signal;}));
  const first=state.load('A',30);const second=state.load('A',30);
  assert.equal(calls,1);assert.equal(signal.aborted,false);
  resolve({status:'ready'});await Promise.all([first,second]);
});

test('unchanged raster identity preserves loaded source and tiles across metadata refresh',()=>{
  const {syncRaster}=loadModule('src/lib/map-style.ts');
  const sources=new Map(),layers=new Map(); let adds=0,removes=0;
  const map={getSource:id=>sources.get(id),getLayer:id=>layers.get(id),getStyle:()=>({layers:[]}),
    addSource:(id,s)=>{adds++;sources.set(id,s);},addLayer:l=>layers.set(l.id,l),
    removeSource:id=>{removes++;sources.delete(id);},removeLayer:id=>layers.delete(id)};
  const resource={tile_url:'/api/earth-engine/tiles/a/{z}/{x}/{y}',attribution:'Test'};
  const bounds=[-123,37,-122,38];
  syncRaster(map,'earth-engine',resource,bounds);
  syncRaster(map,'earth-engine',{...resource},[...bounds]);
  assert.equal(adds,1);assert.equal(removes,0);
  syncRaster(map,'earth-engine',null,null);
  assert.equal(removes,1);
});

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

test('a basemap added after dated imagery stays below it and above vector land fills', () => {
  const {rasterInsertionPoint}=loadModule('src/lib/map-style.ts');
  const layers=[{id:'background',type:'background'},{id:'land',type:'fill'},
    {id:'earth-engine-rgb',type:'raster'},{id:'earth-engine-ndvi',type:'raster'},
    {id:'road_minor',type:'line'},{id:'place',type:'symbol'}];
  const before=rasterInsertionPoint(layers, 'basemap');
  layers.splice(layers.findIndex(layer=>layer.id===before),0,
    {id:'scientific-background',type:'background'},{id:'world-imagery',type:'raster'});
  assert.ok(layers.findIndex(l=>l.id==='world-imagery') < layers.findIndex(l=>l.id==='earth-engine-rgb'));
  assert.ok(layers.findIndex(l=>l.id==='scientific-background') < layers.findIndex(l=>l.id==='earth-engine-ndvi'));
  assert.equal(rasterInsertionPoint(layers), 'road_minor');
});

test('comparison cameras preserve asymmetric panel padding and align geographic pixels', () => {
  const {syncCamera}=loadModule('src/lib/map-style.ts');
  let camera;
  const padding={top:0,bottom:0,left:300,right:420};
  syncCamera({getCenter:()=>({lng:111,lat:2}),getZoom:()=>10,getBearing:()=>0,getPitch:()=>0,getPadding:()=>padding},{jumpTo:value=>{camera=value;}});
  assert.equal(camera.padding,padding);
  assert.equal(camera.center.lng,111);
});

test('comparison retains before imagery and stale extents cannot win', async () => {
  const waits = [];
  const state = controller(() => new Promise(resolve => waits.push(resolve)));
  const a = state.load('A',30,false,{bounds:[110,1,112,3],mode:'context'});
  waits[0]({status:'ready',incident_id:'A',bounds:[110,1,112,3]}); await a;
  const b = state.load('A',30,false,{bounds:[111,2,113,4],mode:'context'});
  assert.equal(state.getSnapshot().data.incident_id,'A');
  const c = state.load('A',30,false,{bounds:[111,2,113,4],mode:'compare'});
  assert.equal(state.getSnapshot().data.incident_id,'A');
  waits[2]({status:'ready',comparison:{status:'ready'}}); await c;
  waits[1]({status:'ready',incident_id:'wrong'}); await b;
  assert.equal(state.getSnapshot().data.comparison.status,'ready');
});

test('RGB and NDVI sources survive switching the selected layer', () => {
  const {syncRasterLayers}=loadModule('src/lib/map-style.ts');
  const sources=new Map(),layers=new Map();let removes=0;
  const map={getSource:id=>sources.get(id),getLayer:id=>layers.get(id),getStyle:()=>({layers:[]}),
    addSource:(id,s)=>sources.set(id,s),addLayer:l=>layers.set(l.id,l),
    removeSource:id=>{removes++;sources.delete(id);},removeLayer:id=>layers.delete(id),
    setLayoutProperty(){},setPaintProperty(){}};
  const resources=['rgb','ndvi'].map(id=>({id,tile_url:`/api/earth-engine/tiles/${id}/{z}/{x}/{y}`,attribution:'test'}));
  syncRasterLayers(map,resources,[-180,-85,180,85],'rgb',true,1);
  syncRasterLayers(map,resources,[-180,-85,180,85],'ndvi',true,1);
  assert.equal(sources.size,2);assert.equal(removes,0);
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
  assert.match(ready, /0–0\.2 · low NDVI/);
  assert.match(ready, /Gray gaps have no clear observations/);
  const empty = renderToStaticMarkup(createElement(EarthEnginePanel, { ...props, state: {
    loading: false, error: null, data: { status: "no_data", reason: "No clear satellite pixels", analysis: { ndvi_mean: null, valid_coverage_pct: 0 } },
  }}));
  assert.match(empty, /No clear satellite pixels/);
  assert.doesNotMatch(empty, /Mean NDVI|Connected/);
});

test('background preparation publishes before imagery while after and statistics finish', async () => {
  let calls=0;
  const {EarthEngineController}=loadModule('src/lib/earth-engine.ts',{}, {Error,
    setTimeout:fn=>setImmediate(fn),clearTimeout:clearImmediate});
  const state=new EarthEngineController(async()=>{
    calls++;
    return {status:'ready',incident_id:'A',layers:[{id:'rgb',tile_url:'before'}],
      comparison:{status:calls===1?'preparing':'ready'},analysis_status:calls===1?'preparing':'ready'};
  });
  const updates=[];state.subscribe(()=>updates.push(state.getSnapshot()));
  await state.load('A',30,false,{background:true,mode:'compare'});
  assert.equal(calls,2);
  assert.ok(updates.some(value=>value.loading&&value.data?.layers?.[0].tile_url==='before'));
  assert.equal(state.getSnapshot().loading,false);
});

test('source readiness distinguishes pending and failed image tiles', () => {
  const {rasterSourceReady}=loadModule('src/lib/map-style.ts');
  const map={getSource:()=>({}),isSourceLoaded:()=>false};
  assert.equal(rasterSourceReady(map,'rgb',false),false);
  map.isSourceLoaded=()=>true;
  assert.equal(rasterSourceReady(map,'rgb',true),false);
  assert.equal(rasterSourceReady(map,'rgb',false),true);
});

test('comparison readiness requires matching cameras and a frame for the current layer', () => {
  const {cameraKey,camerasAligned}=loadModule('src/lib/map-style.ts');
  const camera=(lon)=>({getCenter:()=>({lng:lon,lat:3}),getZoom:()=>10,getPitch:()=>0,getBearing:()=>0,
    getPadding:()=>({left:300,right:420,top:0,bottom:0}),getCanvas:()=>({width:1200,height:800})});
  assert.equal(camerasAligned(camera(113),camera(112)),false);
  assert.equal(camerasAligned(camera(113),camera(113)),true);
  assert.equal(cameraKey(camera(113)),cameraKey(camera(113)));
  assert.notEqual(cameraKey(camera(113)),cameraKey(camera(112)));
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

test('automatic panel removes the extra analysis step and explains control-triggered loading', () => {
  const { renderToStaticMarkup } = require('react-dom/server');
  const { createElement } = require('react');
  const { EarthEnginePanel } = loadModule('src/components/command/EarthEnginePanel.tsx');
  const html = renderToStaticMarkup(createElement(EarthEnginePanel, {
    state: { loading: false, data: null, error: null }, manual: true, automatic: true,
    layer: 'rgb', setLayer() {}, days: 30, setDays() {}, opacity: 1, setOpacity() {},
    setMode() {}, retry() {}, tileError: false,
  }));
  assert.doesNotMatch(html, /Analyze this view/);
  assert.match(html, /loads automatically/);
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
