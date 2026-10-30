import { PrimitiveCollection } from 'cesium'
import type { Viewer, Entity } from 'cesium'
/** Track resources owned by a scene update, leaving the Viewer/camera intact. */
export function sceneResources(viewer:Viewer){
  const beforeEntities=new Set(viewer.entities.values),beforePrimitives=new Set(Array.from({length:viewer.scene.primitives.length},(_,i)=>viewer.scene.primitives.get(i)))
  let entities:Entity[]=[],primitives:any[]=[]
  return {capture(){entities=viewer.entities.values.filter(e=>!beforeEntities.has(e));primitives=Array.from({length:viewer.scene.primitives.length},(_,i)=>viewer.scene.primitives.get(i)).filter(p=>!(p instanceof PrimitiveCollection)&&!beforePrimitives.has(p))},dispose(){entities.forEach(e=>viewer.entities.remove(e));primitives.forEach(p=>{if(viewer.scene.primitives.contains(p))viewer.scene.primitives.remove(p)})}}
}
