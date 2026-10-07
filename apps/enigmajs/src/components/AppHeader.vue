<script setup>
import { ref, onMounted } from "vue";
import { useChatStore } from "../stores/chat";
import { useEnigma } from "../composables/useEnigma";
import AboutModal from "./AboutModal.vue";

const store = useChatStore();
const aboutModal = ref(null);

function openAbout() {
  aboutModal.value?.open();
}
const { requestNotificationPermission } = useEnigma();

const notificationStatus = ref("default");

onMounted(() => {
  if ("Notification" in window) {
    notificationStatus.value = Notification.permission;
  } else {
    notificationStatus.value = "unsupported";
  }
});

async function toggleNotifications() {
  if (notificationStatus.value === "granted") {
    // Can't revoke programmatically, just inform user
    alert("To disable notifications, use your browser settings.");
    return;
  }
  const result = await requestNotificationPermission();
  notificationStatus.value = result;
}
</script>

<template>
  <div class="header-row">
    <div></div>
    <div class="header-center">
      <a href="./" class="logo-link" title="Reload EnigmaJS">
        <h1>🔐 EnigmaJS</h1>
      </a>
    </div>
    <div class="header-right">
      <button
        v-if="notificationStatus !== 'unsupported'"
        class="header-btn"
        :class="{ active: notificationStatus === 'granted' }"
        @click="toggleNotifications"
        :title="
          notificationStatus === 'granted'
            ? 'Notifications enabled'
            : 'Enable notifications'
        "
      >
        <svg
          v-if="notificationStatus === 'granted'"
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        <svg
          v-else
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
      <button
        class="header-btn"
        @click="store.toggleDarkMode()"
        title="Toggle Dark Mode"
      >
        <svg
          v-if="store.darkMode"
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
        <svg
          v-else
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
      <button class="header-btn" @click="openAbout" title="About EnigmaJS">
        <svg
          class="icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
    </div>
  </div>
  <p class="subtitle">Private chat that leaves no trace</p>

  <AboutModal ref="aboutModal" />
</template>

<style scoped>
.header-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  margin-bottom: 10px;
  gap: 10px;
}

.header-center {
  grid-column: 2;
  text-align: center;
}

.header-right {
  grid-column: 3;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.header-btn {
  background: var(--btn-secondary-bg);
  border: 2px solid var(--input-border);
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.header-btn:hover {
  background: var(--btn-secondary-hover);
  transform: translateY(-2px);
  color: var(--accent-primary);
}

.header-btn.active {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.header-btn .icon {
  width: 22px;
  height: 22px;
}

.logo-link {
  text-decoration: none;
  color: inherit;
  cursor: pointer;
  display: inline-block;
  transition: transform 0.2s;
}

.logo-link:hover {
  transform: scale(1.05);
}

h1 {
  text-align: center;
  background: linear-gradient(
    135deg,
    var(--accent-primary) 0%,
    var(--accent-secondary) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0;
  font-size: 2.5em;
  font-weight: 900;
  letter-spacing: -1px;
  text-transform: uppercase;
}

.subtitle {
  text-align: center;
  color: var(--text-secondary);
  margin-bottom: 30px;
  font-size: 1em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}
</style>
