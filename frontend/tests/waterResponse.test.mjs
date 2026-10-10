import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/waterResponse.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const module = { exports: {} };
new Function('module', 'exports', compiled.outputText)(module, module.exports);
const { getWaterResponse } = module.exports;
const result = { events:[{incident_id:'B',type:'arrival',step:4}], metrics:{per_incident:[]} };
const frame = { tick:0,assigned:true,arrived:false,team:[2,18],cells:[{id:0,x:10,z:10,state:'burning'}] };

test('automatic water waits for the backend crew arrival and has no ghost crew', () => {
  assert.equal(getWaterResponse(frame,result,'B',false).spraying,false);
  assert.equal(getWaterResponse({...frame,assigned:false},result,'B',true).phase,'unassigned');
  assert.equal(getWaterResponse({...frame,tick:4,arrived:true},result,'B',false).spraying,true);
});
test('preview is visual only and chooses a burning cell without modifying results', () => {
  const before = JSON.stringify({frame,result});
  const preview = getWaterResponse(frame,result,'B',true);
  assert.equal(preview.phase,'preview');
  assert.deepEqual(preview.target,[10,10]);
  assert.equal(JSON.stringify({frame,result}),before);
});
test('mop-up uses extinguished cells briefly, then stops without inventing a fire', () => {
  const cleared = {...frame,arrived:true,tick:4,cells:[{id:0,x:10,z:10,state:'intervened'}]};
  assert.equal(getWaterResponse(cleared,result,'B',false).spraying,true);
  assert.equal(getWaterResponse({...cleared,tick:7},result,'B',false).phase,'complete');
  assert.equal(getWaterResponse({...cleared,cells:[]},result,'B',true).spraying,false);
});
test('spray targets the nearest burning cell and supports arrival metric fallback', () => {
  const incident = {...frame,arrived:true,tick:5,team:[10,10],cells:[{x:1,z:1,state:'burning'},{x:11,z:10,state:'burning'}]};
  assert.deepEqual(getWaterResponse(incident,result,'B',false).target,[11,10]);
  const fallback = {events:[],metrics:{per_incident:[{incident_id:'B',response_delay_steps:4}]}};
  assert.equal(getWaterResponse({...incident,cells:[{x:10,z:10,state:'intervened'}]},fallback,'B',false).spraying,true);
});
