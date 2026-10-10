import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../src/lib/waterResponse.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}});
const testModule={exports:{}};
new Function('module','exports',compiled.outputText)(testModule,testModule.exports);
const {getWaterResponse}=testModule.exports;
const plan={assigned:true,dispatch:0,arrival:4,station:[6,10],route:[[1,10],[6,10]]};
const result={frames:[],events:[],metrics:{per_incident:[]}};
const frame={tick:0,assigned:true,arrived:false,team:[2,18],cells:[{id:210,x:10,z:10,state:'burning'}]};
const grid=value=>'1'.repeat(210)+value+'1'.repeat(189);

test('water waits for the backend arrival and never invents an unassigned crew',()=>{
  assert.equal(getWaterResponse(frame,result,plan,0).spraying,false);
  assert.equal(getWaterResponse({...frame,assigned:false},result,plan,0).spraying,false);
  assert.equal(getWaterResponse({...frame,tick:4,arrived:true},result,plan,0).spraying,true);
});
test('water and vehicle share a fixed station when the fire target changes',()=>{
  const before=JSON.stringify({frame,result,plan});
  const first=getWaterResponse({...frame,arrived:true},result,plan,0);
  const next=getWaterResponse({...frame,arrived:true,cells:[{id:211,x:11,z:10,state:'burning'}]},result,plan,0);
  assert.deepEqual(first.source,next.source);
  assert.deepEqual(first.source,plan.station);
  assert.notDeepEqual(first.target,next.target);
  assert.equal(JSON.stringify({frame,result,plan}),before);
});
test('recently suppressed fire gets mop-up; natural burn-out and firebreaks do not',()=>{
  const extinguished={...frame,arrived:true,tick:5,cells:[{id:210,x:10,z:10,state:'intervened'}]};
  const frames=Array.from({length:9},(_,step)=>[grid(step<5?'2':'4')]);
  assert.equal(getWaterResponse(extinguished,{...result,frames},plan,0).spraying,true);
  assert.equal(getWaterResponse({...extinguished,tick:8},{...result,frames},plan,0).spraying,false);
  const natural=frames.map(([value])=>[value.replace('4','3')]);
  assert.equal(getWaterResponse({...extinguished,cells:[{id:210,x:10,z:10,state:'burned'}]},{...result,frames:natural},plan,0).spraying,false);
  const firebreak=Array.from({length:9},(_,step)=>[grid(step<5?'1':'4')]);
  assert.equal(getWaterResponse(extinguished,{...result,frames:firebreak},plan,0).spraying,false);
});
test('suppression later in the run still renders, without a fixed wall-clock timeout',()=>{
  const frames=Array.from({length:16},(_,step)=>[grid(step<14?'2':'4')]);
  const late={...frame,tick:15,arrived:true,cells:[{id:210,x:10,z:10,state:'intervened'}]};
  assert.equal(getWaterResponse(late,{...result,frames},plan,0).spraying,true);
});
