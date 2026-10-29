import { crossPassages } from './tunnelSystemsState'
// Demonstration geometry, in metres. Both bores retain two through lanes.
export function layBy(length: number, tube: number) {
  const center = length * (tube === 0 ? 0.32 : 0.68)
  return { center, start: center - 42, flatStart: center - 30, flatEnd: center + 30, end: center + 42, width: 3 }
}

export function layByWidth(station: number, length: number, tube: number): number {
  const bay = layBy(length, tube)
  const ramp = Math.min((station - bay.start) / 12, (bay.end - station) / 12, 1)
  const t = Math.max(0, ramp)
  return bay.width * t * t * (3 - 2 * t)
}

export function interiorStations(length: number, tube: number): number[] {
  const bay = layBy(length, tube)
  const stations = [-60, length + 60, bay.start, bay.flatStart, bay.flatEnd, bay.end]
  for (let s = -60; s < length + 60; s += 2) stations.push(s)
  for (const start of [bay.start, bay.flatEnd]) {
    for (let s = start; s <= start + 12; s += .5) stations.push(s)
  }
  for (const p of crossPassages(length)) {
    for (let i = 0; i <= 40; i++) stations.push(p.station-p.halfWidth+2*p.halfWidth*i/40)
  }
  return [...new Set(stations)].sort((a, b) => a - b)
}
