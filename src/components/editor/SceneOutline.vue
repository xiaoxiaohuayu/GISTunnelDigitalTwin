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
  toggleVisibility: [id: string, visible: boolean]
  toggleLock: [id: string, locked: boolean]
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

function onDragStartBuiltin(kind: DeviceKind, event: DragEvent): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-codex-aigis-asset', JSON.stringify({ type: 'builtin', kind }))
}

function onDragStartCustom(model: CustomModelEntry, event: DragEvent): void {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-codex-aigis-asset', JSON.stringify({ type: 'custom', modelId: model.id }))
}
</script>

<template>
  <aside class="twin-dock w-[286px]" aria-label="场景大纲与资产库">
    <div class="px-3 py-2.5 twin-divider-b bg-twin-header flex justify-center">
      <el-radio-group v-model="tab" size="small">
        <el-radio-button value="outline">场景大纲 ({{ project.assets.length }})</el-radio-button>
        <el-radio-button value="assets">设备资产库</el-radio-button>
      </el-radio-group>
    </div>

    <template v-if="tab === 'outline'">
      <div class="px-3 py-2.5 flex flex-col gap-2 twin-divider-b">
        <el-input v-model="query" size="small" clearable placeholder="搜索编号、名称或桩号" aria-label="搜索大纲设备" />
        <div class="grid grid-cols-2 gap-1.5">
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

      <div class="flex-1 min-h-0 overflow-y-auto px-2.5 py-2">
        <section v-for="group in groupedByBore" :key="group.bore.id" class="mb-2">
          <button
            type="button"
            class="w-full flex items-center gap-1.5 px-2 py-1.5 border-0 rounded-[8px] bg-[#76aef0]/10 hover:bg-[#76aef0]/18 text-[#e6f2ff] text-[12.5px] cursor-pointer text-left"
            :aria-expanded="!collapsedBores[group.bore.id]"
            @click="toggleBore(group.bore.id)"
          >
            <span class="w-3 text-twin-accent">{{ collapsedBores[group.bore.id] ? '▸' : '▾' }}</span>
            <strong>{{ group.bore.name }}</strong>
            <span class="ml-auto text-[11px] text-twin-muted tabular">{{ group.items.length }}</span>
          </button>

          <ul v-show="!collapsedBores[group.bore.id]" class="list-none mt-1 mb-0 p-0 flex flex-col gap-[3px]">
            <li v-for="asset in group.items" :key="asset.id" class="flex items-stretch gap-1">
              <button
                type="button"
                class="flex-1 min-w-0 flex flex-col gap-[3px] px-[9px] py-[7px] border border-solid border-transparent rounded-[8px] bg-[#0a142c]/44 hover:bg-[#18305c]/65 hover:border-[#78b6fc]/28 text-[#dcebff] cursor-pointer text-left transition-colors duration-150"
                :class="[
                  selectedSet.has(asset.id) ? '!bg-[#1c3e76]/85 !border-[#6cbaff]/78 shadow-[inset_2px_0_0_var(--twin-accent)]' : '',
                  asset.visible === false ? 'opacity-48' : '',
                  asset.locked ? 'border-dashed !border-[#f0b15b]/45' : '',
                ]"
                :aria-pressed="selectedSet.has(asset.id)"
                @click="handlePick(asset.id, $event)"
                @dblclick="emit('focus', asset.id)"
              >
                <span class="flex items-baseline gap-1.5 min-w-0">
                  <span class="text-[12px] font-600 text-[#f4f9ff] shrink-0">{{ asset.code }}</span>
                  <span class="text-[11.5px] text-[#a8c4e4] truncate">{{ asset.name }}</span>
                </span>
                <span class="flex justify-between text-[11px] text-[#88a9d0]">
                  <span>{{ kindName(asset.kind) }}</span>
                  <span class="text-[#79c4ff] tabular">{{ formatChainage(asset.chainage) }}</span>
                </span>
              </button>
              <div class="flex flex-col justify-center gap-[3px] shrink-0">
                <button
                  type="button"
                  class="w-6 h-5 p-0 rounded-[5px] border border-solid text-[10px] leading-none cursor-pointer disabled:opacity-50"
                  :class="asset.visible === false
                    ? 'bg-[#f0b15b]/22 border-[#f0b15b]/65 text-twin-warn'
                    : 'bg-[#0a142c]/56 border-[#78b6fc]/22 text-twin-muted hover:border-[#6cbaff]/65 hover:text-twin-ink'"
                  :disabled="busy"
                  :title="asset.visible === false ? '显示设备' : '隐藏设备'"
                  :aria-label="asset.visible === false ? `显示 ${asset.code}` : `隐藏 ${asset.code}`"
                  @click.stop="emit('toggleVisibility', asset.id, asset.visible === false)"
                >
                  {{ asset.visible === false ? '隐' : '显' }}
                </button>
                <button
                  type="button"
                  class="w-6 h-5 p-0 rounded-[5px] border border-solid text-[10px] leading-none cursor-pointer disabled:opacity-50"
                  :class="asset.locked
                    ? 'bg-[#f0b15b]/22 border-[#f0b15b]/65 text-twin-warn'
                    : 'bg-[#0a142c]/56 border-[#78b6fc]/22 text-twin-muted hover:border-[#6cbaff]/65 hover:text-twin-ink'"
                  :disabled="busy"
                  :title="asset.locked ? '解锁防误拖' : '锁定防误拖'"
                  :aria-label="asset.locked ? `解锁 ${asset.code}` : `锁定 ${asset.code}`"
                  @click.stop="emit('toggleLock', asset.id, !asset.locked)"
                >
                  {{ asset.locked ? '锁' : '开' }}
                </button>
              </div>
            </li>
            <li v-if="group.items.length === 0" class="px-2 py-2.5 text-[11.5px] text-[#87a3c7] text-center">无匹配设备</li>
          </ul>
        </section>
      </div>
      <footer class="px-3 py-[7px] border-0 border-t border-solid border-[#7cb6f8]/14 bg-[#091226]/72 text-[11px] text-twin-sub text-center">
        单击选中（Ctrl 多选）· 双击聚焦视角
      </footer>
    </template>

    <template v-else>
      <div class="px-3 py-2.5 flex flex-col gap-2 twin-divider-b">
        <el-input v-model="catalogQuery" size="small" clearable placeholder="搜索设备类型" aria-label="搜索设备资产库" />
        <el-select v-model="targetBoreId" size="small" aria-label="默认落位洞筒">
          <el-option v-for="bore in project.bores" :key="bore.id" :value="bore.id" :label="`添加到：${bore.name}`" />
        </el-select>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-2.5 py-2">
        <section class="mb-3 pb-2.5 twin-divider-b">
          <div class="flex items-center justify-between gap-1.5 mb-2">
            <h3 class="twin-section-title text-[11.5px]">自定义 GLB 模型 ({{ filteredCustomModels.length }})</h3>
            <div class="flex items-center gap-1">
              <el-button size="small" type="primary" plain :disabled="busy" @click="triggerGlbPick">上传 .glb</el-button>
              <el-button size="small" text @click="remoteOpen = !remoteOpen">{{ remoteOpen ? '收起' : '外链' }}</el-button>
            </div>
            <input ref="fileInput" type="file" accept=".glb" class="hidden" @change="onFilePicked" />
          </div>
          <div v-if="remoteOpen" class="flex flex-col gap-1.5 mb-2 p-2 rounded-[8px] bg-[#0a1630]/70 border border-solid border-[#78b6fc]/20">
            <el-input v-model="remoteName" size="small" placeholder="模型名称（可选）" />
            <el-input v-model="remoteUrl" size="small" placeholder="https://.../model.glb" />
            <el-button size="small" type="primary" :disabled="!remoteUrl.trim()" @click="submitRemoteGlb">添加到资产库</el-button>
          </div>
          <div v-if="filteredCustomModels.length" class="flex flex-col gap-1.5">
            <div
              v-for="item in filteredCustomModels"
              :key="item.id"
              class="twin-card flex items-center justify-between gap-1.5 px-2 py-[7px] cursor-grab"
              :draggable="!busy"
              title="可拖入三维视口直接落位"
              @dragstart="onDragStartCustom(item, $event)"
            >
              <div class="min-w-0 flex flex-col gap-0.5">
                <strong class="text-[12px] text-twin-ink truncate">{{ item.name }}</strong>
                <span class="text-[10.5px] text-twin-sub tabular">{{ item.source === 'local' ? '本地' : '外链' }} · {{ item.bounds.map(n => n.toFixed(1)).join('×') }}m</span>
              </div>
              <div class="flex items-center gap-0.5 shrink-0">
                <el-button size="small" type="primary" plain :disabled="busy" @click="handlePlaceCustom(item)">放置</el-button>
                <el-button size="small" type="danger" text :disabled="busy" @click="emit('deleteCustomModel', item.id)">删</el-button>
              </div>
            </div>
          </div>
          <p v-else class="m-0 text-[11px] leading-[1.5] text-[#87a3c7]">
            支持上传本地 .glb（自动存 IndexedDB 并解析包围盒）或添加外链 URL。
          </p>
        </section>

        <section v-for="group in groupedCatalog" :key="group.category" class="mb-3">
          <h3 class="twin-section-title text-[11.5px] mb-1.5 px-0.5">{{ group.category }}</h3>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="item in group.items"
              :key="item.kind"
              type="button"
              class="flex flex-col items-start gap-1 px-[9px] py-2 rounded-[8px] border border-solid border-[#78b6fc]/22 bg-[#0e1c3a]/62 hover:bg-[#183462]/80 hover:border-[#6cbaff]/70 text-[#e6f2ff] cursor-pointer text-left transition-colors duration-150 disabled:opacity-55 disabled:cursor-not-allowed"
              :disabled="busy"
              :draggable="!busy"
              title="点击放到洞筒中点，或直接拖入三维视口落位"
              @dragstart="onDragStartBuiltin(item.kind, $event)"
              @click="handleAdd(item.kind)"
            >
              <span class="text-[12px] font-500 leading-[1.3]">{{ item.name }}</span>
              <span class="text-[10.5px] text-[#7cc4ff]">拖入 / +放置</span>
            </button>
          </div>
        </section>
      </div>
      <footer class="px-3 py-[7px] border-0 border-t border-solid border-[#7cb6f8]/14 bg-[#091226]/72 text-[11px] text-twin-sub text-center">
        支持拖入三维视口落位，或单击直接放置（可撤销）
      </footer>
    </template>
  </aside>
</template>
