<script setup lang="ts">
import { computed } from 'vue'
import type { FacilityType, TunnelSceneDocument } from '../schema/tunnelSchema'
import type { SelectionTarget } from '../store/useTunnelStudioStore'
import { FACILITY_CATEGORIES, FACILITY_LIST, FACILITY_REGISTRY } from '../registry/facilityRegistry'
import { getBoreDirectionLabel } from '../geometry/alignmentMath'

const props = defineProps<{
  doc: TunnelSceneDocument
  selection: SelectionTarget
}>()

const emit = defineEmits<{
  select: [target: SelectionTarget]
  addBore: []
  swapDirections: []
  addFacility: [type: FacilityType]
  toggleFacilityVisible: [facilityId: string, visible: boolean]
  focusFacility: [facilityId: string]
  duplicateFacility: [facilityId: string]
  removeFacility: [facilityId: string]
}>()

const groupedFacilities = computed(() =>
  FACILITY_CATEGORIES.map(category => ({
    ...category,
    items: props.doc.facilities.filter(item => FACILITY_REGISTRY[item.type]?.category === category.key),
  })),
)

function isSelected(kind: SelectionTarget['kind'], id?: string): boolean {
  if (props.selection.kind !== kind) return false
  if (kind === 'tunnel' || kind === 'wall') return true
  return 'id' in props.selection && props.selection.id === id
}
</script>

<template>
  <aside class="twin-dock w-[300px] shrink-0 flex flex-col min-h-0">
    <div class="px-3.5 py-2.5 twin-divider-b flex items-center justify-between">
      <h2 class="twin-section-title">场景层级大纲</h2>
      <span class="text-[11px] text-twin-muted tabular">
        {{ doc.tunnel.bores.length }} 洞 · {{ doc.facilities.length }} 设施
      </span>
    </div>

    <div class="flex-1 overflow-y-auto p-2.5 space-y-3">
      <!-- 1. 隧道本体 -->
      <section class="space-y-1">
        <div class="px-1.5 text-[11px] font-600 text-twin-sub uppercase tracking-wider">
          隧道本体结构
        </div>
        <button
          type="button"
          class="w-full text-left px-2.5 py-2 rounded-[8px] border border-solid transition cursor-pointer flex items-center justify-between"
          :class="
            isSelected('tunnel')
              ? 'bg-[#4ea8ff]/22 border-[#6cbaff]/60 text-twin-ink'
              : 'bg-white/4 border-transparent text-twin-text hover:bg-white/8'
          "
          @click="emit('select', { kind: 'tunnel' })"
        >
          <span class="text-[13px] font-500 truncate">{{ doc.tunnel.name || '未命名隧道' }}</span>
          <span class="text-[11px] text-twin-muted">洞口 · 经纬度</span>
        </button>

        <button
          type="button"
          class="w-full text-left px-2.5 py-2 rounded-[8px] border border-solid transition cursor-pointer flex items-center justify-between"
          :class="
            isSelected('wall')
              ? 'bg-[#4ea8ff]/22 border-[#6cbaff]/60 text-twin-ink'
              : 'bg-white/4 border-transparent text-twin-text hover:bg-white/8'
          "
          @click="emit('select', { kind: 'wall' })"
        >
          <span class="text-[13px] font-500">隧道墙体与衬砌</span>
          <span class="text-[11px] text-twin-muted">
            {{ doc.wall.visible ? `${Math.round(doc.wall.opacity * 100)}%` : '已隐藏' }}
          </span>
        </button>
      </section>

      <!-- 2. 洞筒与车道 -->
      <section class="space-y-1.5">
        <div class="px-1.5 flex items-center justify-between">
          <span class="text-[11px] font-600 text-twin-sub uppercase tracking-wider">洞筒与上下行</span>
          <div class="flex items-center gap-1">
            <button
              v-if="doc.tunnel.bores.length >= 2"
              type="button"
              class="px-1.5 py-0.5 text-[11px] rounded bg-white/8 hover:bg-white/15 text-twin-accent border-0 cursor-pointer"
              title="一键互换上行/下行方向"
              @click="emit('swapDirections')"
            >
              互换上下行
            </button>
            <button
              type="button"
              class="px-1.5 py-0.5 text-[11px] rounded bg-[#4ea8ff]/20 hover:bg-[#4ea8ff]/35 text-twin-ink border-0 cursor-pointer"
              @click="emit('addBore')"
            >
              + 洞筒
            </button>
          </div>
        </div>

        <div class="space-y-1">
          <button
            v-for="bore in doc.tunnel.bores"
            :key="bore.id"
            type="button"
            class="w-full text-left px-2.5 py-2 rounded-[8px] border border-solid transition cursor-pointer flex items-center justify-between gap-2"
            :class="
              isSelected('bore', bore.id)
                ? 'bg-[#4ea8ff]/22 border-[#6cbaff]/60 text-twin-ink'
                : 'bg-white/4 border-transparent text-twin-text hover:bg-white/8'
            "
            @click="emit('select', { kind: 'bore', id: bore.id })"
          >
            <span class="text-[13px] truncate">{{ bore.name }}</span>
            <span class="text-[11px] text-twin-muted shrink-0 tabular">
              {{ getBoreDirectionLabel(bore.direction) }} · {{ bore.laneCount }}车道
            </span>
          </button>
        </div>
      </section>

      <!-- 3. 隧道设施列表（按分类分组） -->
      <section class="space-y-2">
        <div class="px-1.5 text-[11px] font-600 text-twin-sub uppercase tracking-wider">
          已配置隧道设施
        </div>

        <div v-for="group in groupedFacilities" :key="group.key" class="space-y-1">
          <div class="px-1.5 flex items-center justify-between text-[11px] text-twin-muted">
            <span>{{ group.label }}</span>
            <span class="tabular">{{ group.items.length }}</span>
          </div>

          <div v-if="group.items.length === 0" class="px-2.5 py-1.5 text-[11px] text-twin-sub/70">
            暂无此类设施
          </div>

          <div
            v-for="item in group.items"
            :key="item.id"
            class="group px-2 py-1.5 rounded-[8px] border border-solid transition flex items-center justify-between gap-1.5 cursor-pointer"
            :class="
              isSelected('facility', item.id)
                ? 'bg-[#4ea8ff]/22 border-[#6cbaff]/60 text-twin-ink'
                : 'bg-white/4 border-transparent text-twin-text hover:bg-white/8'
            "
            @click="emit('select', { kind: 'facility', id: item.id })"
          >
            <div class="min-w-0 flex-1">
              <div class="text-[12.5px] truncate" :class="{ 'opacity-45 line-through': !item.visible }">
                {{ item.name }}
              </div>
              <div class="text-[11px] text-twin-muted">
                {{ FACILITY_REGISTRY[item.type]?.shortLabel }}
              </div>
            </div>

            <div class="flex items-center gap-1 shrink-0 opacity-85 group-hover:opacity-100">
              <button
                type="button"
                class="px-1.5 py-0.5 text-[11px] rounded bg-white/8 hover:bg-white/18 text-twin-text border-0 cursor-pointer"
                title="定位视角"
                @click.stop="emit('focusFacility', item.id)"
              >
                定位
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 text-[11px] rounded bg-white/8 hover:bg-white/18 text-twin-text border-0 cursor-pointer"
                :title="item.visible ? '隐藏' : '显示'"
                @click.stop="emit('toggleFacilityVisible', item.id, !item.visible)"
              >
                {{ item.visible ? '显' : '隐' }}
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 text-[11px] rounded bg-[#ff6b57]/18 hover:bg-[#ff6b57]/35 text-[#ffb4a9] border-0 cursor-pointer"
                title="删除设施"
                @click.stop="emit('removeFacility', item.id)"
              >
                删
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 底部：可扩展设施快速添加面板 -->
    <div class="p-2.5 border-0 border-t border-solid border-[#7cb6f8]/15 bg-[#091326]/65">
      <div class="text-[11px] font-600 text-twin-sub mb-2">添加隧道设施</div>
      <div class="grid grid-cols-2 gap-1.5">
        <button
          v-for="descriptor in FACILITY_LIST"
          :key="descriptor.type"
          type="button"
          class="px-2 py-1.5 text-[12px] text-left rounded-[7px] bg-[#15284c]/75 hover:bg-[#214075]/85 text-twin-text border border-solid border-[#78b6fc]/25 cursor-pointer transition truncate"
          :title="descriptor.description"
          @click="emit('addFacility', descriptor.type)"
        >
          + {{ descriptor.shortLabel }}
        </button>
      </div>
    </div>
  </aside>
</template>
