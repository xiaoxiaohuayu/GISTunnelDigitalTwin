export interface LoadProgress { percent:number; stage:string; resource:string }
export interface PortalSignConfig { mode:'text'|'mixed'|'image'; name:string; length:string; subtitle?:string; notice?:string; image?:Blob }
export interface VehicleInfo { id:string; plate:string; plateColor:'蓝牌'|'黄牌'|'绿牌'; vehicleType:string }
export interface SceneOverlay {
  id:string; title:string; value:string; status:string; severity:string; selected:boolean
  x:number; y:number; distance:number; plateColor?:VehicleInfo['plateColor']
}
export interface OverlayRect { x:number; y:number; width:number; height:number }
export interface PlacedOverlay extends SceneOverlay { left:number; top:number }

export interface OverlayPosition { id:string; x:number; y:number; distance:number }

export interface TrafficSignsConfig { images:[Blob|null,Blob|null,Blob|null] }
