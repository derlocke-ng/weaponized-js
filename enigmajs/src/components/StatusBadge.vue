<script setup>
import { computed } from "vue";
import { useChatStore } from "../stores/chat";
import NetworkIndicator from "./NetworkIndicator.vue";

const store = useChatStore();

const statusClass = computed(() => {
  return `status ${store.status}`;
});

const badgeClass = computed(() => {
  if (store.status === "connected" && store.isEncrypted) return "badge active";
  if (store.status === "connecting" || store.status === "waiting")
    return "badge warning";
  return "badge";
});
</script>

<template>
  <div class="status-row">
    <div :class="statusClass">
      {{ store.statusText }}
    </div>
    <NetworkIndicator />
  </div>
</template>

<style scoped>
.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
}

.status {
  flex: 1;
  padding: 16px;
  border-radius: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 14px;
}

.status.disconnected {
  background: var(--status-disconnected-bg);
  color: var(--status-disconnected-text);
  border-left: 4px solid var(--status-disconnected-border);
}

.status.connecting {
  background: #ffeaa7;
  color: #d63031;
  border-left: 4px solid #fdcb6e;
}

.status.waiting {
  background: var(--status-waiting-bg);
  color: var(--status-waiting-text);
  border-left: 4px solid var(--status-waiting-border);
}

.status.connected {
  background: var(--status-connected-bg);
  color: var(--status-connected-text);
  border-left: 4px solid var(--status-connected-border);
}
</style>
