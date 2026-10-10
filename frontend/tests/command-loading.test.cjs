const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { loadModule } = require('./modules.cjs');

function command(initial = {}) {
  const state = { view: 'sim', sim: null, data: null, predictions: {}, predictionErrors: {},
    loading: false, simLoading: false, loadError: null, simError: null, load: async () => {},
    setView(view) { state.view = view; }, select() {}, ...initial };
  const useStore = select => select(state);
  useStore.getState = () => state;
  useStore.setState = update => Object.assign(state, update);
  let cursor = 0, refCursor = 0, forestProps;
  const slots = [], refs = [], effects = [];
  const empty = () => null;
  const replacements = {
    react: { ...React, useState: initial => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
    }, useRef: value => refs[refCursor++] ??= { current: value }, useEffect: fn => { effects.push(fn); }, useCallback: fn => fn },
    'next/dynamic': { default: (() => { let index = 0; return () => index++ === 0 ? props => { forestProps = props; return React.createElement('canvas'); } : empty; })() },
    '@/lib/store': { useStore }, '@/lib/format': { pct: String, shortId: String },
    '@/components/ui': { RecPill: empty }, './studio.css': {}, './mainSync.css': {},
    './CommandLoading': loadModule('src/components/command/CommandLoading.tsx', {
      './CommandLoading.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
    }),
  };
  for (const name of ['ControlsPanel', 'DecisionPanel', 'IntelligencePanel', 'DecisionRecord', 'MethodologyDrawer', 'IncidentRoster', 'Timeline', 'TopBar']) {
    replacements[`./${name}`] = { [name]: empty };
  }
  replacements['./ReportCanvas'] = { ConsequenceBanner: empty, ReportCanvas: empty };
  replacements['./Overlays'] = { FieldBriefModal: empty, Toasts: empty };
  const { CommandCenter } = loadModule('src/components/command/CommandCenter.tsx', replacements, {
    window: { location: { search: '' }, addEventListener() {}, removeEventListener() {} },
  });
  return { state, render() { cursor = refCursor = 0; effects.length = 0; return renderToStaticMarkup(React.createElement(CommandCenter)); },
    async mount() { effects.splice(0).forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve)); },
    ready() { forestProps.onReady(); } };
}

test('the first render covers the workspace and prevents interaction before hydration', () => {
  const app = command();
  const html = app.render();
  assert.match(html, /role="status"/);
  assert.match(html, /inert=""/);
  assert.match(html, /aria-hidden="true"/);
});

test('complete simulation data stays covered until the forest has rendered', async () => {
  const app = command({ data: { incidents: [] }, sim: {} });
  app.render(); await app.mount();
  assert.match(app.render(), /role="status"/);
  app.ready();
  const html = app.render();
  assert.doesNotMatch(html, /role="status"/);
  assert.doesNotMatch(html, /inert=""/);
  app.state.sim = {};
  assert.match(app.render(), /role="status"/, 'a replacement simulation must render before being revealed');
});

test('a failed simulation provides recovery instead of an endless spinner', async () => {
  const app = command({ data: { incidents: [] }, simError: 'The request timed out.' });
  app.render(); await app.mount();
  const html = app.render();
  assert.match(html, /role="alert"/);
  assert.match(html, /Retry/);
  assert.match(html, /Earth View/);
});
