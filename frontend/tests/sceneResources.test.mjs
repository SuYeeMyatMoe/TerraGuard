import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../src/lib/sceneResources.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}});
const testModule={exports:{}};
new Function('module','exports',compiled.outputText)(testModule,testModule.exports);
const {createSceneResourceCache}=testModule.exports;
const wait=()=>new Promise(resolve=>setTimeout(resolve,10));

test('shared owners and StrictMode replay retain one live resource until the final release',async()=>{
  let created=0,disposed=0;
  const cache=createSceneResourceCache(()=>({id:++created}),()=>disposed++);
  const first=cache.acquire('oak'), second=cache.acquire('oak');
  assert.equal(first.value,second.value);
  first.release(); first.release();
  await wait();
  assert.equal(disposed,0);
  second.release();
  const replay=cache.acquire('oak');
  assert.equal(replay.value,second.value);
  await wait();
  assert.equal(disposed,0);
  replay.release();
  await wait();
  assert.equal(disposed,1);
  const remount=cache.acquire('oak');
  assert.notEqual(remount.value,first.value);
  assert.equal(created,2);
  remount.release(); await wait();
  assert.equal(disposed,2);
});
