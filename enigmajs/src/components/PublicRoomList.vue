<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { useEnigma } from "../composables/useEnigma";

const emit = defineEmits(["join-room"]);
const enigma = useEnigma();

const rooms = ref([]);
const loading = ref(true);
const refreshing = ref(false);
const cooldown = ref(0);
const lastRefresh = ref(Date.now());
let gunInstance = null;
let refreshInterval = null;
let cooldownInterval = null;

async function fetchRooms() {
  // Clean up old listener
  if (gunInstance) {
    gunInstance.get("enigmajs-public-rooms").off();
  }

  gunInstance = await enigma.getPublicRooms((publicRooms) => {
    rooms.value = publicRooms.sort((a, b) => b.userCount - a.userCount);
    loading.value = false;
    refreshing.value = false;
    lastRefresh.value = Date.now();
  });
}

function manualRefresh() {
  if (cooldown.value > 0) return;

  refreshing.value = true;
  cooldown.value = 3;

  // Clear any existing cooldown
  if (cooldownInterval) clearInterval(cooldownInterval);

  cooldownInterval = setInterval(() => {
    cooldown.value--;
    if (cooldown.value <= 0) {
      clearInterval(cooldownInterval);
      cooldownInterval = null;
    }
  }, 1000);

  fetchRooms();
}

onMounted(async () => {
  await fetchRooms();

  // Show loading state briefly
  setTimeout(() => {
    loading.value = false;
  }, 3000);

  // Auto-refresh every 10 seconds
  refreshInterval = setInterval(() => {
    fetchRooms();
  }, 10000);
});

onUnmounted(() => {
  if (gunInstance) {
    gunInstance.get("enigmajs-public-rooms").off();
  }
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  if (cooldownInterval) {
    clearInterval(cooldownInterval);
  }
});

function joinRoom(room) {
  emit("join-room", room.roomId);
}

function formatTime(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 30) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}
</script>

<template>
  <div class="public-rooms">
    <div class="header-row">
      <h3>🌐 Public Rooms</h3>
      <button
        class="refresh-btn"
        @click="manualRefresh"
        :class="{ spinning: refreshing, disabled: cooldown > 0 }"
        :disabled="cooldown > 0"
      >
        <svg
          class="refresh-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        <span class="refresh-tooltip" v-if="cooldown === 0"
          >click to refresh</span
        >
        <span class="cooldown-badge" v-else>{{ cooldown }}</span>
      </button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <span>Searching for public rooms...</span>
    </div>

    <div v-else-if="rooms.length === 0" class="empty-state">
      <span class="empty-icon">🔍</span>
      <p>No public rooms available</p>
      <p class="hint">Be the first to host a public room!</p>
    </div>

    <div v-else class="room-list">
      <div
        v-for="room in rooms"
        :key="room.roomId"
        class="room-card"
        @click="joinRoom(room)"
      >
        <div class="room-header">
          <span class="room-name">{{ room.roomName || "Unnamed Room" }}</span>
          <span
            v-if="room.hasPassword"
            class="password-badge"
            title="Password protected"
            >🔐</span
          >
        </div>
        <div class="room-details">
          <div class="detail-row">
            <span class="detail-label">Host:</span>
            <span class="detail-value host-name">{{ room.hostName }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Users:</span>
            <span class="detail-value users-count"
              >{{ room.userCount }}/{{ room.maxUsers }}</span
            >
          </div>
        </div>
        <div class="room-footer">
          <span class="join-hint">Click to join</span>
          <span class="last-update">{{ formatTime(room.lastUpdate) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.public-rooms {
  margin-top: 20px;
  padding: 15px;
  background: var(--section-bg);
  border-radius: 12px;
  border: 1px solid var(--accent-tertiary);
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 15px;
}

h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.refresh-btn {
  position: relative;
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
  color: var(--accent-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.refresh-icon {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

.refresh-btn:hover:not(.disabled) {
  background: rgba(255, 140, 50, 0.1);
}

.refresh-btn:hover:not(.disabled) .refresh-icon {
  transform: rotate(-30deg);
}

.refresh-tooltip {
  font-size: 10px;
  color: var(--accent-primary);
  opacity: 0;
  transform: translateX(-5px);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.refresh-btn:hover:not(.disabled) .refresh-tooltip {
  opacity: 1;
  transform: translateX(0);
}

.cooldown-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  min-width: 14px;
}

.refresh-btn.disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.refresh-btn.spinning .refresh-icon {
  animation: spin 0.8s linear infinite;
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  color: var(--text-secondary);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--accent-tertiary);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  text-align: center;
  padding: 20px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 32px;
  display: block;
  margin-bottom: 10px;
}

.empty-state p {
  margin: 5px 0;
}

.hint {
  font-size: 12px;
  opacity: 0.7;
}

.room-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;
}

.room-card {
  padding: 12px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.room-card:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 2px 8px rgba(255, 107, 53, 0.2);
}

.room-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.room-name {
  font-weight: 700;
  color: var(--text-primary);
  flex: 1;
  font-size: 15px;
}

.password-badge {
  font-size: 14px;
}

.room-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.detail-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.detail-label {
  color: var(--text-secondary);
  min-width: 45px;
}

.detail-value {
  color: var(--text-primary);
  font-weight: 500;
}

.host-name {
  color: var(--accent-secondary);
}

.users-count {
  color: var(--accent-primary);
  font-weight: 600;
}

.room-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.7;
  margin-top: 6px;
}

.join-hint {
  color: var(--accent-primary);
  font-weight: 500;
  opacity: 0;
  transition: opacity 0.2s;
}

.room-card:hover .join-hint {
  opacity: 1;
}
</style>
