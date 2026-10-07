<script setup>
import { onMounted } from "vue";
import { useChatStore } from "../stores/chat";
import PublicRoomList from "./PublicRoomList.vue";

const store = useChatStore();

function selectMode(mode) {
  store.setMode(mode);
}

function handleJoinPublicRoom(roomId) {
  store.setInviteRoomId(roomId);
  selectMode("join");
}

// Auto-select join mode if we have an invite link
onMounted(() => {
  if (store.inviteRoomId) {
    selectMode("join");
  }
});
</script>

<template>
  <div class="mode-selector-wrapper">
    <div v-if="store.inviteRoomId" class="invite-notice">
      <span class="invite-icon">🔗</span>
      <span
        >You've been invited to join room
        <strong>{{ store.inviteRoomId }}</strong></span
      >
    </div>

    <div class="mode-buttons">
      <button class="btn-primary" @click="selectMode('host')">
        🏠 Host Room
      </button>
      <button
        class="btn-primary"
        :class="{ highlighted: store.inviteRoomId }"
        @click="selectMode('join')"
      >
        📱 Join Room
      </button>
    </div>

    <!-- Public Rooms List -->
    <PublicRoomList @join-room="handleJoinPublicRoom" />
  </div>
</template>

<style scoped>
.mode-selector-wrapper {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mode-buttons {
  display: flex;
  gap: 15px;
  justify-content: center;
  flex-wrap: wrap;
}

.invite-notice {
  width: 100%;
  text-align: center;
  padding: 12px;
  background: linear-gradient(
    135deg,
    rgba(255, 107, 53, 0.1),
    rgba(255, 140, 66, 0.1)
  );
  border: 1px solid var(--accent-primary);
  border-radius: 8px;
  margin-bottom: 10px;
  color: var(--text-primary);
}

.invite-icon {
  margin-right: 8px;
}

.btn-primary {
  padding: 14px 28px;
  border: none;
  border-radius: 12px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-family: "Barlow", sans-serif;
  background: linear-gradient(
    135deg,
    var(--accent-primary) 0%,
    var(--accent-secondary) 100%
  );
  color: white;
  box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);
}

.btn-primary:hover {
  transform: translateY(-3px);
  box-shadow: 0 6px 20px rgba(255, 107, 53, 0.4);
}

.btn-primary.highlighted {
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);
  }
  50% {
    box-shadow: 0 4px 25px rgba(255, 107, 53, 0.6);
  }
}
</style>
