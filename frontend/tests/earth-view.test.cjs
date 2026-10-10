const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { loadModule } = require('./modules.cjs');

// Exercise the real component callbacks/effects without a browser or WebGL.
function earthView() {
  const hooks = [], effects = [], calls = [];
  let index = 0, dirty = true, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const memo = (factory, deps) => {
    const i = index++;
    if (!hooks[i] || !same(hooks[i].deps, deps)) hooks[i] = { value: factory(), deps };
    return hooks[i].value;
  };
  const react = {
    ...React,
    useState(initial) {
      const i = index++;
      if (!hooks[i]) hooks[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[i].value, next => {
        const value = typeof next === 'function' ? next(hooks[i].value) : next;
        if (!Object.is(value, hooks[i].value)) { hooks[i].value = value; dirty = true; }
      }];
    },
    useMemo: memo,
    useCallback: (fn, deps) => memo(() => fn, deps),
    useSyncExternalStore(subscribe, snapshot) {
      memo(() => subscribe(() => { dirty = true; }), [subscribe]);
      return snapshot();
    },
    useEffect(effect, deps) {
      const i = index++;
      if (!hooks[i] || !same(hooks[i].deps, deps)) effects.push(() => {
        hooks[i]?.cleanup?.();
        hooks[i] = { deps, cleanup: effect() };
      });
    },
  };
  function Map() {}
  function Panel() {}
  const store = { selectedId: 'A', data: { incidents: [{ id: 'A' }], provenance: { is_synthetic: true } } };
  const { EarthView } = loadModule('src/components/command/EarthView.tsx', {
    react,
    '@/lib/api': { api: { earthEngine: async (id, days, refresh, options) => {
      calls.push({ id, days, refresh, ...options });
      return { status: 'ready', incident_id: id, bounds: options.bounds, layers: [],
        ...(options.mode === 'compare' ? { comparison: { status: 'ready' } } : {}) };
    } } },
    '@/lib/store': { useStore: select => select(store) },
    '@/lib/earth-engine': loadModule('src/lib/earth-engine.ts'),
    '@/lib/map-geometry': loadModule('src/lib/map-geometry.ts'),
    './EarthMap': { EarthMap: Map },
    './EarthEnginePanel': { EarthEnginePanel: Panel },
  });
  const render = () => {
    let iterations = 0;
    do {
      dirty = false; index = 0; tree = EarthView();
      while (effects.length) effects.shift()();
      assert.ok(++iterations < 20, 'render/effect loop');
    } while (dirty);
  };
  const props = type => tree.props.children.find(child => child?.type === type).props;
  render();
  return {
    calls, render,
    map: () => props(Map), panel: () => props(Panel),
    async flush() { render(); await new Promise(setImmediate); render(); },
  };
}

test('automatic analysis follows controls, while initial browsing and camera movement never request imagery', async () => {
  const view = earthView();
  view.map().onViewport([110, 1, 110.4, 1.4]); await view.flush();
  assert.equal(view.calls.length, 0);
  view.panel().setLayer('ndvi'); await view.flush();
  assert.equal(view.calls.length, 1);
  assert.equal(view.panel().state.data.status, 'ready');
  assert.equal(view.calls[0].signal.aborted, false);
  view.map().onViewport([46.4, 24.4, 47, 25]); await view.flush();
  assert.equal(view.calls.length, 1, 'panning must not start another analysis');
  view.panel().setMode('compare'); await view.flush();
  assert.equal(view.calls.length, 2);
  assert.equal(view.calls[1].mode, 'compare');
  assert.ok(view.calls[1].bounds[0] < 47 && view.calls[1].bounds[0] > 40);
  assert.equal(view.panel().state.data.comparison.status, 'ready');
  view.panel().setDays(14); await view.flush();
  assert.equal(view.calls.length, 3);
  assert.equal(view.calls[2].days, 14);
  assert.equal(view.calls[2].signal.aborted, false, 'new settings must not reset their own request');
  view.panel().setOpacity(0.5); await view.flush();
  assert.equal(view.calls.length, 3);
});

test('automatic analysis waits for the first viewport and rejects world-scale aggregation', async () => {
  const view = earthView();
  view.panel().setLayer('ndvi'); await view.flush();
  assert.equal(view.calls.length, 0);
  view.map().onViewport([110, 1, 110.4, 1.4]); await view.flush();
  assert.equal(view.calls.length, 1);
  assert.equal(view.panel().analysisError, null);
  view.map().onViewport([-180, -70, 180, 70]); await view.flush();
  assert.equal(view.calls.length, 1);
  view.panel().setMode('compare'); await view.flush();
  assert.equal(view.calls.length, 1);
  assert.match(view.panel().analysisError, /Zoom in/);
});
