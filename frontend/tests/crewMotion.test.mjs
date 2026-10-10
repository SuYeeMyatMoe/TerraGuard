import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../src/lib/crewMotion.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}});
const module={exports:{}};
new Function('module','exports',compiled.outputText)(module,module.exports);
const {getCrewPlan,getCrewPose}=module.exports;
const plot={incident_id:'B',fuel:Array.from({length:400},(_,id)=>Math.floor(id/20)===10?'0':'1').join(''),protected:'0'.repeat(400),ignition:[[9,10]]};
const result={assigned:['B'],events:[{incident_id:'B',type:'dispatch',step:0},{incident_id:'B',type:'arrival',step:4}],metrics:{per_incident:[]}};

test('vehicle stays on the connected access lane and parks outside the ignition cell',()=>{
  const plan=getCrewPlan(plot,result);
  assert.ok(plan.route.length>1);
  for (const [x,z] of plan.route) assert.equal(plot.fuel[z*20+x],'0');
  assert.notDeepEqual(plan.station,[10,9]);
  assert.deepEqual(getCrewPose(plan,4).position,plan.station);
});
test('arrival pose is continuous and does not teleport after water starts or stops',()=>{
  const plan=getCrewPlan(plot,result);
  const before=getCrewPose(plan,3.999).position,arrival=getCrewPose(plan,4).position;
  assert.ok(Math.hypot(before[0]-arrival[0],before[1]-arrival[1])<.01);
  assert.deepEqual(getCrewPose(plan,4).position,getCrewPose(plan,48).position);
});
test('fractional playback moves continuously; unassigned and delayed crews wait',()=>{
  const plan=getCrewPlan(plot,result);
  assert.notDeepEqual(getCrewPose(plan,.25).position,getCrewPose(plan,.75).position);
  const unassigned=getCrewPlan(plot,{...result,assigned:[]});
  assert.deepEqual(getCrewPose(unassigned,0),getCrewPose(unassigned,48));
  const delayed={...plan,dispatch:2,arrival:6};
  assert.deepEqual(getCrewPose(delayed,1).position,getCrewPose(delayed,2).position);
});
test('zero delay places the vehicle on site immediately, without division by zero',()=>{
  const plan={...getCrewPlan(plot,result),arrival:0};
  assert.deepEqual(getCrewPose(plan,0).position,plan.station);
});
