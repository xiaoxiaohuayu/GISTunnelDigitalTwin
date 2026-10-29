// @env node
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const cesiumRoot = 'node_modules/cesium/Build/Cesium'

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
  server: { port: 5180, strictPort: true },
})
