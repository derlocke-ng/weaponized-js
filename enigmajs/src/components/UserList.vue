<script setup>
import { useChatStore } from "../stores/chat";
import { useEnigma } from "../composables/useEnigma";

const store = useChatStore();
const enigma = useEnigma();

function handleKick(peerId) {
  const user = store.users.find((u) => u.peerId === peerId);
  const username = user ? user.username : "User";

  if (confirm(`Kick ${username} from the room?`)) {
    enigma.kickUser(peerId);
  }
}

function handlePromote(peerId) {
  const user = store.users.find((u) => u.peerId === peerId);
  const username = user ? user.username : "User";

  if (
    confirm(`Make ${username} the new host? You will lose host privileges.`)
  ) {
    enigma.promoteUser(peerId);
  }
}
</script>

<template>
  <div class="user-list-panel">
    <div class="user-list-header">
      <span class="user-list-title">👥 Connected Users</span>
      <span class="user-count">{{ store.userCount }}</span>
    </div>

    <div class="user-list">
      <!-- Self (always first) -->
      <div class="user-item">
        <div
          class="user-color-dot"
          :style="{ backgroundColor: enigma.getOwnColor() }"
        ></div>
        <span class="user-name">{{ store.username }}</span>
        <span class="user-badge">You</span>
      </div>

      <!-- Other users -->
      <div v-for="user in store.users" :key="user.peerId" class="user-item">
        <div
          class="user-color-dot"
          :style="{ backgroundColor: user.color }"
        ></div>
        <span class="user-name">{{ user.username }}</span>

        <!-- Host controls -->
        <template v-if="store.isHost">
          <button
            class="user-promote-btn"
            title="Make Host"
            @click="handlePromote(user.peerId)"
          >
            👑
          </button>
          <button
            class="user-kick-btn"
            title="Kick User"
            @click="handleKick(user.peerId)"
          >
            ✕
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-list-panel {
  background: var(--section-bg);
  border-radius: 12px;
  padding: 16px;
  margin-top: 20px;
  border: 2px solid var(--accent-tertiary);
}

.user-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--accent-tertiary);
}

.user-list-title {
  font-weight: 700;
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--accent-primary);
}

.user-count {
  background: linear-gradient(
    135deg,
    var(--accent-primary) 0%,
    var(--accent-secondary) 100%
  );
  color: white;
  padding: 4px 12px;
  border-radius: 20px;
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: var(--input-bg);
  transition: transform 0.2s;
}

.user-item:hover {
  transform: translateX(4px);
}

.user-color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  flex-shrink: 0;
  border: 2px solid var(--container-bg);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.user-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
  flex: 1;
}

.user-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 12px;
  background: var(--peer-id-bg);
  color: var(--text-secondary);
  font-weight: 600;
  text-transform: uppercase;
}

.user-kick-btn {
  background: #ef5350;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  text-transform: uppercase;
}

.user-kick-btn:hover {
  background: #e53935;
  transform: scale(1.05);
}

.user-promote-btn {
  background: var(--accent-primary);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
  text-transform: uppercase;
  margin-right: 4px;
}

.user-promote-btn:hover {
  background: var(--accent-secondary);
  transform: scale(1.05);
}
</style>
