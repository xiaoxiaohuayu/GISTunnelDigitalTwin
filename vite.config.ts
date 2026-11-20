// @env node
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumRoot = 'node_modules/cesium/Build/Cesium'

function manualChunks(id: string): string | undefined {
  if (id.includes('/node_modules/cesium/') || id.includes('/node_modules/@cesium/')) {
    return 'vendor-cesium'
  }
  if (id.includes('/node_modules/element-plus/') || id.includes('/node_modules/@element-plus/')) {
    return 'vendor-element-plus'
  }
  if (id.includes('/node_modules/vue/') || id.includes('/node_modules/@vue/')) {
    return 'vendor-vue'
  }
  if (id.includes('/src/components/configuration/')) {
    return 'editor-project'
  }
  return undefined
}

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    viteStaticCopy({
      targets: ['Workers', 'Assets', 'Widgets', 'ThirdParty'].map(directory => ({
        src: `${cesiumRoot}/${directory}`,
        dest: 'cesium',
        rename: { stripBase: 4 },
      })),
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: { port: 5180, strictPort: true },
})
