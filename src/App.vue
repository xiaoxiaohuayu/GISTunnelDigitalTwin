<script setup lang="ts">
import { defineAsyncComponent,shallowRef } from 'vue'
import ViewportLoading from './components/ViewportLoading.vue'
import ViewportError from './components/ViewportError.vue'
const CesiumViewport = defineAsyncComponent({
  loader: () => import('./components/CesiumViewport.vue'),
  loadingComponent: ViewportLoading,
  errorComponent: ViewportError,
  delay: 200,
  timeout: 30000,
})
const revision=shallowRef(0),focusId=shallowRef<string>()
function rebuild(id?:string):void{focusId.value=id;revision.value++}
</script>

<template>
  <div class="workspace">

    <main class="workspace-main">
      <CesiumViewport :key="revision" :initial-focus-id="focusId" @rebuild="rebuild" />
    </main>

  </div>
</template>
