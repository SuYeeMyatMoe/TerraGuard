import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/scenePlayback.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const testModule = { exports: {} };
new Function('module', 'exports', compiled.outputText)(testModule, testModule.exports);
const { needsForestAnimation, startScenePlayback } = testModule.exports;

function clock() {
  let id = 0;
  const pending = new Map();
  return {
    visible: () => true,
    request: callback => { pending.set(++id, callback); return id; },
    cancel: id => pending.delete(id),
    tick(time) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    get pending() { return pending.size; },
  };
}

test('rendering stays near 30 fps on both 60 Hz and 120 Hz displays', () => {
  for (const hz of [60, 120]) {
    const scheduler = clock();
    let renders = 0;
    const stop = startScenePlayback(() => renders++, scheduler);
    for (let i = 1; i <= hz; i++) scheduler.tick(i * 1000 / hz);
    assert.equal(renders, 30);
    stop();
    assert.equal(scheduler.pending, 0);
  }
});

test('hidden scenes stop GPU rendering and resume when visible; cleanup stops the loop', () => {
  const scheduler = clock();
  let visible = false, renders = 0;
  scheduler.visible = () => visible;
  const stop = startScenePlayback(() => renders++, scheduler);
  for (let time = 100; time <= 1000; time += 100) scheduler.tick(time);
  assert.equal(renders, 0);
  visible = true;
  scheduler.tick(1034);
  assert.equal(renders, 1);
  stop();
  scheduler.tick(1100);
  assert.equal(renders, 1);
});

test('arrival stops continuous drawing only after both fire and water stop', () => {
  const frame = { tick: 2, metrics: { burning: 0 } };
  const crew = { assigned: true, dispatch: 0, arrival: 3 };
  assert.equal(needsForestAnimation(frame, crew, false), true);
  assert.equal(needsForestAnimation({ ...frame, tick: 3 }, crew, false), false);
  assert.equal(needsForestAnimation({ ...frame, tick: 3 }, crew, true), true);
  assert.equal(needsForestAnimation({ tick: 3, metrics: { burning: 1 } }, crew, false), true);
  assert.equal(needsForestAnimation(frame, { ...crew, assigned: false }, false), false);
});
