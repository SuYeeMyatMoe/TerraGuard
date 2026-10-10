import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/forestFrame.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const module = { exports: {} };
new Function('module', 'exports', compiled.outputText)(module, module.exports);
const { toForestFrame } = module.exports;
const plot = { incident_id:'B', fuel:'1'.repeat(400), protected:'1' + '0'.repeat(399), ignition:[[7,13]] };
const result = {
  assigned:['B'], frames:[['0'.repeat(400), '12340' + '1'.repeat(395)], ['0'.repeat(400), '32340' + '1'.repeat(395)]],
  events:[{incident_id:'B',type:'dispatch',step:0},{incident_id:'B',type:'arrival',step:1}],
  metrics:{per_incident:[{incident_id:'B',response_delay_steps:1}]},
};

test('decodes the selected backend plot and preserves all cell states and habitat', () => {
  const frame = toForestFrame(plot, result, 1, 0);
  assert.equal(frame.cells.length,400);
  assert.deepEqual(frame.cells.slice(0,5).map(c=>c.state),['protected','burning','burned','intervened','non-vegetated']);
  assert.deepEqual(frame.metrics,{burned:1,burning:1,habitat:0,healthy:397});
  assert.deepEqual([frame.cells[153].x,frame.cells[153].z],[13,7]);
});
test('uses backend crew arrival and converts row/column ignition into scene x/z', () => {
  assert.equal(toForestFrame(plot,result,1,0).arrived,false);
  const end = toForestFrame(plot,result,1,99);
  assert.equal(end.tick,1);
  assert.equal(end.arrived,true);
  assert.deepEqual(end.team,[13,7]);
  assert.equal(end.metrics.habitat,1);
});
test('an unassigned incident has no crew arrival or movement', () => {
  const frame = toForestFrame(plot,{...result,assigned:[]},1,1);
  assert.equal(frame.assigned,false);
  assert.equal(frame.arrived,false);
  assert.deepEqual(frame.team,[2,18]);
});
test('changing policy reads its own frames without mutating backend results', () => {
  const before = JSON.stringify(result);
  const alternate = {...result, frames:[['0'.repeat(400),'1'.repeat(400)]]};
  assert.equal(toForestFrame(plot,alternate,1,0).metrics.burned,0);
  assert.equal(toForestFrame(plot,result,1,1).metrics.burned,2);
  assert.equal(JSON.stringify(result),before);
});
test('invalid or unsupported grids are rejected rather than displayed as invented cells', () => {
  assert.throws(()=>toForestFrame(plot,{...result,frames:[['1'.repeat(399)]]},0,0),/20×20/);
  assert.throws(()=>toForestFrame(plot,{...result,frames:[['9'.repeat(400)]]},0,0),/20×20/);
});
