import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { BoxGeometry, Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';

const source=readFileSync(new URL('../src/components/scene/staticMeshBatch.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}});
const testModule={exports:{}};
new Function('module','exports','require',compiled.outputText)(testModule,testModule.exports,createRequire(import.meta.url));
const {batchStaticMeshes}=testModule.exports;

test('static parts merge by appearance while animated parts and local transforms survive',()=>{
  const root=new Group(); root.position.set(50,0,0); root.scale.setScalar(2);
  const paint=new MeshStandardMaterial({color:'red'});
  const first=new Mesh(new BoxGeometry(1,1,1),paint); first.position.x=2;
  const second=new Mesh(new BoxGeometry(1,1,1),paint.clone()); second.position.x=-2;
  const wheels=new Group(); const tire=new Mesh(new BoxGeometry(1,1,1),paint); wheels.add(tire);
  root.add(first,second,wheels);
  const result=batchStaticMeshes(root,wheels,null);
  assert.equal(result.batches.length,1);
  assert.equal(first.visible,false);
  assert.equal(second.visible,false);
  assert.equal(tire.visible,true);
  assert.equal(result.batches[0].geometry.getAttribute('position').count,72);
  const bounds=new Box3().setFromBufferAttribute(result.batches[0].geometry.getAttribute('position'));
  assert.deepEqual(bounds.min.toArray(),[-2.5,-.5,-.5]);
  assert.deepEqual(bounds.max.toArray(),[2.5,.5,.5]);
  result.restore();
  assert.equal(first.visible,true);
  assert.equal(second.visible,true);
  result.batches.forEach(b=>{b.geometry.dispose();b.material.dispose();});
});
test('a beacon, unlike static copies of its paint, remains individually animated',()=>{
  const root=new Group(), wheels=new Group();
  const beacon=new MeshStandardMaterial({color:'blue'});
  const light=new Mesh(new BoxGeometry(1,1,1),beacon);
  root.add(light,new Mesh(new BoxGeometry(1,1,1),beacon.clone()),wheels);
  const result=batchStaticMeshes(root,wheels,beacon);
  assert.equal(light.visible,true);
  assert.equal(result.batches.length,1);
  beacon.emissiveIntensity=2;
  assert.notEqual(result.batches[0].material.emissiveIntensity,2);
  assert.ok(new Vector3().setFromMatrixPosition(light.matrix).length()===0);
  result.restore(); result.batches.forEach(b=>{b.geometry.dispose();b.material.dispose();});
});
