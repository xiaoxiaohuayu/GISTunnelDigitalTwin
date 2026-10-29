<script setup lang="ts">
import type { activeDeviceAlerts } from '../engines/deviceTelemetry'
defineProps<{ alerts: ReturnType<typeof activeDeviceAlerts> }>()
defineEmits<{ focus: [id: string] }>()
</script>
<template>
  <section v-if="alerts.length" class="device-alerts" aria-label="持续设备告警">
    <header class="alerts-heading" role="status" aria-live="polite"><span><i aria-hidden="true" />设备异常</span><small>{{ alerts.length }} 项待恢复</small></header>
    <ul class="alerts-list">
      <li v-for="alert in alerts" :key="alert.device.id">
        <button class="alert-target" :class="alert.severity" :aria-label="`查看${alert.name}${alert.status}`" @click="$emit('focus',alert.device.id)">
          <svg class="alert-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v1"/></svg>
          <span class="alert-copy"><strong>{{alert.name}}<span>{{alert.status}}</span></strong><small>{{alert.device.boreName??(alert.device.tube===0?'上行洞':'下行洞')}} · {{alert.device.chainage??`${Math.round(alert.device.station)} m`}} <span>· {{alert.value}}</span></small></span>
          <svg class="alert-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
      </li>
    </ul>
    <p class="alerts-source">本地演练 · 设备恢复后自动清除</p>
  </section>
</template>
<style scoped>
.device-alerts{position:absolute;z-index:6;right:20px;top:72px;width:360px;max-width:calc(100% - 40px);color:#eef5ff;background:#17212e;box-shadow:0 14px 36px #02081266;border-radius:12px;overflow:hidden;animation:alert-arrive .5s cubic-bezier(.16,1,.3,1)}
.alerts-heading{display:flex;align-items:center;justify-content:space-between;padding:13px 16px 9px;font-size:12px;font-weight:600}
.alerts-heading>span{display:flex;align-items:center;gap:8px}.alerts-heading i{width:6px;height:6px;border-radius:50%;background:#ffae8f;box-shadow:0 0 10px #ff9b8844;animation:alert-signal 1s ease-out 3}.alerts-heading small{font-size:11px;font-weight:400;color:#d9b8ad}
.alerts-list{list-style:none;margin:0;padding:0 8px;max-height:150px;overflow:auto;scrollbar-width:thin;scrollbar-color:#7d6670 transparent}
.alert-target{width:100%;display:flex;align-items:center;gap:11px;border:0;border-radius:6px;background:transparent;text-align:left;padding:11px 8px;color:#ffb7a1}.alert-target:hover{background:#ffffff0a!important}.alert-icon{width:22px;height:22px;flex-shrink:0}.alert-arrow{width:15px;height:15px;color:#d9b8ad;flex-shrink:0}.alert-target.warning{color:#ffda9a}
.alert-copy{flex:1;min-width:0}.alert-copy strong{display:flex;flex-wrap:wrap;gap:7px;font-weight:500;font-size:13px;line-height:1.5;color:#f5f3f4}.alert-copy strong span{font-size:11px;color:#ffb7a1}.warning .alert-copy strong span{color:#ffda9a}.alert-copy small{display:block;font-size:11px;margin-top:5px;color:#c6cbd6;line-height:1.5}.alerts-source{margin:0;padding:9px 16px 12px;font-size:10px;color:#c6cbd6;border-top:1px solid #ffffff0c}
@keyframes alert-arrive{from{transform:translateY(-8px);filter:brightness(1.2)}to{transform:translateY(0);filter:brightness(1)}}@keyframes alert-signal{50%{box-shadow:0 0 14px #ff9b8877}}
@media(max-width:760px){.device-alerts{top:94px;right:10px;max-width:calc(100% - 20px);width:360px}.alerts-heading{padding:10px 13px 6px}.alerts-list{max-height:110px}.alert-target{padding:9px 5px}.alerts-source{padding:6px 13px 9px}}
@media(prefers-reduced-motion:reduce){.device-alerts,.alerts-heading i{animation:none}}
</style>
