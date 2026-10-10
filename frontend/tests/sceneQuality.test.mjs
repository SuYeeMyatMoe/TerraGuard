import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/sceneQuality.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}});
const testModule = {exports:{}};
new Function('module','exports',compiled.outputText)(testModule,testModule.exports);
const {getSceneQuality, adaptSceneQuality} = testModule.exports;

test('canvas resolution respects the screen and bounded quality settings', () => {
  assert.equal(getSceneQuality('balanced',1).dpr,1);
  assert.equal(getSceneQuality('economy',3).dpr,1);
  assert.equal(getSceneQuality('high',3).dpr,1.75);
  assert.equal(getSceneQuality('balanced',NaN).dpr,1);
  for (const mode of ['economy','balanced','high']) {
    const settings=getSceneQuality(mode,2);
    assert.ok(settings.flamesPerCell >= 1, 'every burning cell retains a flame');
    assert.ok(settings.smokePerCell >= 1);
    assert.ok(settings.waterDrops > 0 && settings.waterDrops <= 144);
  }
});
test('a short slowdown does not change quality; a sustained slowdown does', () => {
  let state={level:1,slowSeconds:0,fastSeconds:0};
  state=adaptSceneQuality(state,25,1);
  assert.equal(state.level,1);
  state=adaptSceneQuality(state,25,1);
  assert.equal(state.level,1);
  state=adaptSceneQuality(state,25,1);
  assert.equal(state.level,0);
});
test('recovery is slower than decline and levels stay bounded', () => {
  let state={level:0,slowSeconds:0,fastSeconds:0};
  for (let i=0;i<9;i++) state=adaptSceneQuality(state,60,1);
  assert.equal(state.level,0);
  state=adaptSceneQuality(state,60,1);
  assert.equal(state.level,1);
  for (let i=0;i<50;i++) state=adaptSceneQuality(state,60,1);
  assert.equal(state.level,2);
  for (let i=0;i<50;i++) state=adaptSceneQuality(state,15,1);
  assert.equal(state.level,0);
});
test('invalid or idle samples reset observation without misclassifying idle as slow', () => {
  const state={level:1,slowSeconds:2,fastSeconds:0};
  for (const fps of [0,NaN,Infinity,-1]) {
    assert.deepEqual(adaptSceneQuality(state,fps,1),{level:1,slowSeconds:0,fastSeconds:0});
  }
  assert.equal(adaptSceneQuality(state,25,0).level,1);
});
