<script setup>
import { onMounted } from "vue";
import { useChatStore } from "./stores/chat";
import UsernameSetup from "./components/UsernameSetup.vue";
import ModeSelector from "./components/ModeSelector.vue";
import ChatRoom from "./components/ChatRoom.vue";
import AppHeader from "./components/AppHeader.vue";
import ErrorToast from "./components/ErrorToast.vue";

const store = useChatStore();

onMounted(() => {
  store.loadDarkMode();

  // Check URL for room ID to auto-join
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get("room");
  if (roomParam) {
    store.setInviteRoomId(roomParam);
  }
});
</script>

<template>
  <div class="container">
    <AppHeader />
    <ErrorToast />

    <div class="intro-box">
      <p>
        <strong>🔒 Private & Secure:</strong> End-to-end encrypted messaging
        with no data stored anywhere.
        <br />
        <strong>🌐 Decentralized:</strong> Powered by community-hosted Gun.js
        relay nodes.
      </p>
    </div>

    <!-- Step 1: Enter username -->
    <UsernameSetup v-if="store.currentView === 'username'" />

    <!-- Step 2: Select mode (host or join) -->
    <ModeSelector v-if="store.currentView === 'mode-select'" />

    <!-- Step 3: Chat room -->
    <ChatRoom v-if="store.currentView === 'chat'" />
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  width: 100%;
  margin: 40px auto;
  background: var(--container-bg);
  border-radius: 20px;
  box-shadow: 0 20px 60px var(--shadow-color);
  padding: 30px 20px;
  min-height: 80vh;
  transition: background 0.3s ease;
  border: 2px solid var(--accent-tertiary);
}

.intro-box {
  text-align: center;
  margin-bottom: 30px;
  padding: 15px;
  background: var(--section-bg);
  border-radius: 8px;
}

.intro-box p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.95em;
}
</style>
