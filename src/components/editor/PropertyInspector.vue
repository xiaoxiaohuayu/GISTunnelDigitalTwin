<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { mountBase, resolveAsset } from '../../engines/assetPlacement'
import type { Mount } from '../../engines/assetPlacement'
import { DEFAULT_SCENE_VISUALS, formatChainage, parseChainage } from '../../engines/projectConfig'
import type { AssetRecord, CameraBookmark, SceneVisualSettings, TelemetryBinding, TunnelProject } from '../../engines/projectConfig'
import { deviceCatalog } from '../../engines/tunnelSystemsState'
import type { SystemsState } from '../../engines/tunnelSystemsState'
import { evaluateTelemetryBinding } from '../../editor'
import type { CommandHistoryEntry } from '../../editor'
import type { TelemetrySnapshot } from '../../services'

const props = defineProps<{
  project: TunnelProject
  selectedIds: string[]
  busy: boolean
  error: string | null
  history: CommandHistoryEntry[]
  telemetrySnapshot: TelemetrySnapshot
  environment: SystemsState['environment']
  underground: boolean
  wallsVisible: boolean
  canopyVisible: boolean
  detectionVisible: boolean
  cameraGuardEnabled: boolean
}>()

const emit = defineEmits<{
  previewTransform: [id: string, patch: Partial<AssetRecord>]
  commitTransform: [id: string, patch: Partial<AssetRecord>, mergeKey?: string]
  updateProjectName: [name: string]
  previewVisuals: [visuals: SceneVisualSettings]
  commitVisuals: [visuals: SceneVisualSettings]
  captureBookmark: [name: string]
  flyBookmark: [bookmark: CameraBookmark]
  deleteBookmark: [id: string]
  focus: [id: string]
  startGizmo: [id: string]
  duplicate: [ids: string[]]
  delete: [ids: string[]]
  clearSelection: []
  openFullConfig: []
  setEnvironment: [env: SystemsState['environment']]
  toggleUnderground: [enabled: boolean]
  toggleWalls: [enabled: boolean]
  toggleCanopy: [enabled: boolean]
  toggleDetection: [enabled: boolean]
  toggleCameraGuard: [enabled: boolean]
}>()

const selectedAssets = computed(() => {
  const idSet = new Set(props.selectedIds)
  return props.project.assets.filter(asset => idSet.has(asset.id))
})

const single = computed(() => (selectedAssets.value.length === 1 ? selectedAssets.value[0]! : null))
const resolvedSingle = computed(() => (single.value ? resolveAsset(single.value, props.project) : null))
const constrained = computed(() => !!single.value && ['pedestrian', 'vehicle', 'layby'].includes(single.value.kind))

const kindNameMap = new Map<string, string>(deviceCatalog.map(([, kind, name]) => [kind, name]))
const kindName = (kind: string) => kindNameMap.get(kind) ?? kind
const boreName = (boreId: string) => props.project.bores.find(b => b.id === boreId)?.name ?? ''

const chainageInput = ref('')
const chainageError = ref('')
const nameDraft = ref('')
const codeDraft = ref('')
const projectNameDraft = ref(props.project.name)
const headingDraft = ref(0)

// Telemetry binding drafts
const telemetryPointId = ref('')
const telemetryMetric = ref('')
const telemetryUnit = ref('')
const telemetryWarn = ref<number | undefined>(undefined)
const telemetryAlarm = ref<number | undefined>(undefined)
const telemetryError = ref('')

// Scene visuals & bookmark drafts
const visualsDraft = ref<SceneVisualSettings>({ ...DEFAULT_SCENE_VISUALS, ...(props.project.visuals ?? {}) })
const bookmarkName = ref('')

watch(
  single,
  asset => {
    chainageError.value = ''
    telemetryError.value = ''
    if (!asset) return
    chainageInput.value = formatChainage(asset.chainage)
    nameDraft.value = asset.name
    codeDraft.value = asset.code
    headingDraft.value = Number(asset.heading.toFixed(1))
    telemetryPointId.value = asset.telemetry?.pointId ?? ''
    telemetryMetric.value = asset.telemetry?.metric ?? ''
    telemetryUnit.value = asset.telemetry?.unit ?? ''
    telemetryWarn.value = asset.telemetry?.warningThreshold
    telemetryAlarm.value = asset.telemetry?.alarmThreshold
  },
  { immediate: true },
)

watch(
  () => props.project.name,
  value => { projectNameDraft.value = value },
)

watch(
  () => props.project.visuals,
  value => { visualsDraft.value = { ...DEFAULT_SCENE_VISUALS, ...(value ?? {}) } },
  { deep: true },
)

const evaluatedTelemetry = computed(() => {
  if (!single.value?.telemetry) return null
  return evaluateTelemetryBinding(single.value.telemetry, props.telemetrySnapshot)
})

function commitChainage(): void {
  if (!single.value) return
  try {
    const parsed = parseChainage(chainageInput.value)
    chainageError.value = ''
    if (parsed !== single.value.chainage) {
      emit('commitTransform', single.value.id, { chainage: parsed }, `chainage:${single.value.id}`)
    }
  } catch (e) {
    chainageError.value = e instanceof Error ? e.message : String(e)
  }
}

function commitNumber(key: 'lateral' | 'height' | 'heading' | 'scale', value: number | null | undefined): void {
  if (!single.value || value == null || Number.isNaN(value)) return
  emit('commitTransform', single.value.id, { [key]: value }, `${key}:${single.value.id}`)
}

function previewHeading(value: number | number[]): void {
  if (!single.value || Array.isArray(value)) return
  headingDraft.value = value
  emit('previewTransform', single.value.id, { heading: value })
}

function commitHeading(value: number | number[]): void {
  if (!single.value || Array.isArray(value)) return
  emit('commitTransform', single.value.id, { heading: value }, `heading:${single.value.id}`)
}

function commitText(key: 'code' | 'name', value: string): void {
  if (!single.value) return
  const trimmed = value.trim()
  if (!trimmed || trimmed === single.value[key]) return
  emit('commitTransform', single.value.id, { [key]: trimmed })
}

function commitBore(boreId: string): void {
  if (!single.value || boreId === single.value.boreId) return
  emit('commitTransform', single.value.id, { boreId })
}

function commitMount(kind: Mount['kind']): void {
  if (!single.value) return
  const bore = props.project.bores.find(item => item.id === single.value!.boreId)
  if (!bore) return
  const resolved = resolveAsset(single.value, props.project)
  const nextMount: Mount = {
    kind,
    side: resolved.lateral < 0 ? -1 : 1,
    laneId: bore.lanes[0]?.id,
    offset: 0,
  }
  nextMount.offset = resolved.lateral - mountBase(nextMount, bore)
  emit('commitTransform', single.value.id, { mount: nextMount })
}

function saveTelemetryBinding(): void {
  if (!single.value) return
  const pointId = telemetryPointId.value.trim()
  if (!pointId) {
    telemetryError.value = '请填写绑定的遥测点位 ID'
    return
  }
  if (
    telemetryWarn.value !== undefined &&
    telemetryAlarm.value !== undefined &&
    telemetryAlarm.value < telemetryWarn.value
  ) {
    telemetryError.value = '告警阈值不能小于预警阈值'
    return
  }
  telemetryError.value = ''
  const telemetry: TelemetryBinding = {
    pointId,
    ...(telemetryMetric.value.trim() ? { metric: telemetryMetric.value.trim() } : {}),
    ...(telemetryUnit.value.trim() ? { unit: telemetryUnit.value.trim() } : {}),
    ...(telemetryWarn.value !== undefined ? { warningThreshold: telemetryWarn.value } : {}),
    ...(telemetryAlarm.value !== undefined ? { alarmThreshold: telemetryAlarm.value } : {}),
  }
  emit('commitTransform', single.value.id, { telemetry })
}

function clearTelemetryBinding(): void {
  if (!single.value) return
  telemetryPointId.value = ''
  telemetryMetric.value = ''
  telemetryUnit.value = ''
  telemetryWarn.value = undefined
  telemetryAlarm.value = undefined
  telemetryError.value = ''
  emit('commitTransform', single.value.id, { telemetry: undefined })
}

function commitProjectName(): void {
  const trimmed = projectNameDraft.value.trim()
  if (!trimmed || trimmed === props.project.name) {
    projectNameDraft.value = props.project.name
    return
  }
  emit('updateProjectName', trimmed)
}

function handleVisualInput(): void {
  emit('previewVisuals', { ...visualsDraft.value })
}

function handleVisualCommit(): void {
  emit('commitVisuals', { ...visualsDraft.value })
}

function handleCaptureBookmark(): void {
  const label = bookmarkName.value.trim() || `视角 ${(props.project.bookmarks?.length ?? 0) + 1}`
  emit('captureBookmark', label)
  bookmarkName.value = ''
}

const recentHistory = computed(() => props.history.slice(-8).reverse())
const bookmarks = computed(() => props.project.bookmarks ?? [])
</script>

<template>
  <aside class="editor-dock editor-dock--right" aria-label="属性检查器">
    <template v-if="single && resolvedSingle">
      <header class="inspector-head">
        <div>
          <h2>{{ single.code }}</h2>
          <p>{{ kindName(single.kind) }} · {{ boreName(single.boreId) }} · {{ formatChainage(single.chainage) }}</p>
        </div>
        <el-button size="small" text @click="emit('clearSelection')">取消选中</el-button>
      </header>

      <div class="inspector-quick-actions">
        <el-button size="small" @click="emit('focus', single.id)">聚焦视角</el-button>
        <el-button size="small" type="primary" plain @click="emit('startGizmo', single.id)">3D 拖拽</el-button>
        <el-button size="small" :disabled="busy" @click="emit('duplicate', [single.id])">复制</el-button>
        <el-button size="small" type="danger" plain :disabled="busy" @click="emit('delete', [single.id])">删除</el-button>
      </div>

      <div class="dock-scroll">
        <section class="inspector-section">
          <h3>空间变换</h3>
          <label class="field">
            <span>桩号</span>
            <el-input v-model="chainageInput" size="small" :disabled="busy" @change="commitChainage" />
          </label>
          <p v-if="chainageError" class="field-error" role="alert">{{ chainageError }}</p>

          <label class="field">
            <span>所属洞筒</span>
            <el-select :model-value="single.boreId" size="small" :disabled="busy || constrained" @change="commitBore">
              <el-option v-for="bore in project.bores" :key="bore.id" :value="bore.id" :label="bore.name" />
            </el-select>
          </label>

          <label class="field">
            <span>横向偏移（m）</span>
            <el-input-number
              :model-value="Number(resolvedSingle.lateral.toFixed(3))"
              size="small"
              :step="0.1"
              :disabled="busy || constrained"
              controls-position="right"
              @change="commitNumber('lateral', $event)"
            />
          </label>

          <label class="field">
            <span>安装高度（m）</span>
            <el-input-number
              :model-value="Number(single.height.toFixed(3))"
              size="small"
              :step="0.1"
              :disabled="busy || constrained"
              controls-position="right"
              @change="commitNumber('height', $event)"
            />
          </label>

          <label class="field field--stack">
            <span class="field-label-row">
              <span>相对线路朝向（°）</span>
              <strong>{{ headingDraft.toFixed(0) }}°</strong>
            </span>
            <el-slider
              v-model="headingDraft"
              :min="-180"
              :max="360"
              :step="1"
              :disabled="busy || constrained"
              @input="previewHeading"
              @change="commitHeading"
            />
          </label>

          <label class="field">
            <span>缩放比例</span>
            <el-input-number
              :model-value="Number((single.scale ?? 1).toFixed(2))"
              size="small"
              :min="0.25"
              :max="4"
              :step="0.05"
              :disabled="busy || constrained"
              controls-position="right"
              @change="commitNumber('scale', $event)"
            />
          </label>

          <label class="field">
            <span>安装参照</span>
            <el-select
              :model-value="single.mount?.kind ?? 'unresolved'"
              size="small"
              :disabled="busy || constrained"
              @change="commitMount"
            >
              <el-option value="unresolved" label="待确认" />
              <el-option value="lane" label="所属车道" />
              <el-option value="wall" label="墙面" />
              <el-option value="edge" label="路缘" />
              <el-option value="ceiling" label="拱顶" />
              <el-option value="site" label="场地固定位置" />
            </el-select>
          </label>
        </section>

        <section class="inspector-section">
          <h3>基础标识</h3>
          <label class="field">
            <span>设备编号</span>
            <el-input v-model="codeDraft" size="small" :disabled="busy" @change="commitText('code', codeDraft)" />
          </label>
          <label class="field">
            <span>设备名称</span>
            <el-input v-model="nameDraft" size="small" :disabled="busy" @change="commitText('name', nameDraft)" />
          </label>
        </section>

        <section class="inspector-section">
          <h3>遥测点位映射</h3>
          <div v-if="evaluatedTelemetry" class="telemetry-live-card" :class="evaluatedTelemetry.severity">
            <strong>{{ evaluatedTelemetry.metric }}：{{ evaluatedTelemetry.formattedValue }}</strong>
            <span>点位 {{ evaluatedTelemetry.pointId }} · {{ evaluatedTelemetry.note }}</span>
          </div>
          <label class="field">
            <span>点位 ID</span>
            <el-input v-model="telemetryPointId" size="small" :placeholder="single.id" :disabled="busy" />
          </label>
          <label class="field">
            <span>监测指标</span>
            <el-input v-model="telemetryMetric" size="small" placeholder="如 CO 浓度 / 温度" :disabled="busy" />
          </label>
          <label class="field">
            <span>单位</span>
            <el-input v-model="telemetryUnit" size="small" placeholder="如 ppm / °C / m/s" :disabled="busy" />
          </label>
          <label class="field">
            <span>预警阈值</span>
            <el-input-number v-model="telemetryWarn" size="small" :step="1" controls-position="right" :disabled="busy" />
          </label>
          <label class="field">
            <span>告警阈值</span>
            <el-input-number v-model="telemetryAlarm" size="small" :step="1" controls-position="right" :disabled="busy" />
          </label>
          <p v-if="telemetryError" class="field-error" role="alert">{{ telemetryError }}</p>
          <div class="inline-actions">
            <el-button size="small" type="primary" plain :disabled="busy" @click="saveTelemetryBinding">保存映射</el-button>
            <el-button v-if="single.telemetry" size="small" text :disabled="busy" @click="clearTelemetryBinding">清除</el-button>
          </div>
        </section>

        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      </div>
    </template>

    <template v-else-if="selectedAssets.length > 1">
      <header class="inspector-head">
        <div>
          <h2>多选对象 ({{ selectedAssets.length }})</h2>
          <p>支持批量复制与批量删除</p>
        </div>
        <el-button size="small" text @click="emit('clearSelection')">清空</el-button>
      </header>
      <div class="inspector-quick-actions">
        <el-button size="small" :disabled="busy" @click="emit('duplicate', selectedIds)">批量复制</el-button>
        <el-button size="small" type="danger" plain :disabled="busy" @click="emit('delete', selectedIds)">批量删除</el-button>
      </div>
      <div class="dock-scroll">
        <ul class="multi-list">
          <li v-for="asset in selectedAssets" :key="asset.id">
            <strong>{{ asset.code }}</strong>
            <span>{{ asset.name }} · {{ formatChainage(asset.chainage) }}</span>
          </li>
        </ul>
      </div>
    </template>

    <template v-else>
      <header class="inspector-head">
        <div>
          <h2>场景与环境</h2>
          <p>{{ project.bores.length }} 个洞筒 · {{ project.assets.length }} 条设备台账</p>
        </div>
      </header>

      <div class="dock-scroll">
        <section class="inspector-section">
          <h3>隧道项目</h3>
          <label class="field">
            <span>隧道名称</span>
            <el-input v-model="projectNameDraft" size="small" :disabled="busy" @change="commitProjectName" />
          </label>
          <dl class="origin-summary">
            <div><dt>入口坐标</dt><dd>{{ project.origin.longitude.toFixed(5) }}, {{ project.origin.latitude.toFixed(5) }}</dd></div>
            <div><dt>高程 / 方位 / 纵坡</dt><dd>{{ project.origin.elevation }} m · {{ project.origin.heading }}° · {{ project.origin.grade }}%</dd></div>
          </dl>
          <el-button size="small" plain style="width: 100%" @click="emit('openFullConfig')">
            打开洞筒结构与配置包管理
          </el-button>
        </section>

        <section class="inspector-section">
          <h3>光照与雾效</h3>
          <div class="env-row">
            <el-radio-group :model-value="environment" size="small" @change="emit('setEnvironment', $event as SystemsState['environment'])">
              <el-radio-button value="day">白天</el-radio-button>
              <el-radio-button value="night">夜间</el-radio-button>
              <el-radio-button value="fog">雾天</el-radio-button>
            </el-radio-group>
          </div>
          <label class="field field--stack">
            <span class="field-label-row"><span>日照强度</span><strong>{{ visualsDraft.sunIntensity.toFixed(1) }}</strong></span>
            <el-slider v-model="visualsDraft.sunIntensity" :min="0.1" :max="5" :step="0.1" @input="handleVisualInput" @change="handleVisualCommit" />
          </label>
          <label class="field field--stack">
            <span class="field-label-row"><span>日照方位角</span><strong>{{ visualsDraft.sunAzimuth.toFixed(0) }}°</strong></span>
            <el-slider v-model="visualsDraft.sunAzimuth" :min="0" :max="360" :step="5" @input="handleVisualInput" @change="handleVisualCommit" />
          </label>
          <label class="field field--stack">
            <span class="field-label-row"><span>太阳高度角</span><strong>{{ visualsDraft.sunElevation.toFixed(0) }}°</strong></span>
            <el-slider v-model="visualsDraft.sunElevation" :min="5" :max="89" :step="1" @input="handleVisualInput" @change="handleVisualCommit" />
          </label>
          <label class="field field--stack">
            <span class="field-label-row"><span>大气雾浓度</span><strong>{{ (visualsDraft.fogDensity * 1000).toFixed(2) }}‰</strong></span>
            <el-slider v-model="visualsDraft.fogDensity" :min="0" :max="0.004" :step="0.0001" @input="handleVisualInput" @change="handleVisualCommit" />
          </label>
          <label class="switch-row">
            <span>地下透明观察</span>
            <el-switch :model-value="underground" size="small" @change="emit('toggleUnderground', Boolean($event))" />
          </label>
          <label class="switch-row">
            <span>隧道墙体显示</span>
            <el-switch :model-value="wallsVisible" size="small" @change="emit('toggleWalls', Boolean($event))" />
          </label>
          <label class="switch-row">
            <span>入口遮雨棚</span>
            <el-switch :model-value="canopyVisible" size="small" @change="emit('toggleCanopy', Boolean($event))" />
          </label>
          <label class="switch-row">
            <span>摄像机检测范围</span>
            <el-switch :model-value="detectionVisible" size="small" @change="emit('toggleDetection', Boolean($event))" />
          </label>
          <label class="switch-row">
            <span>镜头防穿模保护</span>
            <el-switch :model-value="cameraGuardEnabled" size="small" @change="emit('toggleCameraGuard', Boolean($event))" />
          </label>
        </section>

        <section class="inspector-section">
          <h3>相机视角书签 ({{ bookmarks.length }})</h3>
          <div class="bookmark-add-row">
            <el-input v-model="bookmarkName" size="small" placeholder="输入视角名称" :disabled="busy" />
            <el-button size="small" type="primary" plain :disabled="busy" @click="handleCaptureBookmark">记录视角</el-button>
          </div>
          <ul v-if="bookmarks.length" class="bookmark-list">
            <li v-for="bm in bookmarks" :key="bm.id" class="bookmark-item">
              <div class="bookmark-meta">
                <strong>{{ bm.name }}</strong>
                <span>H {{ bm.height.toFixed(0) }}m · {{ bm.heading.toFixed(0) }}°</span>
              </div>
              <div class="bookmark-actions">
                <el-button size="small" text type="primary" @click="emit('flyBookmark', bm)">跳转</el-button>
                <el-button size="small" text type="danger" :disabled="busy" @click="emit('deleteBookmark', bm.id)">删</el-button>
              </div>
            </li>
          </ul>
          <p v-else class="history-empty">可将常用巡检、洞口或横洞视角存为书签一键飞转。</p>
        </section>

        <section class="inspector-section">
          <h3>操作历史 ({{ history.length }})</h3>
          <ul v-if="recentHistory.length" class="history-list">
            <li v-for="entry in recentHistory" :key="entry.id">{{ entry.label }}</li>
          </ul>
          <p v-else class="history-empty">暂无可撤销记录</p>
        </section>

        <p v-if="error" class="field-error" role="alert">{{ error }}</p>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.editor-dock--right {
  display: flex;
  flex-direction: column;
  width: 304px;
  min-height: 0;
  border-radius: 14px;
  background: var(--twin-glass-bg);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid var(--twin-border);
  box-shadow: var(--twin-shadow);
  overflow: hidden;
  pointer-events: auto;
}

.inspector-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 14px;
  background: var(--twin-glass-header);
  border-bottom: 1px solid rgba(124, 182, 248, 0.16);
}

.inspector-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #eef5ff;
}

.inspector-head p {
  margin: 4px 0 0;
  font-size: 11.5px;
  color: #9ec0e6;
  font-variant-numeric: tabular-nums;
}

.inspector-quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 12px;
  border-bottom: 1px solid rgba(124, 182, 248, 0.14);
}

.dock-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px 14px;
}

.inspector-section {
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(124, 182, 248, 0.14);
}

.inspector-section:last-of-type {
  border-bottom: 0;
  margin-bottom: 0;
}

.inspector-section h3 {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #9ed0ff;
}

.field {
  display: grid;
  grid-template-columns: 92px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 9px;
  font-size: 12px;
  color: #c8dcf4;
}

.field--stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.field-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.field-label-row strong {
  color: #7cc4ff;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.field :deep(.el-input-number) {
  width: 100%;
}

.field-error {
  margin: 4px 0 8px;
  font-size: 11.5px;
  color: #ffb4a9;
  line-height: 1.5;
}

.inline-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.telemetry-live-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(14, 34, 68, 0.72);
  border-left: 3px solid #6cbaff;
  font-size: 11.5px;
}

.telemetry-live-card.warning {
  border-left-color: #f0b15b;
}

.telemetry-live-card.alarm {
  border-left-color: #ff6b6b;
}

.telemetry-live-card strong {
  color: #eef5ff;
}

.telemetry-live-card span {
  color: #9ec0e6;
  font-size: 11px;
}

.origin-summary {
  margin: 8px 0 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.origin-summary > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
}

.origin-summary dt {
  color: #8faed3;
}

.origin-summary dd {
  margin: 0;
  color: #e4f0ff;
  font-variant-numeric: tabular-nums;
}

.env-row {
  margin-bottom: 10px;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 12px;
  color: #cfe1f7;
}

.bookmark-add-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.bookmark-list,
.multi-list,
.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bookmark-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(14, 28, 58, 0.62);
  border: 1px solid rgba(120, 182, 252, 0.22);
}

.bookmark-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bookmark-meta strong {
  font-size: 12px;
  color: #eef5ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-meta span {
  font-size: 10.5px;
  color: #8fb4de;
  font-variant-numeric: tabular-nums;
}

.bookmark-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.multi-list li {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  border-radius: 8px;
  background: rgba(14, 28, 58, 0.56);
  font-size: 11.5px;
}

.multi-list li strong {
  color: #eef5ff;
}

.multi-list li span {
  color: #9ec0e6;
}

.history-list li {
  padding: 5px 8px;
  border-radius: 6px;
  background: rgba(14, 28, 58, 0.5);
  border-left: 2px solid rgba(108, 186, 255, 0.55);
  font-size: 11.5px;
  color: #cfe1f7;
}

.history-empty {
  margin: 0;
  font-size: 11.5px;
  color: #87a3c7;
}
</style>
