<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import ViewportLoading from './components/ViewportLoading.vue'
import ViewportError from './components/ViewportError.vue'

const CesiumViewport = defineAsyncComponent({
  loader: () => import('./components/CesiumViewport.vue'),
  loadingComponent: ViewportLoading,
  errorComponent: ViewportError,
  delay: 200,
  timeout: 30000,
})
</script>

<template>
  <el-config-provider :locale="zhCn">
    <div class="workspace">
      <main class="workspace-main">
        <CesiumViewport />
      </main>
    </div>
  </el-config-provider>
</template>
