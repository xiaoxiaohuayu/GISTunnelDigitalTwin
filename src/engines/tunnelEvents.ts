// @env browser
import { modelAssetUrl } from './modelAssets'
import { CallbackPositionProperty, CallbackProperty, Cartesian2, Cartesian3, Color, ColorMaterialProperty, ConstantPositionProperty, ConstantProperty, HeadingPitchRoll, LabelStyle, Quaternion, Transforms } from 'cesium'
import type { Entity, Viewer } from 'cesium'
import type { TunnelSurvey } from '../types/tunnel'
import { incidentDefinition, incidentStation } from './tunnelSystemsState'
import type { SystemsState } from './tunnelSystemsState'
import { tunnelPoint } from './tunnelDetails'
import { fallingRock, workZoneLayout } from './incidentMotion'

export function addTunnelEvents(viewer:Viewer,survey:TunnelSurvey) {
  const props:Entity[]=[]
  const label=viewer.entities.add({id:'scene-incident',show:false,label:{text:'',font:'14px sans-serif',fillColor:Color.fromCssColorString('#ffad96'),
    showBackground:true,backgroundColor:Color.fromCssColorString('#291c27').withAlpha(.94),backgroundPadding:new Cartesian2(14,10),
    style:LabelStyle.FILL_AND_OUTLINE,outlineColor:Color.BLACK,outlineWidth:2,pixelOffset:new Cartesian2(0,-40)},
    polyline:{positions:[],width:2,material:Color.fromCssColorString('#ff927d')},
  })
  let current=''
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
  function update(state:SystemsState):void {
    const key=`${state.incident}:${state.incidentTube}`
    if(current===key)return
    current=key
    props.splice(0).forEach(entity=>viewer.entities.remove(entity))
    label.show=state.incident!=='none'
    if(state.incident==='none')return
    const started=performance.now(),elapsed=()=>Math.max(0,(performance.now()-started)/1000)
    const s=incidentStation(survey.length,state),tube=state.incidentTube
    const point=(along:number,lateral:number,z:number)=>tunnelPoint(survey,tube,s+along,lateral,z)
    const orientation=Transforms.headingPitchRollQuaternion(point(0,0,0),new HeadingPitchRoll(0,Math.atan(survey.grade/100),0))
    const solid=(along:number,lateral:number,z:number,x:number,y:number,h:number,color:string)=>{
      const entity=viewer.entities.add({position:point(along,lateral,z),orientation,box:{dimensions:new Cartesian3(x,y,h),material:Color.fromCssColorString(color)}})
      props.push(entity);return entity
    }
    // Entity models assume Z-forward; our Blender assets use X-forward.
    const modelCorrection=Quaternion.fromAxisAngle(Cartesian3.UNIT_Z,-Math.PI/2)
    const modelOrientation=state.incident==='construction'&&tube===1
      ?Transforms.headingPitchRollQuaternion(point(0,0,0),new HeadingPitchRoll(Math.PI,-Math.atan(survey.grade/100),0)):orientation
    const model=(asset:string,along:number,lateral:number,scale=1)=>{
      const entity=viewer.entities.add({position:point(along,lateral,.25),orientation:Quaternion.multiply(modelOrientation,modelCorrection,new Quaternion()),
        model:{uri:modelAssetUrl(asset),scale}})
      props.push(entity);return entity
    }
    if(state.incident==='construction') {
      const layout=workZoneLayout(tube)
      for(const along of layout.cones) model('work-cone',along,0)
      model('work-barrier',layout.barrier,-2.15)
      for(const lateral of [-3.4,-.9]) {
        const lamp=viewer.entities.add({position:point(layout.barrier,lateral,1.86),ellipsoid:{radii:new Cartesian3(.09,.09,.13),
          material:new ColorMaterialProperty(new CallbackProperty(()=>Color.fromCssColorString('#ffb52e').withAlpha(reduced?.95:.55+.4*Math.sin(elapsed()*Math.PI*2)**2),reduced))}})
        props.push(lamp)
      }
      for(const along of layout.workers) {
        model('worker',along,-3.65)
      }
    }
    if(state.incident==='pedestrian')model('human',0,-2.15)
    if(state.incident==='rock')for(let i=0;i<7;i++) {
      const rock=model(`incident-rock-${i%3}`,0,0,.48+(i%3)*.14)
      rock.position=new CallbackPositionProperty(()=>{
        const pose=fallingRock(elapsed(),i,reduced);return point(pose.along,pose.lateral,pose.height)
      },reduced)
      rock.orientation=new CallbackProperty(()=>{
        const pose=fallingRock(elapsed(),i,reduced)
        return Quaternion.multiply(Transforms.headingPitchRollQuaternion(point(pose.along,pose.lateral,pose.height),
          new HeadingPitchRoll(i*.8,Math.atan(survey.grade/100),pose.roll)),modelCorrection,new Quaternion())
      },reduced)
    }
    if(state.incident==='debris')for(let i=0;i<6;i++)solid((i%3)*1.3-1.5,-3.7+(i%2)*1.3,.35,.65,.45,.25,i%2?'#aa7c4c':'#6c777f')
    const target=point(0,state.incident==='line'?0:-2.15,.4),anchor=point(-3,1.4,2.8)
    label.position=new ConstantPositionProperty(anchor)
    if(label.label)label.label.text=new ConstantProperty(`${incidentDefinition(state.incident)?.name} · ${tube===0?'上行':'下行'}\n本地演练 · 距基点 ${Math.round(s)} m`)
    if(label.polyline)label.polyline.positions=new ConstantProperty([target,anchor])
    viewer.scene.requestRender()
  }
  return {update}
}
