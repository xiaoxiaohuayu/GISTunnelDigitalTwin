import type { Cartesian3 } from 'cesium'
import type { EngineHandle } from './engine'

export interface TunnelSurvey {
  project?: import("../engines/projectConfig").TunnelProject
  heading?:number
  tubeIndices?:number[]
  actualPointAt?: (tube:number,distance:number,lateral:number,height:number)=>Cartesian3
  profileY?: (tube:number,lateral:number)=>number
  tubes: Cartesian3[][]
  length: number
  minCover: number
  grade: number
  center: Cartesian3
  pointAt?: (tube:number,distance:number,lateral:number,height:number) => Cartesian3
  boreNames?: string[]
}

export interface RoamingState {playing:boolean;tube:0|1;speed:number;distance:number;length:number}

export interface TunnelMapHandle extends EngineHandle {
  editPortalPosition:(kind:string,end:number)=>void
  startPositionEdit:(id:string)=>void
  previewPosition:(patch:Partial<import("../engines/projectConfig").AssetRecord>)=>void
  savePositionEdit:()=>Promise<void>
  cancelPositionEdit:()=>void
  applyProject:(project:import("../engines/projectConfig").TunnelProject|null)=>Promise<void>
  previewAsset:(asset:import("../engines/projectConfig").AssetRecord)=>void
  commitAssetRecord:(asset:import("../engines/projectConfig").AssetRecord,nextProject?:import("../engines/projectConfig").TunnelProject)=>Promise<void>
  attachEditorGizmo:(id:string,options:{mode:import('../editor/editorStore').GizmoMode;snapMode:import('../editor/editorStore').SnapMode;onPreview?:(record:import('../engines/projectConfig').AssetRecord)=>void;onCommit:(before:import('../engines/projectConfig').AssetRecord,after:import('../engines/projectConfig').AssetRecord)=>void;onCancel?:()=>void})=>void
  setEditorGizmoOptions:(options:{mode?:import('../editor/editorStore').GizmoMode;snapMode?:import('../editor/editorStore').SnapMode})=>void
  detachEditorGizmo:()=>void
  captureCameraBookmark:(name:string)=>import('../engines/projectConfig').CameraBookmark
  flyToCameraBookmark:(bookmark:import('../engines/projectConfig').CameraBookmark)=>void
  setSceneVisuals:(visuals:Partial<import('../engines/projectConfig').SceneVisualSettings>)=>void
  pickTunnelDropLocation:(clientX:number,clientY:number)=>import('../engines/dropPlacement').TunnelDropLocation|null
  updateTrafficSigns: (config: import('./scene').TrafficSignsConfig) => Promise<void>
  updatePortalSign: (config: import('./scene').PortalSignConfig) => Promise<void>
  setDetectionVisible: (visible:boolean) => void
  focusCamera: (id:string) => void
  setRoamingOptions: (patch:Partial<Pick<RoamingState,'tube'|'speed'>>) => void
  seekRoaming: (progress:number) => void
  clearDeviceSelection: () => void
  setCanopyVisible: (visible: boolean) => void
  setSystems: (patch: Partial<import('../engines/tunnelSystemsState').SystemsState>) => import('../engines/tunnelSystemsState').SystemsState
  focusIncident: () => void
  focusDevice: (id: string) => void
  playIntro: () => void
  skipIntro: () => void
  setRoaming: (enabled: boolean) => void
  setCameraGuardEnabled: (enabled: boolean) => void
  setWallsVisible: (visible: boolean) => void
  setUnderground: (enabled: boolean) => void
  focusLayBy: () => void
  focusSubstation: () => void
  focusPortal: (end?: 0 | 1) => void
  focusInterior: (crossPassage?: boolean) => void
}
