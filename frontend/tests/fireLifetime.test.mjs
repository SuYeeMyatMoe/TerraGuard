import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../src/lib/fireLifetime.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}});
const testModule={exports:{}};
new Function('module','exports',compiled.outputText)(testModule,testModule.exports);
const {getFireHistory,sampleFireLife}=testModule.exports;
const encoded=(state)=>state+'1'.repeat(399);
const result={frames:[[encoded('2')],[encoded('2')],[encoded('4')],[encoded('4')]],assigned:['B'],events:[],metrics:{}};
const make=()=>({heat:0,smokeTime:0,smokeStop:null});
const sample=(life,tick,arrival=1)=>sampleFireLife(life,tick,arrival,1.8,make());

test('backend transitions retain the source history without altering cells or policy results',()=>{
  const before=JSON.stringify(result);
  const history=getFireHistory(result,0);
  assert.deepEqual(history,[{id:0,start:0,end:2,suppressed:true}]);
  assert.equal(getFireHistory(result,0),history);
  const natural={...result,frames:[[encoded('1')],[encoded('2')],[encoded('3')]]};
  assert.deepEqual(getFireHistory(natural,0),[{id:0,start:1,end:2,suppressed:false}]);
  assert.notEqual(getFireHistory(natural,0),history);
  assert.equal(JSON.stringify(result),before);
});
test('heat cools after arrival and fades continuously across the backend extinction',()=>{
  const [life]=getFireHistory(result,0);
  assert.equal(sample(life,.99).heat,1);
  assert.ok(sample(life,1.5).heat<1 && sample(life,1.5).heat>.55);
  const before=sample(life,1.99999),after=sample(life,2.00001);
  assert.ok(Math.abs(before.heat-after.heat)<.001);
  assert.ok(after.heat>.5);
  assert.ok(sample(life,2.6).heat>0);
  assert.equal(sample(life,4).heat,0);
  assert.equal(sample(life,1.5,2).heat,1);
});
test('seeking and replaying reconstruct identical tails; future and unrelated fires stay absent',()=>{
  const [life]=getFireHistory(result,0);
  const initial=sample(life,0);
  const tail=sample(life,3.5);
  sample(life,48);
  assert.deepEqual(sample(life,0),initial);
  assert.deepEqual(sample(life,3.5),tail);
  assert.ok(tail.smokeTime>tail.smokeStop);
  assert.equal(sample({...life,start:10,end:12},5).heat,0);
  assert.deepEqual(getFireHistory({...result,frames:[[encoded('1')],[encoded('1')]]},0),[]);
});
test('separate ignition episodes and separate plots have independent histories',()=>{
  const r={...result,frames:[[encoded('2'),encoded('1')],[encoded('4'),encoded('2')],[encoded('2'),encoded('3')]]};
  assert.deepEqual(getFireHistory(r,0),[{id:0,start:0,end:1,suppressed:true},{id:0,start:2,end:null,suppressed:false}]);
  assert.deepEqual(getFireHistory(r,1),[{id:0,start:1,end:2,suppressed:false}]);
});
