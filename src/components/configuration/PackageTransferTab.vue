<script setup lang="ts">
import { shallowRef } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { UploadFile } from 'element-plus'
import { assetCsvTemplate, previewAssetImport } from '../../engines/assetImport'
import { formatChainage } from '../../engines/projectConfig'
import type { AssetRecord, TunnelProject } from '../../engines/projectConfig'
import { encodeTunnelPackage, readTunnelPackage } from '../../engines/projectPackage'
import type { TunnelPackageExtras } from '../../engines/projectPackage'
import { readControlOverrides } from '../../engines/projectStorage'
import { readPortalSign } from '../../engines/portalSignConfig'
import { readTrafficSigns } from '../../engines/trafficSignConfig'

const props = defineProps<{
  draft: TunnelProject
}>()

const emit = defineEmits<{
  error: [message: string]
  importAssets: [assets: AssetRecord[]]
  replaceProject: [project: TunnelProject, extras?: TunnelPackageExtras]
  restoreDemo: []
}>()

const csv = shallowRef('')
const imported = shallowRef<ReturnType<typeof previewAssetImport>>()
const pendingProject = shallowRef<TunnelProject>()
const pendingExtras = shallowRef<TunnelPackageExtras>()

function download(text: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportPackage(): Promise<void> {
  const [controls, portalSign, trafficSigns] = await Promise.all([
    readControlOverrides(props.draft.id).catch(() => ({})),
    readPortalSign().catch(() => undefined),
    readTrafficSigns().catch(() => undefined),
  ])
  download(
    JSON.stringify(await encodeTunnelPackage({ project: props.draft, controls, portalSign, trafficSigns }), null, 2),
    '隧道配置包.json',
    'application/json',
  )
}

async function handleFile(upload: UploadFile, kind: 'csv' | 'json'): Promise<void> {
  const f = upload.raw
  if (!f) return
  try {
    if (f.size > (kind === 'json' ? 25_000_000 : 10_000_000)) {
      throw new Error(kind === 'json' ? '配置包不得超过 25 MB' : '配置文件不得超过 10 MB')
    }
    const text = await f.text()
    if (kind === 'csv') {
      csv.value = text
      imported.value = previewAssetImport(text, props.draft)
    } else {
      const loaded = readTunnelPackage(JSON.parse(text))
      pendingProject.value = loaded.project
      pendingExtras.value = loaded.extras
    }
    emit('error', '')
  } catch (e) {
    emit('error', e instanceof Error ? e.message : String(e))
  }
}

function acceptProject(): void {
  if (!pendingProject.value) return
  emit('replaceProject', structuredClone(pendingProject.value), pendingExtras.value)
  pendingProject.value = undefined
  pendingExtras.value = undefined
}

function acceptCsv(): void {
  const preview = previewAssetImport(csv.value, props.draft)
  imported.value = preview
  if (preview.errors.length) return
  emit('importAssets', preview.assets)
  imported.value = undefined
  csv.value = ''
}

async function confirmDemo(): Promise<void> {
  try {
    await ElMessageBox.confirm('返回原演示场景？已应用配置将从浏览器移除，请先导出备份。', '返回演示场景', {
      type: 'warning',
      confirmButtonText: '返回演示',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  emit('restoreDemo')
}
</script>

<template>
  <section class="transfer-section">
    <h3>批量录入设备</h3>
    <p>下载模板后用 Excel 填写并保存为 CSV UTF-8。类型可填写设备类型名称或代码，洞筒可填写名称或 ID。横向偏移左负右正，高度单位为米。</p>
    <div class="transfer-actions">
      <el-button @click="download(assetCsvTemplate(draft), '设备录入模板.csv', 'text/csv;charset=utf-8')">下载 CSV 模板</el-button>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".csv,.tsv" :on-change="(u: UploadFile) => void handleFile(u, 'csv')">
        <el-button>选择设备 CSV</el-button>
      </el-upload>
    </div>
    <div v-if="imported" class="import-preview">
      <h4>导入预览 · {{ imported.assets.length }} 条有效数据</h4>
      <ul v-if="imported.errors.length" class="config-errors">
        <li v-for="message in imported.errors.slice(0, 20)" :key="message">{{ message }}</li>
      </ul>
      <p v-for="asset in imported.assets.slice(0, 5)" :key="asset.id">{{ asset.code }} · {{ asset.name }} · {{ formatChainage(asset.chainage) }}</p>
      <el-button :disabled="!!imported.errors.length || !imported.assets.length" @click="acceptCsv">加入草稿，暂不保存</el-button>
    </div>
  </section>

  <section class="transfer-section">
    <h3>完整配置包</h3>
    <p>一份 JSON 包含线路、洞筒、设备台账、入口标牌、交通标志图片和单设备控制。浏览器里的记录只是本机缓存。旧的纯项目 JSON 仍可导入。导入后先替换草稿，只有保存并应用后才修改场景。</p>
    <div class="transfer-actions">
      <el-button type="primary" plain @click="exportPackage">导出完整配置包</el-button>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".json,application/json" :on-change="(u: UploadFile) => void handleFile(u, 'json')">
        <el-button>导入配置包或 JSON</el-button>
      </el-upload>
    </div>
    <div v-if="pendingProject" class="import-preview">
      <p>{{ pendingProject.name }} · {{ pendingProject.bores.length }} 个洞筒 · {{ pendingProject.assets.length }} 条台账{{ pendingExtras ? ' · 含标牌与设备控制' : '' }}</p>
      <el-button type="primary" @click="acceptProject">用此配置替换草稿</el-button>
    </div>
  </section>

  <el-button type="warning" plain @click="confirmDemo">返回原演示场景</el-button>
</template>
