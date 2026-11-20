<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { SceneDevice } from '../engines/tunnelSystemsState'

const props = defineProps<{
  device: SceneDevice
  streamUrl?: string
  boreName?: string
}>()

const emit = defineEmits<{ close: [] }>()

const mode = ref<'video' | '3d'>(props.streamUrl ? 'video' : '3d')
const streamState = ref<'loading' | 'playing' | 'error'>(props.streamUrl ? 'loading' : 'playing')
const reloadKey = ref(0)

watch(() => [props.device.id, props.streamUrl], () => {
  mode.value = props.streamUrl ? 'video' : '3d'
  streamState.value = props.streamUrl ? 'loading' : 'playing'
  reloadKey.value += 1
})

const title = computed(() => `${props.boreName ?? (props.device.tube === 0 ? '上行洞' : '下行洞')}监控点 · ${props.device.code ?? props.device.id}`)
const subtitle = computed(() => {
  if (!props.streamUrl) return '三维模拟视角 · 未接入视频流'
  if (mode.value === '3d') return '三维模拟视角 · 已配置视频流可切换'
  if (streamState.value === 'error') return '视频流连接失败 · 可重试或切回三维视角'
  return streamState.value === 'loading' ? '正在拉取实时视频流…' : '实时视频流画面'
})

function retry(): void {
  streamState.value = 'loading'
  reloadKey.value += 1
}
</script>

<template>
  <section class="monitor-view camera-player" :class="{ 'has-video': !!streamUrl && mode === 'video' }" role="status" aria-label="监控画面预览">
    <div class="camera-player-head">
      <div>
        <strong>{{ title }}</strong>
        <span>{{ subtitle }}</span>
      </div>
      <div class="camera-player-actions">
        <el-button v-if="streamUrl" size="small" @click="mode = mode === 'video' ? '3d' : 'video'">
          {{ mode === 'video' ? '三维视角' : '视频流' }}
        </el-button>
        <el-button v-if="streamUrl && mode === 'video' && streamState === 'error'" size="small" @click="retry">重试</el-button>
        <el-button size="small" @click="emit('close')">退出预览</el-button>
      </div>
    </div>
    <div v-if="streamUrl && mode === 'video'" class="camera-video-box">
      <video
        :key="`${device.id}-${reloadKey}`"
        :src="streamUrl"
        autoplay
        muted
        playsinline
        controls
        @playing="streamState = 'playing'"
        @error="streamState = 'error'"
      />
      <p v-if="streamState === 'error'" class="camera-stream-error">无法播放该视频流（浏览器原生支持 MP4/WebM 及 Safari HLS；RTSP/FLV 需经网关转码）。</p>
    </div>
  </section>
</template>

<style scoped>
.camera-player {
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
}
.camera-player.has-video {
  width: min(420px, calc(100vw - 40px));
}
.camera-player-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.camera-player-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.camera-video-box {
  position: relative;
  border-radius: 4px;
  overflow: hidden;
  background: #050a18;
  border: 1px solid #2c4268;
}
.camera-video-box video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  background: #000;
}
.camera-stream-error {
  margin: 0;
  padding: 8px 10px;
  font-size: 11px;
  line-height: 1.5;
  color: #ffb7a1;
  background: #2b1820;
}
</style>
