<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'
import { formatChainage } from '../../engines/projectConfig'
import type { AssetRecord, TunnelProject } from '../../engines/projectConfig'
import { deviceCatalog } from '../../engines/tunnelSystemsState'
import type { DeviceKind } from '../../engines/tunnelSystemsState'
import type { CustomModelEntry } from '../../engines/customModelLibrary'

const props = defineProps<{
  project: TunnelProject
  selectedIds: string[]
  busy: boolean
  customModels: CustomModelEntry[]
}>()

const emit = defineEmits<{
  select: [id: string, options: { toggle: boolean }]
  focus: [id: string]
  addAsset: [kind: DeviceKind, boreId: string]
  uploadGlb: [file: File]
  addRemoteGlb: [url: string, name: string]
  deleteCustomModel: [id: string]
  placeCustomModel: [model: CustomModelEntry, boreId: string]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const remoteOpen = shallowRef(false)
const remoteUrl = shallowRef('')
const remoteName = shallowRef('')

const tab = shallowRef<'outline' | 'assets'>('outline')
const query = shallowRef('')
const boreFilter = shallowRef('all')
const kindFilter = shallowRef('all')
const catalogQuery = shallowRef('')
const targetBoreId = shallowRef(props.project.bores[0]?.id ?? '')
const collapsedBores = ref<Record<string, boolean>>({})

const kindNameMap = new Map<string, string>(deviceCatalog.map(([, kind, name]) => [kind, name]))
const kindName = (kind: string) => kindNameMap.get(kind) ?? kind
const selectedSet = computed(() => new Set(props.selectedIds))

const presentKinds = computed(() => {
  const present = new Set(props.project.assets.map(asset => asset.kind))
  return deviceCatalog
    .filter(([, kind]) => present.has(kind))
    .map(([, kind, name]) => ({ kind, name }))
})

const filteredAssets = computed(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return props.project.assets.filter(asset => {
    if (boreFilter.value !== 'all' && asset.boreId !== boreFilter.value) return false
    if (kindFilter.value !== 'all' && asset.kind !== kindFilter.value) return false
    if (terms.length === 0) return true
    const haystack = [
      asset.code,
      asset.name,
      kindName(asset.kind),
      formatChainage(asset.chainage),
    ].join(' ').toLowerCase()
    return terms.every(term => haystack.includes(term))
  })
})

const groupedByBore = computed(() => {
  const byBore = new Map<string, AssetRecord[]>()
  for (const bore of props.project.bores) byBore.set(bore.id, [])
  for (const asset of filteredAssets.value) {
    const bucket = byBore.get(asset.boreId)
    if (bucket) bucket.push(asset)
  }
  return props.project.bores.map(bore => {
    const items = (byBore.get(bore.id) ?? []).slice().sort((a, b) => a.chainage - b.chainage)
    return { bore, items }
  })
})

const groupedCatalog = computed(() => {
  const term = catalogQuery.value.trim().toLowerCase()
  const groups = new Map<string, { kind: DeviceKind; name: string }[]>()
  for (const [category, kind, name] of deviceCatalog) {
    if (kind === 'custom') continue
    if (term && !`${category} ${kind} ${name}`.toLowerCase().includes(term)) continue
    const list = groups.get(category) ?? []
    list.push({ kind, name })
    groups.set(category, list)
  }
  return [...groups.entries()].map(([category, items]) => ({ category, items }))
})

const filteredCustomModels = computed(() => {
  const term = catalogQuery.value.trim().toLowerCase()
  if (!term) return props.customModels
  return props.customModels.filter(item => `${item.name} ${item.url ?? ''}`.toLowerCase().includes(term))
})

function resolvedTargetBoreId(): string | undefined {
  return props.project.bores.some(b => b.id === targetBoreId.value)
    ? targetBoreId.value
    : props.project.bores[0]?.id
}

function toggleBore(boreId: string): void {
  collapsedBores.value[boreId] = !collapsedBores.value[boreId]
}

function handlePick(id: string, event: MouseEvent): void {
  emit('select', id, { toggle: event.metaKey || event.ctrlKey })
}

function handleAdd(kind: DeviceKind): void {
  const boreId = resolvedTargetBoreId()
  if (!boreId) return
  emit('addAsset', kind, boreId)
}

function handlePlaceCustom(model: CustomModelEntry): void {
  const boreId = resolvedTargetBoreId()
  if (!boreId) return
  emit('placeCustomModel', model, boreId)
}

function triggerGlbPick(): void {
  fileInput.value?.click()
}

function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('uploadGlb', file)
}

function submitRemoteGlb(): void {
  if (!remoteUrl.value.trim()) return
  emit('addRemoteGlb', remoteUrl.value.trim(), remoteName.value.trim())
  remoteUrl.value = ''
  remoteName.value = ''
  remoteOpen.value = false
}
</script>

<template>
  <aside class="editor-dock editor-dock--left" aria-label="场景大纲与资产库">
    <div class="dock-tabs">
      <el-radio-group v-model="tab" size="small">
        <el-radio-button value="outline">场景大纲 ({{ project.assets.length }})</el-radio-button>
        <el-radio-button value="assets">设备资产库</el-radio-button>
      </el-radio-group>
    </div>

    <template v-if="tab === 'outline'">
      <div class="dock-filters">
        <el-input v-model="query" size="small" clearable placeholder="搜索编号、名称或桩号" aria-label="搜索大纲设备" />
        <div class="dock-filter-row">
          <el-select v-model="boreFilter" size="small" aria-label="按洞筒筛选">
            <el-option value="all" label="全部洞筒" />
            <el-option v-for="bore in project.bores" :key="bore.id" :value="bore.id" :label="bore.name" />
          </el-select>
          <el-select v-model="kindFilter" size="small" aria-label="按类型筛选">
            <el-option value="all" label="全部类型" />
            <el-option v-for="item in presentKinds" :key="item.kind" :value="item.kind" :label="item.name" />
          </el-select>
        </div>
      </div>

      <div class="dock-scroll">
        <section v-for="group in groupedByBore" :key="group.bore.id" class="outline-group">
          <button
            type="button"
            class="outline-group-head"
            :aria-expanded="!collapsedBores[group.bore.id]"
            @click="toggleBore(group.bore.id)"
          >
            <span class="outline-caret">{{ collapsedBores[group.bore.id] ? '▸' : '▾' }}</span>
            <strong>{{ group.bore.name }}</strong>
            <span class="outline-count">{{ group.items.length }}</span>
          </button>

          <ul v-show="!collapsedBores[group.bore.id]" class="outline-list">
            <li v-for="asset in group.items" :key="asset.id">
              <button
                type="button"
                class="outline-item"
                :class="{ selected: selectedSet.has(asset.id) }"
                :aria-pressed="selectedSet.has(asset.id)"
                @click="handlePick(asset.id, $event)"
                @dblclick="emit('focus', asset.id)"
              >
                <span class="outline-item-main">
                  <span class="outline-code">{{ asset.code }}</span>
                  <span class="outline-name">{{ asset.name }}</span>
                </span>
                <span class="outline-meta">
                  <span>{{ kindName(asset.kind) }}</span>
                  <span class="outline-station">{{ formatChainage(asset.chainage) }}</span>
                </span>
              </button>
            </li>
            <li v-if="group.items.length === 0" class="outline-empty">无匹配设备</li>
          </ul>
        </section>
      </div>
      <footer class="dock-foot">单击选中（Ctrl 多选）· 双击聚焦视角</footer>
    </template>

    <template v-else>
      <div class="dock-filters">
        <el-input v-model="catalogQuery" size="small" clearable placeholder="搜索设备类型" aria-label="搜索设备资产库" />
        <el-select v-model="targetBoreId" size="small" aria-label="默认落位洞筒">
          <el-option v-for="bore in project.bores" :key="bore.id" :value="bore.id" :label="`添加到：${bore.name}`" />
        </el-select>
      </div>

      <div class="dock-scroll">
        <section class="catalog-group custom-glb-section">
          <div class="custom-glb-head">
            <h3 class="catalog-title">自定义 GLB 模型 ({{ filteredCustomModels.length }})</h3>
            <div class="custom-glb-actions">
              <el-button size="small" type="primary" plain :disabled="busy" @click="triggerGlbPick">上传 .glb</el-button>
              <el-button size="small" text @click="remoteOpen = !remoteOpen">{{ remoteOpen ? '收起' : '外链' }}</el-button>
            </div>
            <input ref="fileInput" type="file" accept=".glb" style="display: none" @change="onFilePicked" />
          </div>
          <div v-if="remoteOpen" class="remote-glb-form">
            <el-input v-model="remoteName" size="small" placeholder="模型名称（可选）" />
            <el-input v-model="remoteUrl" size="small" placeholder="https://.../model.glb" />
            <el-button size="small" type="primary" :disabled="!remoteUrl.trim()" @click="submitRemoteGlb">添加到资产库</el-button>
          </div>
          <div v-if="filteredCustomModels.length" class="custom-glb-list">
            <div v-for="item in filteredCustomModels" :key="item.id" class="custom-glb-card">
              <div class="custom-glb-info">
                <strong>{{ item.name }}</strong>
                <span>{{ item.source === 'local' ? '本地' : '外链' }} · {{ item.bounds.map(n => n.toFixed(1)).join('×') }}m</span>
              </div>
              <div class="custom-glb-card-actions">
                <el-button size="small" type="primary" plain :disabled="busy" @click="handlePlaceCustom(item)">放置</el-button>
                <el-button size="small" type="danger" text :disabled="busy" @click="emit('deleteCustomModel', item.id)">删</el-button>
              </div>
            </div>
          </div>
          <p v-else class="custom-glb-empty">支持上传本地 .glb（自动存 IndexedDB 并解析包围盒）或添加外链 URL。</p>
        </section>

        <section v-for="group in groupedCatalog" :key="group.category" class="catalog-group">
          <h3 class="catalog-title">{{ group.category }}</h3>
          <div class="catalog-grid">
            <button
              v-for="item in group.items"
              :key="item.kind"
              type="button"
              class="catalog-card"
              :disabled="busy"
              @click="handleAdd(item.kind)"
            >
              <span class="catalog-name">{{ item.name }}</span>
              <span class="catalog-add">+ 放置</span>
            </button>
          </div>
        </section>
      </div>
      <footer class="dock-foot">点击设备卡片立即添加到所选洞筒（支持撤销）</footer>
    </template>
  </aside>
</template>

<style scoped>
.editor-dock--left {
  display: flex;
  flex-direction: column;
  width: 286px;
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

.dock-tabs {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(124, 182, 248, 0.16);
  background: var(--twin-glass-header);
  display: flex;
  justify-content: center;
}

.dock-filters {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-bottom: 1px solid rgba(124, 182, 248, 0.14);
}

.dock-filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.dock-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 10px;
}

.outline-group {
  margin-bottom: 8px;
}

.outline-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: rgba(118, 174, 240, 0.1);
  color: #e6f2ff;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}

.outline-group-head:hover {
  background: rgba(118, 174, 240, 0.18);
}

.outline-caret {
  width: 12px;
  color: var(--twin-accent);
}

.outline-count {
  margin-left: auto;
  font-size: 11px;
  color: #9ec0e6;
  font-variant-numeric: tabular-nums;
}

.outline-list {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.outline-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: rgba(10, 20, 44, 0.44);
  color: #dcebff;
  cursor: pointer;
  text-align: left;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.outline-item:hover {
  background: rgba(24, 48, 92, 0.65);
  border-color: rgba(120, 182, 252, 0.28);
}

.outline-item.selected {
  background: rgba(28, 62, 118, 0.85);
  border-color: rgba(108, 186, 255, 0.78);
  box-shadow: inset 2px 0 0 var(--twin-accent);
}

.outline-item-main {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.outline-code {
  font-size: 12px;
  font-weight: 600;
  color: #f4f9ff;
  flex-shrink: 0;
}

.outline-name {
  font-size: 11.5px;
  color: #a8c4e4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.outline-meta {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #88a9d0;
}

.outline-station {
  color: #79c4ff;
  font-variant-numeric: tabular-nums;
}

.outline-empty {
  padding: 10px 8px;
  font-size: 11.5px;
  color: #87a3c7;
  text-align: center;
}

.catalog-group {
  margin-bottom: 12px;
}

.catalog-title {
  margin: 0 0 6px;
  padding: 0 2px;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: #9ed0ff;
}

.catalog-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.catalog-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 8px 9px;
  border-radius: 8px;
  border: 1px solid rgba(120, 182, 252, 0.22);
  background: rgba(14, 28, 58, 0.62);
  color: #e6f2ff;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease;
}

.catalog-card:hover:not(:disabled) {
  background: rgba(24, 52, 98, 0.8);
  border-color: rgba(108, 186, 255, 0.7);
}

.catalog-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.catalog-name {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.3;
}

.catalog-add {
  font-size: 10.5px;
  color: #7cc4ff;
}

.custom-glb-section {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(124, 182, 248, 0.16);
}

.custom-glb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 8px;
}

.custom-glb-head .catalog-title {
  margin: 0;
}

.custom-glb-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.remote-glb-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(10, 22, 48, 0.7);
  border: 1px solid rgba(120, 182, 252, 0.2);
}

.custom-glb-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.custom-glb-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 7px 8px;
  border-radius: 8px;
  background: rgba(14, 28, 58, 0.68);
  border: 1px solid rgba(120, 182, 252, 0.24);
}

.custom-glb-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.custom-glb-info strong {
  font-size: 12px;
  color: #eef5ff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.custom-glb-info span {
  font-size: 10.5px;
  color: #8fb4de;
  font-variant-numeric: tabular-nums;
}

.custom-glb-card-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.custom-glb-empty {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #87a3c7;
}

.dock-foot {
  padding: 7px 12px;
  border-top: 1px solid rgba(124, 182, 248, 0.14);
  background: rgba(9, 18, 38, 0.72);
  font-size: 11px;
  color: #8faed3;
  text-align: center;
}
</style>
