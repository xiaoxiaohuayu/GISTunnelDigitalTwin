export const roadPaint = '#ffffff'
export function isRoadMarking(id: string): boolean {
  return /^(direction-arrow|lane|edge|bay-dash|bay-edge)-/.test(id)
}

// Local X follows increasing station; each bore has one traffic direction.
export function roadArrow(tube:number):number[][] {
  const direction=tube===0?1:-1
  return [[-3,-.18],[.5,-.18],[.5,.18],[-3,.18],[.5,-.85],[3,0],[.5,.85]]
    .map(([along,lateral])=>[along!*direction,lateral!*direction])
}
