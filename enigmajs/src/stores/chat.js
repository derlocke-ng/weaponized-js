/**
 * Chat Store - Pinia store for EnigmaJS chat state
 * This replaces AppController's state management
 */
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const useChatStore = defineStore("chat", () => {
  // === STATE (was in AppController) ===

  // User info
  const username = ref("");
  const isUsernameSet = ref(false);

  // App mode
  const currentMode = ref(null); // 'host' | 'join' | null
  const currentView = ref("username"); // 'username' | 'mode-select' | 'chat'

  // Connection state
  const status = ref("disconnected"); // 'disconnected' | 'connecting' | 'waiting' | 'connected'
  const isConnected = ref(false);
  const isHost = ref(false);
  const roomId = ref("");
  const peerId = ref("");

  // Chat data
  const messages = ref([]);
  const users = ref([]); // { peerId, username, color }

  // UI state
  const darkMode = ref(false);
  const verboseMode = ref(false);
  const logs = ref([]);
  const debugPanelOpen = ref(false);

  // Security info
  const isEncrypted = ref(false);

  // Network quality
  const networkQuality = ref("unknown"); // 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
  const networkLatency = ref(null);

  // === COMPUTED ===

  const userCount = computed(() => users.value.length + 1); // +1 for self
  const messageCount = computed(() => messages.value.length);

  const statusText = computed(() => {
    const texts = {
      disconnected: "❌ Disconnected",
      connecting: "🔄 Connecting...",
      waiting: "⏳ Waiting for peer...",
      connected: "✅ Connected!",
    };
    return texts[status.value] || status.value;
  });

  const securityBadgeText = computed(() => {
    if (status.value === "connected" && isEncrypted.value) return "ENCRYPTED";
    if (status.value === "connected") return "NOT ENCRYPTED";
    if (status.value === "connecting" || status.value === "waiting")
      return "CONNECTING...";
    return "NOT CONNECTED";
  });

  // === ACTIONS ===

  function setUsername(name) {
    username.value = name;
    isUsernameSet.value = true;
    currentView.value = "mode-select";
  }

  function setMode(mode) {
    currentMode.value = mode;
    currentView.value = "chat";
  }

  // Error state
  const errorMessage = ref(null);
  const errorType = ref(null); // 'error', 'warning', 'info'
  let errorTimeout = null;

  function showError(message, type = "error", duration = 5000) {
    // Map technical errors to friendly messages
    const friendlyMessages = {
      "Room is full":
        "🚫 Room is full! Try again later or ask the host to increase the limit.",
      "Password required": "🔐 This room requires a password to join.",
      "Wrong password": "❌ Incorrect password. Please check and try again.",
      "Connection failed":
        "📡 Connection failed. Check your internet and try again.",
      Kicked: "👢 You were kicked from this room.",
      "Room destroyed": "💀 The host has closed this room.",
      Timeout: "⏱️ Connection timed out. The host may be offline.",
      "Host disconnected": "🔌 The host has disconnected.",
    };

    // Check if message contains any of the keys
    let friendlyMsg = message;
    for (const [key, value] of Object.entries(friendlyMessages)) {
      if (message.toLowerCase().includes(key.toLowerCase())) {
        friendlyMsg = value;
        break;
      }
    }

    errorMessage.value = friendlyMsg;
    errorType.value = type;

    // Auto-hide after duration
    if (errorTimeout) clearTimeout(errorTimeout);
    if (duration > 0) {
      errorTimeout = setTimeout(() => {
        clearError();
      }, duration);
    }
  }

  function clearError() {
    errorMessage.value = null;
    errorType.value = null;
    if (errorTimeout) {
      clearTimeout(errorTimeout);
      errorTimeout = null;
    }
  }

  function setStatus(newStatus, errorMsg = null) {
    status.value = newStatus;
    if (newStatus === "connected") {
      isConnected.value = true;
      clearError(); // Clear any previous errors on successful connect
    } else if (newStatus === "disconnected") {
      isConnected.value = false;
      if (errorMsg) {
        showError(errorMsg);
      }
    }
  }

  function setRoomInfo(newRoomId, newPeerId, hostStatus) {
    roomId.value = newRoomId;
    peerId.value = newPeerId;
    isHost.value = hostStatus;
  }

  function addMessage(msg) {
    messages.value.push({
      id: Date.now() + Math.random(),
      ...msg,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    });
  }

  function updateUsers(userList) {
    users.value = userList;
  }

  function addLog(log) {
    logs.value.push({
      id: Date.now(),
      timestamp: log.timestamp || new Date().toLocaleTimeString(),
      message: log.message,
      type: log.type || "info",
    });
    // Keep only last 100 entries
    if (logs.value.length > 100) {
      logs.value = logs.value.slice(-100);
    }
  }

  function toggleDarkMode() {
    darkMode.value = !darkMode.value;
    localStorage.setItem("darkMode", darkMode.value);
    document.body.classList.toggle("dark-mode", darkMode.value);
  }

  function loadDarkMode() {
    darkMode.value = localStorage.getItem("darkMode") === "true";
    document.body.classList.toggle("dark-mode", darkMode.value);
  }

  function setEncrypted(encrypted) {
    isEncrypted.value = encrypted;
  }

  function setNetworkQuality(quality, latency) {
    networkQuality.value = quality;
    networkLatency.value = latency;
  }

  // Invite link handling
  const inviteRoomId = ref(null);

  function setInviteRoomId(roomId) {
    inviteRoomId.value = roomId;
  }

  function clearInviteRoomId() {
    inviteRoomId.value = null;
    // Clear URL param without reload
    const url = new URL(window.location);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
  }

  function reset() {
    currentMode.value = null;
    currentView.value = "username";
    status.value = "disconnected";
    isConnected.value = false;
    isHost.value = false;
    roomId.value = "";
    messages.value = [];
    users.value = [];
    logs.value = [];
    isEncrypted.value = false;
    inviteRoomId.value = null;
    networkQuality.value = "unknown";
    networkLatency.value = null;
    clearError();
  }

  return {
    // State
    username,
    isUsernameSet,
    currentMode,
    currentView,
    status,
    isConnected,
    isHost,
    roomId,
    peerId,
    messages,
    users,
    darkMode,
    verboseMode,
    logs,
    debugPanelOpen,
    isEncrypted,
    inviteRoomId,
    errorMessage,
    errorType,
    networkQuality,
    networkLatency,

    // Computed
    userCount,
    messageCount,
    statusText,
    securityBadgeText,

    // Actions
    setUsername,
    setMode,
    setStatus,
    setRoomInfo,
    addMessage,
    updateUsers,
    addLog,
    toggleDarkMode,
    loadDarkMode,
    setEncrypted,
    setNetworkQuality,
    setInviteRoomId,
    clearInviteRoomId,
    showError,
    clearError,
    reset,
  };
});
