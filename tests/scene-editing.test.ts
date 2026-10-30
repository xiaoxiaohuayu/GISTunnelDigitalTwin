import assert from 'node:assert/strict'
import test from 'node:test'
import { Cartesian3, Entity, Matrix4, PrimitiveCollection } from 'cesium'
import type { Model, Viewer } from 'cesium'
import { axisDistance } from '../src/engines/positionGizmo.ts'
import { DeviceInstance } from '../src/engines/deviceInstance.ts'
import { sceneResources } from '../src/engines/sceneResources.ts'
import { portalLateral, portalAlong } from '../src/engines/portalGeometry.ts'
import { defaultProject } from '../src/engines/projectConfig.ts'

test('axis drag rejects a nearly parallel ray and measures a stable transverse ray',()=>{
  assert.equal(axisDistance(new Cartesian3(10,0,0),Cartesian3.UNIT_X,Cartesian3.ZERO,Cartesian3.UNIT_X),undefined)
  assert.equal(axisDistance(new Cartesian3(7,10,0),new Cartesian3(0,-1,0),Cartesian3.ZERO,Cartesian3.UNIT_X),7)
})
test('device moves all attached parts without accumulating offsets and can restore its base',()=>{
  const model={modelMatrix:Matrix4.fromTranslation(new Cartesian3(12,0,0))} as Model
  const entity=new Entity({position:new Cartesian3(10,0,2)})
  let screen=Matrix4.clone(Matrix4.IDENTITY),renders=0
  const instance=new DeviceInstance({id:'camera-1',kind:'camera',tube:0,station:0,lateral:0,height:2},Matrix4.fromTranslation(new Cartesian3(10,0,0)),{scene:{requestRender(){renders++}}} as unknown as Viewer)
  instance.addModel(model);instance.addEntity(entity);instance.addTransform(delta=>screen=delta)
  instance.move(Matrix4.fromTranslation(new Cartesian3(15,3,1)))
  instance.move(Matrix4.fromTranslation(new Cartesian3(16,4,2)))
  assert.deepEqual(Matrix4.getTranslation(model.modelMatrix,new Cartesian3()),new Cartesian3(18,4,2))
  assert.deepEqual(Matrix4.getTranslation(screen,new Cartesian3()),new Cartesian3(6,4,2))
  instance.move(Matrix4.fromTranslation(new Cartesian3(10,0,0)))
  assert.deepEqual(Matrix4.getTranslation(model.modelMatrix,new Cartesian3()),new Cartesian3(12,0,0))
  assert.equal(renders,3)
})
test('scene release preserves Cesium-owned primitive collections and preexisting scene parts',()=>{
  const prior={},dynamic=new PrimitiveCollection(),owned={},list:unknown[]=[prior]
  const viewer={entities:{values:[],remove(){}},scene:{primitives:{get length(){return list.length},get:(i:number)=>list[i],contains:(p:unknown)=>list.includes(p),remove:(p:unknown)=>list.splice(list.indexOf(p),1)}}} as unknown as Viewer
  const scope=sceneResources(viewer);list.push(dynamic,owned);scope.capture();scope.dispose()
  assert.deepEqual(list,[prior,dynamic]);dynamic.destroy()
})
test('portal widening moves lamp mounting points without scaling their edge clearance',()=>{
  const p=defaultProject();p.bores.forEach((b,i)=>{b.offset=i===0?12:-12;b.laneWidth=4.3})
  assert.equal(portalLateral(p,0,-18),-18)
  p.bores[0]!.lanes.push({id:'third',direction:1})
  assert.ok(Math.abs(portalLateral(p,0,-18)+20.15)<1e-10)
  assert.equal(portalLateral(p,0,18),18)
  assert.ok(Math.abs(portalLateral(p,1,18)-20.15)<1e-10)
})

test('single-bore portal assets retain valid shared accessors after geometry filtering',async()=>{
  const {readFile}=await import('node:fs/promises')
  const {portalGeometryUrl}=await import('../src/engines/portalGeometry.ts')
  const p=defaultProject();p.bores.splice(1);p.bores[0]!.offset=0
  for(const file of ['portal-structures.glb','portal-finishes.glb','portal-terrain-editable.glb']){
    const original=await readFile(new URL(`../src/assets/modelAssets/portal/${file}`,import.meta.url))
    const source=URL.createObjectURL(new Blob([original]))
    const result=await portalGeometryUrl(source,p,0)
    try{
      const bytes=await(await fetch(result)).arrayBuffer(),view=new DataView(bytes),size=view.getUint32(12,true)
      const gltf=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,20,size)))
      assert.equal(gltf.buffers[0].byteLength,bytes.byteLength-28-size)
      for(const mesh of gltf.meshes)for(const primitive of mesh.primitives){
        const a=gltf.accessors[primitive.indices];if(a?.bufferView===undefined)continue
        const b=gltf.bufferViews[a.bufferView],componentBytes=({5121:1,5123:2,5125:4} as Record<number,number>)[a.componentType]!
        assert.ok(a.count>0,`${file}: empty accessor`)
        assert.ok((a.byteOffset??0)+a.count*componentBytes<=b.byteLength,`${file}: shared accessor overflow`)
        assert.ok((b.byteOffset??0)+b.byteLength<=gltf.buffers[0].byteLength)
      }
    }finally{URL.revokeObjectURL(source);URL.revokeObjectURL(result)}
  }
})

test('each end portal follows its own physical bore length, including decreasing chainage',()=>{
  const p=defaultProject();p.bores[0]!.start=1000;p.bores[0]!.end=2940;p.bores[1]!.start=3000;p.bores[1]!.end=1100
  assert.equal(portalAlong(p,0,-12),0)
  assert.equal(portalAlong(p,1,-12),40)
  assert.equal(portalAlong(p,1,12),0)
  p.bores.splice(1);p.bores[0]!.offset=7
  assert.equal(portalAlong(p,1,12),0)
  assert.equal(portalLateral(p,0,-12),-7)
  assert.equal(portalLateral(p,1,12),7)
})
