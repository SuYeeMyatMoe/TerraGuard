import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const path = new URL('../src/lib/smokePuff.ts', import.meta.url);
const source = readFileSync(path, 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}});
const testModule = {exports:{}};
new Function('module','exports',compiled.outputText)(testModule,testModule.exports);
const {sampleSmokePuff} = testModule.exports;
const make = () => ({rise:0,width:0,height:0,opacity:0});

test('a smoke puff expands and rises, then fades before recycling', () => {
  const start=sampleSmokePuff(0,0,make());
  const mid=sampleSmokePuff(0,.5,make());
  const end=sampleSmokePuff(0,.99999,make());
  assert.equal(start.opacity,0);
  assert.ok(mid.opacity>.4);
  assert.ok(mid.width>start.width && end.width>mid.width);
  assert.ok(mid.rise>start.rise && end.rise>mid.rise);
  assert.ok(end.opacity<.001);
});
test('smoke reuses the caller buffer and stays within the culling envelope', () => {
  const out=make();
  for(let time=0;time<100;time+=.17) {
    assert.equal(sampleSmokePuff(time,.31,out),out);
    assert.ok(out.rise>=0 && out.rise<=12.5);
    assert.ok(out.width>=4 && out.width<=15);
    assert.ok(out.height>=5 && out.height<=15);
    assert.ok(out.opacity>=0 && out.opacity<=.65);
  }
});
test('airborne smoke keeps its position after extinction and expires without respawning',()=>{
  const stoppedAt=3, phase=.2;
  const before=sampleSmokePuff(stoppedAt,phase,make());
  const atStop=sampleSmokePuff(stoppedAt,phase,make(),stoppedAt);
  assert.deepEqual(atStop,before);
  const later=sampleSmokePuff(stoppedAt+2,phase,make(),stoppedAt);
  assert.ok(later.rise>before.rise);
  assert.ok(later.opacity>0);
  for(const elapsed of [14,27,48]) assert.equal(sampleSmokePuff(stoppedAt+elapsed,phase,make(),stoppedAt).opacity,0);
});
