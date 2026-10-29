import type { Cartesian3 } from 'cesium'
import type { EngineHandle } from './engine'

export interface TunnelSurvey {
  tubes: Cartesian3[][]
  length: number
  minCover: number
  grade: number
  center: Cartesian3
}

export interface RoamingState {playing:boolean;tube:0|1;speed:number;distance:number;length:number}

export interface TunnelMapHandle extends EngineHandle {
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
  setWallsVisible: (visible: boolean) => void
  setUnderground: (enabled: boolean) => void
  focusLayBy: () => void
  focusSubstation: () => void
  focusPortal: (end?: 0 | 1) => void
  focusInterior: (crossPassage?: boolean) => void
}
