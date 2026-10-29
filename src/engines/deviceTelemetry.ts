import { deviceAlarm, deviceEnabled, deviceVms, deviceMessage, deviceEntrance, deviceLane, deviceCatalog, incidentTelemetry, escapeSignDirection } from './tunnelSystemsState.ts'
import type { SceneDevice, SystemsState } from './tunnelSystemsState.ts'

export function deviceName(device: SceneDevice): string {
  if(device.name)return `${device.name} · ${device.code??device.id}`
  return `${deviceCatalog.find(item => item[1] === device.kind)?.[2] ?? device.kind} · ${device.id.split('-').at(-1)}`
}

// Deliberately deterministic demo readings; never presented as live telemetry.
export function deviceTelemetry(device: SceneDevice, state: SystemsState, length: number) {
  length=device.boreLength??length
  const alarm = deviceAlarm(device.id,state)
  if (alarm === 'environment' && device.kind === 'covi') return { status: '数值超限', value: '85 ppm', severity: 'alarm', note: 'CO 超过演示阈值 50 ppm' }
  if (alarm === 'fan' && device.kind === 'fan') return { status: '设备故障', value: '0 r/min', severity: 'alarm', note: '转子停转，演示故障反馈' }
  if (alarm === 'camera' && device.kind === 'camera') return { status: '通信离线', value: '—', severity: 'warning', note: '通信中断，当前数值不可用' }
  const incident=incidentTelemetry(device,state,length)
  if(incident)return incident
  const enabled=deviceEnabled(device,state)
  if(!enabled&&!['fan','pump','speaker','shutter','basic','enhanced','street','vms'].includes(device.kind))return {status:'关闭',value:'—',severity:'normal',note:'本地模拟数据，未接入现场监测'}
  let value = '待命', status = '正常'
  switch (device.kind) {
    case 'covi': value = '12 ppm / 0.002 m⁻¹'; break
    case 'no2': value = '0.12 ppm'; break
    case 'wind': {
      const count=Math.max(1,Math.ceil((length-150)/300)),index=Math.max(0,Math.min(count-1,Math.round((device.station-150)/300)))
      const on=[1,2].some(side=>deviceEnabled({...device,id:`fan-${device.tube*count*2+index*2+side}`,kind:'fan',station:150+index*300},state))
      value=on?'3.2 m/s':'1.4 m/s';break
    }
    case 'humidity': value = '23.6 °C / 62 %RH'; break
    case 'fbg': value = '24.1 °C'; break
    case 'fan': value = enabled ? '1480 r/min' : '0 r/min'; status = enabled ? '运行中' : '待机'; break
    case 'pump': value = enabled ? '0.65 MPa' : '0.00 MPa'; status = enabled ? '运行中' : '待机'; break
    case 'camera': value = '25 fps'; status = '在线'; break
    case 'basic': value = enabled ? '100 %' : '0 %'; status = value === '0 %' ? '关闭' : '开启'; break
    case 'enhanced': value = enabled ? '100 %' : '0 %'; status = enabled ? '开启' : '关闭'; break
    case 'street': value = enabled ? '100 %' : '0 %'; status = enabled ? '开启' : '关闭'; break
    case 'shutter': value = enabled ? '100 % 开度' : '0 % 开度'; status = enabled ? '开启' : '关闭'; break
    case 'speaker': value = enabled ? '应急广播' : '静音'; status = enabled ? '广播中' : '待机'; break
    case 'signal': value = {green:'绿灯',yellow:'黄灯',red:'红灯'}[deviceEntrance(device,state)]; break
    case 'substation': value = '未接入监测'; status = '未接入'; break
    case 'tank': value = '82 % 液位'; break
    case 'detector': value = '56 km/h'; break
    case 'flame': value = '未检出火焰'; break
    case 'vms': value = deviceVms(device,state).enabled ? deviceMessage(device,state) || '空屏' : '黑屏'; status = deviceVms(device,state).enabled ? (value==='空屏'?'空屏':'显示中') : '已关闭'; break
    case 'lane': value = {left:'向横洞疏散',cross:'禁止通行',down:'通行'}[deviceLane(device,length,state)]; break
    case 'escape': value = escapeSignDirection(device.station,device.tube,length)==='left'?'← 安全出口':'安全出口 →'; break
    case 'pedestrian': case 'vehicle': value = '通道畅通'; break
    case 'layby': value = '空闲'; break
    default: value = '正常反馈'
  }
  return { status, value, severity: 'normal', note: '本地模拟数据，未接入现场监测' }
}
export const alarmScenarios = [
  { mode: 'environment', id: 'covi-1', title: 'CO 浓度超限', detail: '85 ppm · 演示阈值 50 ppm' },
  { mode: 'fan', id: 'fan-1', title: '射流风机故障', detail: '转子停转 · 转速 0 r/min' },
  { mode: 'camera', id: 'camera-1', title: '监控摄像机离线', detail: '通信中断 · 数值不可用' },
] as const

// Derive from the same readings as the inspector; dismiss only on recovery.
export function activeDeviceAlerts(devices: SceneDevice[], state: SystemsState, length: number) {
  return devices.flatMap(device => {
    const reading = deviceTelemetry(device, state, length)
    return reading.severity === 'normal' ? [] : [{ device, name: deviceName(device), ...reading }]
  }).sort((a, b) => Number(b.severity === 'alarm') - Number(a.severity === 'alarm'))
}
