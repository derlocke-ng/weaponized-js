<script setup>
import { ref } from "vue";
import { useChatStore } from "../stores/chat";
import { useEnigma } from "../composables/useEnigma";

const store = useChatStore();
const enigma = useEnigma();
const isExpanded = ref(false);

function toggle() {
  isExpanded.value = !isExpanded.value;
}

function toggleVerbose(event) {
  enigma.setVerbose(event.target.checked);
}
</script>

<template>
  <div class="debug-panel">
    <div class="debug-toggle" @click="toggle">
      <span class="debug-toggle-text">🔧 Debug Info & Logs</span>
      <span class="debug-toggle-icon" :class="{ expanded: isExpanded }">▼</span>
    </div>

    <div class="debug-content" :class="{ expanded: isExpanded }">
      <!-- Security Info -->
      <div class="security-info">
        <div class="security-header">
          <span class="security-title">🔒 Security</span>
          <span
            class="security-badge"
            :class="{
              active: store.isEncrypted && store.isConnected,
              warning:
                store.status === 'connecting' || store.status === 'waiting',
            }"
          >
            {{ store.securityBadgeText }}
          </span>
        </div>

        <div class="security-item">
          <span class="security-label">Status:</span>
          <span class="security-value">{{ store.statusText }}</span>
        </div>
        <div class="security-item">
          <span class="security-label">Role:</span>
          <span class="security-value">{{
            store.isHost ? "Host" : "Client"
          }}</span>
        </div>
        <div class="security-item">
          <span class="security-label">Room:</span>
          <span class="security-value">{{ store.roomId || "—" }}</span>
        </div>
        <div class="security-item">
          <span class="security-label">Users:</span>
          <span class="security-value">{{ store.userCount }}</span>
        </div>
        <div class="security-item">
          <span class="security-label">Messages:</span>
          <span class="security-value">{{ store.messageCount }}</span>
        </div>
      </div>

      <!-- Verbose Toggle -->
      <div class="verbose-toggle">
        <label>
          <input
            type="checkbox"
            :checked="store.verboseMode"
            @change="toggleVerbose"
          />
          Verbose Logging
        </label>
      </div>

      <!-- Log Console -->
      <div class="log-console">
        <div v-for="log in store.logs" :key="log.id" class="log-entry">
          <span class="log-time">{{ log.timestamp }}</span>
          <span :class="`log-${log.type}`">{{ log.message }}</span>
        </div>
        <div v-if="store.logs.length === 0" class="log-empty">
          No logs yet...
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.debug-panel {
  margin-top: 20px;
  border-top: 2px solid var(--info-border);
  padding-top: 15px;
}

.debug-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 15px;
  background: var(--debug-toggle-bg);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  user-select: none;
}

.debug-toggle:hover {
  background: var(--debug-toggle-hover);
}

.debug-toggle-text {
  font-weight: 600;
  color: var(--text-tertiary);
  font-size: 14px;
}

.debug-toggle-icon {
  transition: transform 0.3s;
  font-size: 18px;
  color: var(--accent-primary);
}

.debug-toggle-icon.expanded {
  transform: rotate(180deg);
}

.debug-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease-out;
}

.debug-content.expanded {
  max-height: 800px;
}

.security-info {
  background: var(--section-bg);
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
  border: 2px solid var(--accent-tertiary);
}

.security-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--accent-tertiary);
}

.security-title {
  font-weight: 700;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-primary);
}

.security-badge {
  background: linear-gradient(135deg, #ef5350 0%, #e53935 100%);
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.security-badge.active {
  background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
}

.security-badge.warning {
  background: linear-gradient(135deg, #ffa726 0%, #fb8c00 100%);
}

.security-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 13px;
}

.security-label {
  font-weight: 600;
  color: var(--text-secondary);
}

.security-value {
  font-weight: 700;
  color: var(--text-primary);
  font-family: monospace;
  font-size: 12px;
}

.verbose-toggle {
  margin: 15px 0;
  text-align: right;
}

.verbose-toggle label {
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
}

.log-console {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 15px;
  border-radius: 8px;
  font-family: "Courier New", monospace;
  font-size: 13px;
  max-height: 300px;
  overflow-y: auto;
  margin-top: 15px;
}

.log-entry {
  margin: 5px 0;
  padding: 3px 0;
  border-bottom: 1px solid #333;
}

.log-time {
  color: #858585;
  margin-right: 10px;
}

.log-info {
  color: #4fc3f7;
}
.log-success {
  color: #81c784;
}
.log-warn {
  color: #ffb74d;
}
.log-error {
  color: #e57373;
}

.log-empty {
  color: #666;
  font-style: italic;
  text-align: center;
  padding: 20px;
}
</style>
