export interface DrillRecord { id:number;key:string;name:string;startedAt:number;endedAt?:number }
export function updateDrillHistory(records:DrillRecord[],entries:{key:string;name:string}[],now:number):DrillRecord[] {
  const active=new Set(entries.map(entry=>entry.key))
  const next=records.map(record=>record.endedAt===undefined&&!active.has(record.key)?{...record,endedAt:now}:record)
  let id=Math.max(0,...records.map(record=>record.id))
  for(const entry of entries)if(!next.some(record=>record.key===entry.key&&record.endedAt===undefined)){
    next.unshift({...entry,id:++id,startedAt:now})
  }
  return next.slice(0,8)
}
