// @env browser
import type { PortalSignFacility, TrafficSignBadge } from '../schema/tunnelSchema'

/**
 * 绘制洞口拱形门头上的隧道名称贴图（高清透明背景）
 */
export function renderPortalArchTitleCanvas(title: string, textColor: string): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 192
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const text = title.trim() || '未命名隧道'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  let fontSize = 112
  while (fontSize > 32) {
    ctx.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
    if (ctx.measureText(text).width <= 940) break
    fontSize -= 4
  }

  // 轻微投影增强混凝土门头上的可读性
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = textColor || '#f5f8fa'
  ctx.fillText(text, canvas.width / 2, canvas.height / 2)

  return canvas.toDataURL('image/png')
}

/**
 * 绘制隧道入口标牌（国标绿底白字 + 隧道图标 + 长度 + 黄色提示栏）
 */
export function renderPortalSignBoardCanvas(
  facility: PortalSignFacility,
  fallbackTunnelName: string,
  computedLengthMeters: number,
): string {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 880
  const ctx = canvas.getContext('2d')!

  const bgColor = facility.backgroundColor || '#007d65'
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 左侧隧道拱门图标
  ctx.fillStyle = '#1f3e36'
  ctx.beginPath()
  ctx.moveTo(95, 310)
  ctx.lineTo(95, 195)
  ctx.arc(195, 195, 100, Math.PI, 0)
  ctx.lineTo(295, 310)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#0d2621'
  ctx.beginPath()
  ctx.moveTo(132, 310)
  ctx.lineTo(132, 198)
  ctx.arc(195, 198, 63, Math.PI, 0)
  ctx.lineTo(258, 310)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#c9d4ca'
  ctx.beginPath()
  ctx.moveTo(148, 310)
  ctx.lineTo(180, 226)
  ctx.lineTo(210, 226)
  ctx.lineTo(242, 310)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(195, 294)
  ctx.lineTo(195, 250)
  ctx.stroke()

  const drawFittedText = (
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    initialSize: number,
    color = '#ffffff',
  ) => {
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let size = initialSize
    while (size > 22) {
      ctx.font = `700 ${size}px "PingFang SC", "Microsoft YaHei", sans-serif`
      if (ctx.measureText(text).width <= maxWidth) break
      size -= 2
    }
    ctx.fillText(text, x, y)
  }

  const displayTitle = facility.title.trim() || fallbackTunnelName || '隧道名称'
  const displayLength = facility.lengthText.trim() || `${Math.round(computedLengthMeters)} m`

  drawFittedText(displayTitle, 735, 170, 780, 108)
  drawFittedText(facility.subtitle || 'Tunnel Digital Twin', 735, 286, 780, 48, '#e3f4ef')

  // 分隔横线
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(28, 382)
  ctx.lineTo(1172, 382)
  ctx.moveTo(28, 646)
  ctx.lineTo(1172, 646)
  ctx.stroke()

  drawFittedText('长  度', 218, 484, 300, 84)
  drawFittedText('Length', 218, 568, 300, 46, '#d9efe9')
  drawFittedText(displayLength, 785, 518, 690, 138)

  // 底部黄色警示条
  ctx.fillStyle = '#ffca35'
  ctx.fillRect(28, 650, 1144, 202)
  drawFittedText(facility.notice || '请开灯行驶', 600, 752, 1060, 88, '#16241f')

  // 白色圆角外框
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 14
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.roundRect(22, 22, 1156, 836, 22)
  ctx.stroke()

  return canvas.toDataURL('image/png')
}

/**
 * 绘制单个圆形国标洞口交通标志贴图
 */
export function renderTrafficSignBadgeCanvas(badge: TrafficSignBadge): string {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')!
  const cx = 256
  const cy = 256

  ctx.clearRect(0, 0, 512, 512)

  const drawCircleBase = (borderColor: string, fillColor: string) => {
    ctx.beginPath()
    ctx.arc(cx, cy, 242, 0, Math.PI * 2)
    ctx.fillStyle = fillColor
    ctx.fill()
    ctx.lineWidth = 38
    ctx.strokeStyle = borderColor
    ctx.stroke()
  }

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  switch (badge.preset) {
    case 'speed_limit': {
      drawCircleBase('#d92b2b', '#ffffff')
      ctx.fillStyle = '#15181c'
      ctx.font = '800 185px "DIN Alternate", "Arial", sans-serif'
      ctx.fillText(badge.value.trim() || '80', cx, cy + 8)
      break
    }

    case 'height_limit': {
      drawCircleBase('#d92b2b', '#ffffff')
      // 上下黑色限高三角
      ctx.fillStyle = '#15181c'
      ctx.beginPath()
      ctx.moveTo(cx, 128)
      ctx.lineTo(cx - 38, 72)
      ctx.lineTo(cx + 38, 72)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx, 384)
      ctx.lineTo(cx - 38, 440)
      ctx.lineTo(cx + 38, 440)
      ctx.closePath()
      ctx.fill()
      ctx.font = '800 128px "DIN Alternate", "Arial", sans-serif'
      ctx.fillText(badge.value.trim() || '4.5m', cx, cy + 4)
      break
    }

    case 'no_lane_change': {
      drawCircleBase('#d92b2b', '#ffffff')
      // 左侧小车轮廓 + 虚线 + 禁行斜杠
      ctx.strokeStyle = '#15181c'
      ctx.lineWidth = 14
      ctx.setLineDash([22, 16])
      ctx.beginPath()
      ctx.moveTo(cx, 108)
      ctx.lineTo(cx, 404)
      ctx.stroke()
      ctx.setLineDash([])

      // 简化双车示意
      ctx.fillStyle = '#15181c'
      ctx.fillRect(118, 210, 86, 118)
      ctx.fillStyle = '#d92b2b'
      ctx.fillRect(306, 184, 86, 118)

      // 红色禁止斜线
      ctx.strokeStyle = '#d92b2b'
      ctx.lineWidth = 30
      ctx.beginPath()
      ctx.moveTo(106, 106)
      ctx.lineTo(406, 406)
      ctx.stroke()
      break
    }

    case 'turn_on_lights': {
      drawCircleBase('#ffffff', '#0b66c3')
      // 车灯轮廓 + 光束
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(215, cy, 74, -Math.PI / 2, Math.PI / 2, true)
      ctx.lineTo(250, cy + 74)
      ctx.lineTo(250, cy - 74)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 18
      for (const offset of [-52, 0, 52]) {
        ctx.beginPath()
        ctx.moveTo(278, cy + offset)
        ctx.lineTo(388, cy + offset + 18)
        ctx.stroke()
      }
      break
    }

    case 'no_horn': {
      drawCircleBase('#d92b2b', '#ffffff')
      ctx.fillStyle = '#15181c'
      ctx.beginPath()
      ctx.moveTo(132, 240)
      ctx.lineTo(260, 240)
      ctx.lineTo(366, 178)
      ctx.lineTo(366, 334)
      ctx.lineTo(260, 272)
      ctx.lineTo(132, 272)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#d92b2b'
      ctx.lineWidth = 30
      ctx.beginPath()
      ctx.moveTo(106, 106)
      ctx.lineTo(406, 406)
      ctx.stroke()
      break
    }

    case 'custom_image': {
      drawCircleBase('#0b66c3', '#f4f8fc')
      ctx.fillStyle = '#0b66c3'
      ctx.font = '700 66px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText('请上传图片', cx, cy)
      break
    }

    case 'custom_text':
    default: {
      drawCircleBase('#0b66c3', '#ffffff')
      ctx.fillStyle = '#0b66c3'
      ctx.font = '700 84px "PingFang SC", "Microsoft YaHei", sans-serif'
      ctx.fillText((badge.value || badge.label || '标志').slice(0, 6), cx, cy)
      break
    }
  }

  return canvas.toDataURL('image/png')
}

/**
 * 绘制停车带蓝底白字 "P" 指示牌贴图
 */
export function renderParkingSignCanvas(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#0d63c4'
  ctx.fillRect(0, 0, 256, 256)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 14
  ctx.strokeRect(12, 12, 232, 232)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '800 165px "Arial", sans-serif'
  ctx.fillText('P', 128, 134)

  return canvas.toDataURL('image/png')
}
