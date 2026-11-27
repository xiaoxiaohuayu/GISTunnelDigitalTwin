<script setup lang="ts">
import { computed } from 'vue'
import type {
  PortalTrafficSignFacility,
  TrafficSignBadge,
  TunnelBoreConfig,
  TunnelFacilityItem,
} from '../../schema/tunnelSchema'
import { FACILITY_REGISTRY } from '../../registry/facilityRegistry'

const props = defineProps<{
  facility: TunnelFacilityItem
  bores: TunnelBoreConfig[]
  tunnelLength: number
}>()

const emit = defineEmits<{
  update: [patch: Partial<TunnelFacilityItem>]
  focus: []
  duplicate: []
  remove: []
}>()

const descriptor = computed(() => FACILITY_REGISTRY[props.facility.type])

const trafficSignPresetOptions: Array<{ value: TrafficSignBadge['preset']; label: string }> = [
  { value: 'speed_limit', label: '限速标志' },
  { value: 'no_lane_change', label: '禁止变道' },
  { value: 'height_limit', label: '限高标志' },
  { value: 'turn_on_lights', label: '开启车灯' },
  { value: 'no_horn', label: '禁止鸣笛' },
  { value: 'custom_text', label: '自定义文字' },
  { value: 'custom_image', label: '自定义图片' },
]

function asNum(value: unknown, cb: (num: number) => void): void {
  if (value !== null && value !== undefined && Number.isFinite(Number(value))) {
    cb(Number(value))
  }
}

function updateTrafficBadge(index: number, patch: Partial<TrafficSignBadge>): void {
  if (props.facility.type !== 'portal_traffic_sign') return
  const nextSigns = props.facility.signs.map((item, idx) =>
    idx === index ? { ...item, ...patch } : item,
  )
  emit('update', { signs: nextSigns } as Partial<PortalTrafficSignFacility>)
}

/** 将上传的图片等比居中绘制到 512x512 正方形画布，避免圆盘拉伸并控制存储体积 */
function handleTrafficBadgeImageUpload(index: number, event: Event): void {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = () => {
    const rawUrl = typeof reader.result === 'string' ? reader.result : ''
    if (!rawUrl) return
    const img = new Image()
    img.onload = () => {
      const size = 512
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        updateTrafficBadge(index, { preset: 'custom_image', imageDataUrl: rawUrl, label: file.name })
        return
      }
      ctx.clearRect(0, 0, size, size)
      const scale = Math.min(size / img.width, size / img.height)
      const drawW = img.width * scale
      const drawH = img.height * scale
      ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH)
      updateTrafficBadge(index, {
        preset: 'custom_image',
        imageDataUrl: canvas.toDataURL('image/png'),
        label: file.name.replace(/\.[^.]+$/, ''),
      })
    }
    img.onerror = () => {
      updateTrafficBadge(index, { preset: 'custom_image', imageDataUrl: rawUrl, label: file.name })
    }
    img.src = rawUrl
  }
  reader.readAsDataURL(file)
  if (input) input.value = ''
}

function addTrafficBadge(): void {
  if (props.facility.type !== 'portal_traffic_sign') return
  const nextSigns: TrafficSignBadge[] = [
    ...props.facility.signs,
    {
      id: `badge-${Date.now().toString(36)}`,
      preset: 'speed_limit',
      value: '60',
      label: '限速 60',
    },
  ]
  emit('update', { signs: nextSigns } as Partial<PortalTrafficSignFacility>)
}

function removeTrafficBadge(index: number): void {
  if (props.facility.type !== 'portal_traffic_sign' || props.facility.signs.length <= 1) return
  const nextSigns = props.facility.signs.filter((_, idx) => idx !== index)
  emit('update', { signs: nextSigns } as Partial<PortalTrafficSignFacility>)
}
</script>

<template>
  <div class="space-y-4">
    <!-- 公共属性 -->
    <section class="twin-card p-3 space-y-2.5">
      <div class="flex items-center justify-between gap-2">
        <div>
          <h3 class="twin-section-title">{{ descriptor?.label }}</h3>
          <p class="m-0 mt-0.5 text-[11px] text-twin-sub">{{ descriptor?.description }}</p>
        </div>
        <el-switch
          size="small"
          :model-value="facility.visible"
          @update:model-value="(value: unknown) => emit('update', { visible: Boolean(value) })"
        />
      </div>

      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">设施名称</label>
        <el-input
          size="small"
          :model-value="facility.name"
          @update:model-value="(value: unknown) => emit('update', { name: String(value ?? '') })"
        />
      </div>

      <div class="grid grid-cols-2 gap-2 pt-1">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">Y 横向偏移 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :step="0.5"
            :precision="1"
            :model-value="facility.lateralOffset ?? 0"
            @update:model-value="(v: unknown) => asNum(v, lateralOffset => emit('update', { lateralOffset }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">Z 高度偏移 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :step="0.5"
            :precision="1"
            :model-value="facility.heightOffset ?? 0"
            @update:model-value="(v: unknown) => asNum(v, heightOffset => emit('update', { heightOffset }))"
          />
        </div>
      </div>

      <div class="flex items-center gap-1.5 pt-1">
        <el-button size="small" type="primary" plain class="flex-1" @click="emit('focus')">定位观察</el-button>
        <el-button size="small" class="flex-1" @click="emit('duplicate')">复制设施</el-button>
        <el-button size="small" type="danger" plain @click="emit('remove')">删除</el-button>
      </div>
    </section>

    <!-- 1. 防雨棚 -->
    <section v-if="facility.type === 'rain_canopy'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">防雨棚参数</h3>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">所属洞筒</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.boreId"
            @update:model-value="(value: unknown) => emit('update', { boreId: String(value) })"
          >
            <el-option v-for="b in bores" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">所在洞口</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.portalEnd"
            @update:model-value="(value: unknown) => emit('update', { portalEnd: value as 'start' | 'end' })"
          >
            <el-option label="起点洞口" value="start" />
            <el-option label="终点洞口" value="end" />
          </el-select>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">外延起点 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="-60"
            :max="200"
            :step="2"
            :model-value="facility.offsetFromPortal"
            @update:model-value="(v: unknown) => asNum(v, offsetFromPortal => emit('update', { offsetFromPortal }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">棚体长度 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="4"
            :max="120"
            :controls="false"
            :model-value="facility.length"
            @update:model-value="(v: unknown) => asNum(v, length => emit('update', { length }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">拱肋间距 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2"
            :max="20"
            :controls="false"
            :model-value="facility.ribSpacing"
            @update:model-value="(v: unknown) => asNum(v, ribSpacing => emit('update', { ribSpacing }))"
          />
        </div>
      </div>

      <div class="space-y-1">
        <div class="flex justify-between text-[12px] text-twin-muted">
          <span>顶棚透明度</span>
          <span class="tabular">{{ Math.round(facility.roofOpacity * 100) }}%</span>
        </div>
        <el-slider
          size="small"
          :min="0.2"
          :max="0.95"
          :step="0.05"
          :model-value="facility.roofOpacity"
          @update:model-value="(v: unknown) => asNum(v, roofOpacity => emit('update', { roofOpacity }))"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="flex items-center justify-between px-2 py-1 rounded bg-white/4">
          <span class="text-[12px] text-twin-muted">顶棚色</span>
          <el-color-picker
            size="small"
            :model-value="facility.roofColor"
            @update:model-value="(v: unknown) => v && emit('update', { roofColor: String(v) })"
          />
        </div>
        <div class="flex items-center justify-between px-2 py-1 rounded bg-white/4">
          <span class="text-[12px] text-twin-muted">钢架色</span>
          <el-color-picker
            size="small"
            :model-value="facility.frameColor"
            @update:model-value="(v: unknown) => v && emit('update', { frameColor: String(v) })"
          />
        </div>
      </div>
    </section>

    <!-- 2. 人行横洞 -->
    <section v-else-if="facility.type === 'pedestrian_passage'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">人行横洞参数</h3>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">沿隧道位置 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="10"
            :max="Math.max(20, Math.round(tunnelLength - 10))"
            :step="5"
            :controls="false"
            :model-value="facility.station"
            @update:model-value="(v: unknown) => asNum(v, station => emit('update', { station }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">通道长度 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2"
            :max="80"
            :step="0.5"
            :precision="1"
            :model-value="facility.length ?? 13"
            @update:model-value="(v: unknown) => asNum(v, length => emit('update', { length }))"
          />
        </div>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">净宽 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="1.2"
            :max="5"
            :step="0.2"
            :precision="1"
            :model-value="facility.width"
            @update:model-value="(v: unknown) => asNum(v, width => emit('update', { width }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">净高 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2.0"
            :max="4.5"
            :step="0.2"
            :precision="1"
            :model-value="facility.height"
            @update:model-value="(v: unknown) => asNum(v, height => emit('update', { height }))"
          />
        </div>
      </div>
    </section>

    <!-- 3. 车行横洞 -->
    <section v-else-if="facility.type === 'vehicle_passage'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">车行横洞参数</h3>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">沿隧道位置 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="20"
            :max="Math.max(30, Math.round(tunnelLength - 20))"
            :step="5"
            :controls="false"
            :model-value="facility.station"
            @update:model-value="(v: unknown) => asNum(v, station => emit('update', { station }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">通道长度 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2"
            :max="80"
            :step="0.5"
            :precision="1"
            :model-value="facility.length ?? 13"
            @update:model-value="(v: unknown) => asNum(v, length => emit('update', { length }))"
          />
        </div>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">净宽 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="3"
            :max="8"
            :step="0.5"
            :controls="false"
            :model-value="facility.width"
            @update:model-value="(v: unknown) => asNum(v, width => emit('update', { width }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">净高 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="3.5"
            :max="7"
            :step="0.5"
            :controls="false"
            :model-value="facility.height"
            @update:model-value="(v: unknown) => asNum(v, height => emit('update', { height }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">交角 (°)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="45"
            :max="90"
            :step="5"
            :controls="false"
            :model-value="facility.skewAngle"
            @update:model-value="(v: unknown) => asNum(v, skewAngle => emit('update', { skewAngle }))"
          />
        </div>
      </div>
    </section>

    <!-- 4. 联络通道 -->
    <section v-else-if="facility.type === 'connecting_passage'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">联络通道参数</h3>
      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">布设位置类型</label>
        <el-radio-group
          size="small"
          :model-value="facility.placement"
          @update:model-value="(v: unknown) => emit('update', { placement: v as 'portal_outside' | 'interior' })"
        >
          <el-radio-button value="portal_outside">洞口外联络通道</el-radio-button>
          <el-radio-button value="interior">洞内联络通道</el-radio-button>
        </el-radio-group>
      </div>

      <div v-if="facility.placement === 'portal_outside'" class="space-y-1">
        <label class="text-[12px] text-twin-muted block">所在洞口端</label>
        <el-select
          size="small"
          class="w-full"
          :model-value="facility.portalEnd"
          @update:model-value="(v: unknown) => emit('update', { portalEnd: v as 'start' | 'end' })"
        >
          <el-option label="起点洞口外" value="start" />
          <el-option label="终点洞口外" value="end" />
        </el-select>
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">
            {{ facility.placement === 'portal_outside' ? '距洞口 (m)' : '轴线位置 (m)' }}
          </label>
          <el-input-number
            size="small"
            class="w-full"
            :min="5"
            :max="facility.placement === 'portal_outside' ? 180 : Math.round(tunnelLength)"
            :controls="false"
            :model-value="facility.station"
            @update:model-value="(v: unknown) => asNum(v, station => emit('update', { station }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">开口长 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="4"
            :max="80"
            :controls="false"
            :model-value="facility.length"
            @update:model-value="(v: unknown) => asNum(v, length => emit('update', { length }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">通道宽 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2"
            :max="40"
            :controls="false"
            :model-value="facility.width"
            @update:model-value="(v: unknown) => asNum(v, width => emit('update', { width }))"
          />
        </div>
      </div>

      <div class="flex items-center justify-between pt-1">
        <span class="text-[12px] text-twin-muted">显示导流标线</span>
        <el-switch
          size="small"
          :model-value="facility.showMarkings"
          @update:model-value="(v: unknown) => emit('update', { showMarkings: Boolean(v) })"
        />
      </div>
    </section>

    <!-- 5. 停车带 -->
    <section v-else-if="facility.type === 'parking_bay'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">紧急停车带参数</h3>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">所属洞筒</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.boreId"
            @update:model-value="(v: unknown) => emit('update', { boreId: String(v) })"
          >
            <el-option v-for="b in bores" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">布设侧</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.side"
            @update:model-value="(v: unknown) => emit('update', { side: v as 'right' | 'left' })"
          >
            <el-option label="行车右侧（标准）" value="right" />
            <el-option label="行车左侧" value="left" />
          </el-select>
        </div>
      </div>

      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">中心位置 (m)</label>
        <el-input-number
          size="small"
          class="w-full"
          :min="30"
          :max="Math.max(40, Math.round(tunnelLength - 30))"
          :step="10"
          :model-value="facility.station"
          @update:model-value="(v: unknown) => asNum(v, station => emit('update', { station }))"
        />
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">有效长 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="15"
            :max="80"
            :controls="false"
            :model-value="facility.length"
            @update:model-value="(v: unknown) => asNum(v, length => emit('update', { length }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">渐变段 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="5"
            :max="30"
            :controls="false"
            :model-value="facility.taperLength"
            @update:model-value="(v: unknown) => asNum(v, taperLength => emit('update', { taperLength }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[11px] text-twin-muted block">加宽 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="2"
            :max="6"
            :step="0.25"
            :controls="false"
            :model-value="facility.extraWidth"
            @update:model-value="(v: unknown) => asNum(v, extraWidth => emit('update', { extraWidth }))"
          />
        </div>
      </div>

      <div class="flex items-center justify-between pt-1">
        <span class="text-[12px] text-twin-muted">显示停车带标线与 P 标志</span>
        <el-switch
          size="small"
          :model-value="facility.showSignage"
          @update:model-value="(v: unknown) => emit('update', { showSignage: Boolean(v) })"
        />
      </div>
    </section>

    <!-- 6. 入口标牌 -->
    <section v-else-if="facility.type === 'portal_sign'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">入口标牌参数</h3>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">所属洞筒</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.boreId"
            @update:model-value="(v: unknown) => emit('update', { boreId: String(v) })"
          >
            <el-option v-for="b in bores" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">洞口端</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.portalEnd"
            @update:model-value="(v: unknown) => emit('update', { portalEnd: v as 'start' | 'end' })"
          >
            <el-option label="起点洞口" value="start" />
            <el-option label="终点洞口" value="end" />
          </el-select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">距洞口距离 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="5"
            :max="200"
            :model-value="facility.offsetFromPortal"
            @update:model-value="(v: unknown) => asNum(v, offsetFromPortal => emit('update', { offsetFromPortal }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">安装形式</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.mountType"
            @update:model-value="(v: unknown) => emit('update', { mountType: v as 'cantilever' | 'gantry' })"
          >
            <el-option label="单悬臂式" value="cantilever" />
            <el-option label="双柱门架式" value="gantry" />
          </el-select>
        </div>
      </div>

      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">标牌标题（留空跟随隧道名称）</label>
        <el-input
          size="small"
          :model-value="facility.title"
          placeholder="留空自动使用隧道名称"
          @update:model-value="(v: unknown) => emit('update', { title: String(v ?? '') })"
        />
      </div>
      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">英文副标题</label>
        <el-input
          size="small"
          :model-value="facility.subtitle"
          @update:model-value="(v: unknown) => emit('update', { subtitle: String(v ?? '') })"
        />
      </div>
      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">标注长度（留空自动计算）</label>
        <el-input
          size="small"
          :model-value="facility.lengthText"
          :placeholder="`${Math.round(tunnelLength)} m`"
          @update:model-value="(v: unknown) => emit('update', { lengthText: String(v ?? '') })"
        />
      </div>
      <div class="space-y-1">
        <label class="text-[12px] text-twin-muted block">底部安全提示语</label>
        <el-input
          size="small"
          :model-value="facility.notice"
          @update:model-value="(v: unknown) => emit('update', { notice: String(v ?? '') })"
        />
      </div>
      <div class="flex items-center justify-between px-2 py-1 rounded bg-white/4">
        <span class="text-[12px] text-twin-muted">牌面主背景色</span>
        <el-color-picker
          size="small"
          :model-value="facility.backgroundColor"
          @update:model-value="(v: unknown) => v && emit('update', { backgroundColor: String(v) })"
        />
      </div>
    </section>

    <!-- 7. 洞口交通标志 -->
    <section v-else-if="facility.type === 'portal_traffic_sign'" class="twin-card p-3 space-y-2.5">
      <h3 class="twin-section-title">洞口交通标志参数</h3>
      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">所属洞筒</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.boreId"
            @update:model-value="(v: unknown) => emit('update', { boreId: String(v) })"
          >
            <el-option v-for="b in bores" :key="b.id" :label="b.name" :value="b.id" />
          </el-select>
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">洞口端</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.portalEnd"
            @update:model-value="(v: unknown) => emit('update', { portalEnd: v as 'start' | 'end' })"
          >
            <el-option label="起点洞口" value="start" />
            <el-option label="终点洞口" value="end" />
          </el-select>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">距洞口距离 (m)</label>
          <el-input-number
            size="small"
            class="w-full"
            :min="5"
            :max="200"
            :model-value="facility.offsetFromPortal"
            @update:model-value="(v: unknown) => asNum(v, offsetFromPortal => emit('update', { offsetFromPortal }))"
          />
        </div>
        <div class="space-y-1">
          <label class="text-[12px] text-twin-muted block">架体形式</label>
          <el-select
            size="small"
            class="w-full"
            :model-value="facility.mountType"
            @update:model-value="(v: unknown) => emit('update', { mountType: v as 'cantilever' | 'gantry' })"
          >
            <el-option label="门架式" value="gantry" />
            <el-option label="悬臂式" value="cantilever" />
          </el-select>
        </div>
      </div>

      <div class="pt-1 space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-[12px] font-600 text-twin-accent">标志牌组（{{ facility.signs.length }} 块）</span>
          <el-button size="small" type="primary" plain @click="addTrafficBadge">+ 添加标志牌</el-button>
        </div>

        <div
          v-for="(badge, idx) in facility.signs"
          :key="badge.id"
          class="p-2 rounded-[8px] bg-white/5 border border-solid border-white/10 space-y-1.5"
        >
          <div class="flex items-center justify-between gap-2">
            <el-select
              size="small"
              class="flex-1"
              :model-value="badge.preset"
              @update:model-value="(v: unknown) => updateTrafficBadge(idx, { preset: v as TrafficSignBadge['preset'] })"
            >
              <el-option
                v-for="opt in trafficSignPresetOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-button
              size="small"
              type="danger"
              plain
              :disabled="facility.signs.length <= 1"
              @click="removeTrafficBadge(idx)"
            >
              删
            </el-button>
          </div>
          <div
            v-if="badge.preset === 'speed_limit' || badge.preset === 'height_limit' || badge.preset === 'custom_text'"
            class="flex items-center gap-2"
          >
            <span class="text-[11px] text-twin-muted shrink-0">显示数值</span>
            <el-input
              size="small"
              :model-value="badge.value"
              placeholder="如 80 或 4.5m"
              @update:model-value="(v: unknown) => updateTrafficBadge(idx, { value: String(v ?? ''), label: String(v ?? '') })"
            />
          </div>
          <div v-else-if="badge.preset === 'custom_image'" class="flex items-center gap-2 pt-0.5">
            <img
              v-if="badge.imageDataUrl"
              :src="badge.imageDataUrl"
              alt="标志预览"
              class="w-10 h-10 rounded-full object-contain bg-white/90 border border-solid border-white/20 shrink-0"
            />
            <div
              v-else
              class="w-10 h-10 rounded-full bg-white/8 border border-dashed border-white/25 flex items-center justify-center text-[10px] text-twin-sub shrink-0"
            >
              无图
            </div>
            <label
              class="flex-1 text-center text-[11px] py-1 px-2 rounded bg-twin-accent/15 hover:bg-twin-accent/25 text-twin-accent border border-solid border-twin-accent/35 cursor-pointer transition-colors"
            >
              {{ badge.imageDataUrl ? '更换标志图片' : '上传标志图片' }}
              <input
                type="file"
                accept="image/*"
                class="hidden"
                @change="(e: Event) => handleTrafficBadgeImageUpload(idx, e)"
              />
            </label>
            <el-button
              v-if="badge.imageDataUrl"
              size="small"
              plain
              @click="updateTrafficBadge(idx, { imageDataUrl: undefined })"
            >
              清除
            </el-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
