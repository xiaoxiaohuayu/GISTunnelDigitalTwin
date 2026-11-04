import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultProject,mouthName,projectErrors,parseChainage,formatChainage,assetStation,sceneAsset,laneLateral } from '../src/engines/projectConfig.ts'
test('physical bore is independent from lane direction, chainage may increase or decrease',()=>{
  const p=defaultProject();p.bores=p.bores.slice(0,1);const b=p.bores[0]!
  b.offset=0;b.start=12000;b.end=10000;b.lanes[1]!.direction=-1
  assert.deepEqual(projectErrors(p),[])
  const a={id:'fixed-id',code:'CO-001',name:'CO监测',kind:'covi' as const,boreId:b.id,chainage:11320,lateral:4,height:2,heading:0}
  assert.equal(assetStation(a,b),680)
  assert.equal(sceneAsset(a,p).chainage,'K11+320')
  assert.equal(sceneAsset({...a,chainage:11000},p).id,'fixed-id')
  assert.equal(laneLateral(b,0),-1.75);assert.equal(laneLateral(b,1),1.75)
})
test('chainage parsing, duplicate IDs and out of range placement are checked',()=>{
  assert.equal(parseChainage('K10+320'),10320);assert.equal(parseChainage('ZK10+020.5'),10020.5)
  assert.equal(formatChainage(10320),'K10+320');assert.throws(()=>parseChainage('K10+oops'))
  assert.equal(formatChainage(10020.5),'K10+020.5');assert.equal(formatChainage(1999.9996),'K2+000')
  const p=defaultProject(),a={id:'a',code:'A',name:'风机',kind:'fan' as const,boreId:'bore-1',chainage:3000,lateral:0,height:6,heading:0}
  p.assets=[a,{...a}]
  assert.ok(projectErrors(p).some(e=>e.includes('超出')))
  assert.ok(projectErrors(p).some(e=>e.includes('ID')))
})
test('each portal mouth keeps its own name and falls back to the tunnel name',()=>{
  const p=defaultProject()
  assert.equal(mouthName(p,'bore-1',0),'青山隧道')
  p.mouths=[{boreId:'bore-1',end:0,name:'青山西口'},{boreId:'bore-2',end:1,name:'青山出口'}]
  assert.equal(mouthName(p,'bore-1',0),'青山西口')
  assert.equal(mouthName(p,'bore-1',1),'青山隧道')
  assert.equal(mouthName(p,'bore-2',1),'青山出口')
  assert.deepEqual(projectErrors(p),[])
  assert.ok(projectErrors({...p,mouths:[{boreId:'missing',end:0,name:'无名洞'}]}).some(e=>e.includes('洞口名称')))
  assert.ok(projectErrors({...p,mouths:[{boreId:'bore-1',end:0,name:'这是一个明显超过十六个字的洞口门楣'}]}).some(e=>e.includes('1～16')))
})
