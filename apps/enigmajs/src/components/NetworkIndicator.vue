<script setup>
import { computed } from "vue";
import { useChatStore } from "../stores/chat";

const store = useChatStore();

const qualityInfo = computed(() => {
  const info = {
    excellent: { icon: "📶", color: "#00b894", label: "Excellent", bars: 4 },
    good: { icon: "📶", color: "#00cec9", label: "Good", bars: 3 },
    fair: { icon: "📶", color: "#fdcb6e", label: "Fair", bars: 2 },
    poor: { icon: "📶", color: "#d63031", label: "Poor", bars: 1 },
    unknown: { icon: "📶", color: "#636e72", label: "Checking...", bars: 0 },
  };
  return info[store.networkQuality] || info.unknown;
});

const latencyText = computed(() => {
  if (store.networkLatency === null) return "";
  return `${store.networkLatency}ms`;
});
</script>

<template>
  <div
    v-if="store.isConnected"
    class="network-indicator"
    :title="`Network: ${qualityInfo.label}${latencyText ? ' (' + latencyText + ')' : ''}`"
  >
    <div class="signal-bars" :style="{ '--quality-color': qualityInfo.color }">
      <div class="bar" :class="{ active: qualityInfo.bars >= 1 }"></div>
      <div class="bar" :class="{ active: qualityInfo.bars >= 2 }"></div>
      <div class="bar" :class="{ active: qualityInfo.bars >= 3 }"></div>
      <div class="bar" :class="{ active: qualityInfo.bars >= 4 }"></div>
    </div>
    <span v-if="latencyText" class="latency">{{ latencyText }}</span>
  </div>
</template>

<style scoped>
.network-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--section-bg);
  font-size: 12px;
  color: var(--text-secondary);
}

.signal-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 14px;
}

.bar {
  width: 4px;
  background: var(--input-border);
  border-radius: 1px;
  transition: all 0.3s ease;
}

.bar:nth-child(1) {
  height: 4px;
}
.bar:nth-child(2) {
  height: 7px;
}
.bar:nth-child(3) {
  height: 10px;
}
.bar:nth-child(4) {
  height: 14px;
}

.bar.active {
  background: var(--quality-color);
}

.latency {
  font-family: monospace;
  font-size: 11px;
  min-width: 35px;
}
</style>
