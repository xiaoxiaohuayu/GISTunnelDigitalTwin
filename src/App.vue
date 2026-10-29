<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
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
  <div class="workspace">

    <main class="workspace-main">
      <CesiumViewport />
    </main>

  </div>
</template>
