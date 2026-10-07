<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from "vue";
import { useChatStore } from "../stores/chat";
import { useEnigma } from "../composables/useEnigma";
import StatusBadge from "./StatusBadge.vue";
import UserList from "./UserList.vue";
import ChatMessages from "./ChatMessages.vue";
import DebugPanel from "./DebugPanel.vue";

const store = useChatStore();
const enigma = useEnigma();

// Join mode state
const roomIdInput = ref("");
const roomPasswordInput = ref(""); // Password for joining protected rooms
const showJoinInput = ref(true);

// QR code element refs
const qrCodeReady = ref(false);

// QR Scanner state
const videoElement = ref(null);
const fileInput = ref(null);
const isScanning = ref(false);

// Room settings (host only)
const showShareRoom = ref(false);
const showRoomSettings = ref(false);
const hostPassword = ref("");
const hostMaxUsers = ref(10);
const hostIsPublic = ref(false);
const hostRoomName = ref("");

// Copy feedback
const copiedLink = ref(false);
const copiedId = ref(false);

// User list sync interval for non-hosts
let userListSyncInterval = null;

onMounted(async () => {
  if (store.currentMode === "host") {
    await initHost();
  } else if (store.currentMode === "join" && store.inviteRoomId) {
    // Auto-fill room ID from invite link
    roomIdInput.value = store.inviteRoomId;
    store.clearInviteRoomId();
  }
});

onUnmounted(() => {
  // Clean up scanner if active
  if (isScanning.value && videoElement.value) {
    enigma.stopQRScanner(videoElement.value);
  }
  // Clean up user list sync interval
  if (userListSyncInterval) {
    clearInterval(userListSyncInterval);
    userListSyncInterval = null;
  }
});

// Start periodic user list sync when connected as non-host
watch(
  () => store.isConnected,
  (isConnected) => {
    if (isConnected && !store.isHost) {
      // Start periodic sync every 30 seconds
      userListSyncInterval = setInterval(() => {
        if (store.isConnected && !store.isHost) {
          enigma.requestUserListSync();
        }
      }, 30000);
    } else {
      // Clear interval when disconnected or became host
      if (userListSyncInterval) {
        clearInterval(userListSyncInterval);
        userListSyncInterval = null;
      }
    }
  },
);

async function initHost() {
  await enigma.initHost();
  // Open share room panel by default for hosts
  showShareRoom.value = true;
  // Generate QR code after panel opens
  nextTick(() => {
    setTimeout(() => {
      enigma.generateQR("qrcode", store.roomId);
    }, 50);
  });
}

async function connectManual() {
  const roomId = roomIdInput.value.trim();
  if (!roomId) {
    alert("Please enter a room ID");
    return;
  }
  showJoinInput.value = false;
  const password = roomPasswordInput.value.trim() || null;
  await enigma.connectToRoom(roomId, password);
}

function copyRoomId() {
  navigator.clipboard
    .writeText(store.roomId)
    .then(() => {
      copiedId.value = true;
      setTimeout(() => (copiedId.value = false), 2000);
    })
    .catch((err) => {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = store.roomId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      copiedId.value = true;
      setTimeout(() => (copiedId.value = false), 2000);
    });
}

function copyShareLink() {
  const url = new URL(window.location.href);
  url.search = ""; // Clear existing params
  url.searchParams.set("room", store.roomId);
  const shareUrl = url.toString();

  navigator.clipboard
    .writeText(shareUrl)
    .then(() => {
      copiedLink.value = true;
      setTimeout(() => (copiedLink.value = false), 2000);
    })
    .catch((err) => {
      // Fallback for older browsers
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      copiedLink.value = true;
      setTimeout(() => (copiedLink.value = false), 2000);
    });
}

// QR Scanner functions
async function startCameraScanner() {
  if (!videoElement.value) return;

  try {
    isScanning.value = true;
    await enigma.startQRScanner(videoElement.value, handleQRScanned);
  } catch (err) {
    isScanning.value = false;
    alert("Could not access camera: " + err.message);
  }
}

function stopCameraScanner() {
  if (videoElement.value) {
    enigma.stopQRScanner(videoElement.value);
  }
  isScanning.value = false;
}

function triggerFileUpload() {
  if (fileInput.value) {
    fileInput.value.click();
  }
}

function handleFileSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  enigma.scanQRFromImage(file, handleQRScanned);

  // Reset file input so same file can be selected again
  event.target.value = "";
}

function handleQRScanned(roomId) {
  isScanning.value = false;
  // If password field has a value, use it
  const password = roomPasswordInput.value.trim() || null;
  showJoinInput.value = false;
  enigma.connectToRoom(roomId, password);
}

// Room settings functions (host only)
function toggleShareRoom() {
  showShareRoom.value = !showShareRoom.value;
  // Generate QR code when panel opens
  if (showShareRoom.value && store.roomId) {
    nextTick(() => {
      setTimeout(() => {
        enigma.generateQR("qrcode", store.roomId);
      }, 50);
    });
  }
}

function toggleRoomSettings() {
  showRoomSettings.value = !showRoomSettings.value;
  if (showRoomSettings.value) {
    // Load current values
    hostPassword.value = enigma.getRoomPassword() || "";
    hostMaxUsers.value = enigma.getMaxUsers();
    const visibility = enigma.getRoomVisibility();
    hostIsPublic.value = visibility.isPublic;
    hostRoomName.value = visibility.roomName || "";
  }
}

function applyRoomPassword() {
  enigma.setRoomPassword(hostPassword.value.trim() || null);
}

function applyMaxUsers() {
  const max = parseInt(hostMaxUsers.value, 10);
  if (max >= 1 && max <= 256) {
    enigma.setMaxUsers(max);
  }
}

function applyRoomVisibility() {
  enigma.setRoomVisibility(
    hostIsPublic.value,
    hostIsPublic.value ? hostRoomName.value.trim() || null : null,
  );
}

function handleDestroyRoom() {
  if (
    confirm(
      "Are you sure you want to destroy this room? All users will be kicked.",
    )
  ) {
    enigma.destroyRoom();
  }
}

function handleLeaveRoom() {
  if (confirm("Are you sure you want to leave this room?")) {
    enigma.leaveRoom();
  }
}

// Use store.isHost for dynamic host status (changes on promote/demote)
const isHostMode = computed(() => store.isHost);
const isJoinMode = computed(() => store.currentMode === "join");
const showHostControls = computed(() => store.isHost && store.roomId);
</script>

<template>
  <div class="section">
    <h2>
      {{ store.isHost ? "Host Mode" : "Join Mode" }}
      {{ store.isHost && store.currentMode === "join" ? "(promoted)" : "" }}
    </h2>

    <StatusBadge />

    <!-- Host Controls: Show Room ID & QR (shown to whoever is host) -->
    <div v-if="showHostControls" class="room-info">
      <!-- Share Room Toggle -->
      <button
        class="btn-secondary full-width room-settings-toggle"
        @click="toggleShareRoom"
      >
        📤 Share Room {{ showShareRoom ? "▲" : "▼" }}
      </button>

      <!-- Share Room Panel -->
      <div v-if="showShareRoom" class="share-room-panel">
        <p>Your Room ID:</p>
        <div class="peer-id">{{ store.roomId }}</div>
        <div class="copy-buttons">
          <button class="btn-secondary" @click="copyRoomId">
            {{ copiedId ? "✓ Copied!" : "📋 Copy ID" }}
          </button>
          <button class="btn-secondary" @click="copyShareLink">
            {{ copiedLink ? "✓ Copied!" : "🔗 Copy Link" }}
          </button>
        </div>
        <p class="qr-hint">Scan this QR code to connect:</p>
        <div id="qrcode" class="qr-container"></div>
      </div>

      <!-- Room Settings Toggle -->
      <button
        class="btn-secondary full-width room-settings-toggle"
        @click="toggleRoomSettings"
      >
        ⚙️ Room Settings {{ showRoomSettings ? "▲" : "▼" }}
      </button>

      <!-- Room Settings Panel -->
      <div v-if="showRoomSettings" class="room-settings">
        <div class="setting-row visibility-row">
          <label class="toggle-label">
            <input
              type="checkbox"
              v-model="hostIsPublic"
              @change="applyRoomVisibility"
              class="toggle-checkbox"
            />
            <span class="toggle-slider"></span>
            <span class="toggle-text">{{
              hostIsPublic ? "🌐 Public" : "🔒 Private"
            }}</span>
          </label>
        </div>
        <div v-if="hostIsPublic" class="setting-row">
          <label>Room Name:</label>
          <input
            v-model="hostRoomName"
            type="text"
            placeholder="My Awesome Room"
            class="setting-input"
            @blur="applyRoomVisibility"
          />
        </div>
        <div class="setting-row">
          <label>Room Password:</label>
          <input
            v-model="hostPassword"
            type="password"
            placeholder="Leave empty for no password"
            class="setting-input"
          />
          <button class="btn-small" @click="applyRoomPassword">
            {{ hostPassword ? "Set" : "Clear" }}
          </button>
        </div>
        <div class="setting-row">
          <label>Max Users (1-256):</label>
          <input
            v-model="hostMaxUsers"
            type="number"
            min="1"
            max="256"
            class="setting-input setting-input-small"
          />
          <button class="btn-small" @click="applyMaxUsers">Apply</button>
        </div>
        <div class="setting-row destroy-row">
          <button class="btn-danger full-width" @click="handleDestroyRoom">
            💀 Destroy Room (kick all & close)
          </button>
        </div>
      </div>
    </div>

    <!-- Join Mode: Input Room ID -->
    <div v-if="isJoinMode && showJoinInput" class="join-input-section">
      <div class="input-group">
        <p class="input-label">Enter Host Room ID:</p>
        <input
          v-model="roomIdInput"
          type="text"
          placeholder="Paste room ID here"
          class="room-input"
          @keypress.enter="connectManual"
        />
        <p class="input-label">Room Password (if required):</p>
        <input
          v-model="roomPasswordInput"
          type="password"
          placeholder="Leave empty if no password"
          class="room-input"
          @keypress.enter="connectManual"
        />
        <button class="btn-primary full-width" @click="connectManual">
          Connect
        </button>
      </div>

      <div class="divider">— OR —</div>

      <div class="qr-options">
        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleFileSelected"
        />
        <button class="btn-secondary" @click="triggerFileUpload">
          📁 Upload QR Image
        </button>
        <button
          v-if="!isScanning"
          class="btn-secondary"
          @click="startCameraScanner"
        >
          📷 Scan with Camera
        </button>
        <button
          v-else
          class="btn-secondary btn-danger"
          @click="stopCameraScanner"
        >
          ⏹️ Stop Camera
        </button>
      </div>

      <!-- Camera video preview -->
      <video
        ref="videoElement"
        autoplay
        playsinline
        class="camera-preview"
        style="display: none"
      ></video>
      <p v-if="isScanning" class="scan-hint">🎯 Point camera at QR code...</p>
    </div>

    <!-- User List (shown when connected) -->
    <UserList v-if="store.isConnected" />

    <!-- Leave Room button (non-host only, when connected) -->
    <div v-if="store.isConnected && !store.isHost" class="leave-room-section">
      <button class="btn-secondary btn-leave" @click="handleLeaveRoom">
        🚪 Leave Room
      </button>
    </div>

    <!-- Chat Area (shown when connected) -->
    <ChatMessages v-if="store.isConnected" />

    <!-- Debug Panel -->
    <DebugPanel />
  </div>
</template>

<style scoped>
.section {
  padding: 24px;
  background: var(--section-bg);
  border-radius: 16px;
  border: 2px solid var(--accent-tertiary);
}

h2 {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--accent-primary);
  margin-bottom: 15px;
}

.room-info {
  margin-top: 15px;
}

.peer-id {
  background: var(--peer-id-bg);
  padding: 10px;
  border-radius: 6px;
  margin: 10px 0;
  font-family: monospace;
  word-break: break-all;
  font-size: 14px;
}

.copy-buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.copy-buttons .btn-secondary {
  flex: 1;
  min-width: 0;
}

.qr-hint {
  margin-top: 15px;
  text-align: center;
  color: var(--text-secondary);
}

.qr-container {
  display: flex;
  justify-content: center;
  margin: 20px 0;
  padding: 20px;
  background: var(--qr-bg);
  border-radius: 12px;
  border: 2px solid var(--accent-tertiary);
}

.join-input-section {
  margin-top: 20px;
}

.input-group {
  margin-bottom: 20px;
}

.input-label {
  margin-bottom: 10px;
  font-weight: 600;
}

.room-input {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--input-border);
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  background: var(--input-bg);
  color: var(--text-primary);
  margin-bottom: 10px;
}

.room-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.divider {
  text-align: center;
  margin: 20px 0;
  color: var(--text-secondary);
}

.qr-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: center;
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

.btn-secondary {
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
  background: var(--btn-secondary-bg);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--btn-secondary-hover);
}

.btn-small {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 600;
  background: var(--btn-secondary-bg);
  color: var(--text-primary);
}

.btn-small:hover {
  background: var(--btn-secondary-hover);
}

.btn-danger {
  background: #ff6b6b;
  color: white;
}

.btn-danger:hover {
  background: #ee5a5a;
}

.full-width {
  width: 100%;
}

/* Room Settings */
.room-settings-toggle {
  margin-top: 15px;
}

.share-room-panel {
  margin-top: 15px;
  padding: 15px;
  background: var(--input-bg);
  border-radius: 12px;
  border: 1px solid var(--input-border);
  text-align: center;
}

.room-settings {
  margin-top: 15px;
  padding: 15px;
  background: var(--input-bg);
  border-radius: 12px;
  border: 1px solid var(--input-border);
}

.setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.setting-row:last-child {
  margin-bottom: 0;
}

.destroy-row {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid var(--input-border);
}

.setting-row label {
  flex-shrink: 0;
  font-weight: 600;
  font-size: 14px;
  min-width: 140px;
}

/* Mobile: stack setting rows vertically */
@media (max-width: 480px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }

  .setting-row label {
    min-width: auto;
    margin-bottom: 5px;
  }

  .setting-input {
    width: 100%;
  }

  .setting-input-small {
    max-width: 100%;
  }
}

.setting-input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
}

.setting-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.setting-input-small {
  max-width: 80px;
}

/* Toggle Switch */
.visibility-row {
  margin-bottom: 15px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--input-border);
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  min-width: auto !important;
}

.toggle-checkbox {
  display: none;
}

.toggle-slider {
  width: 48px;
  height: 26px;
  background: var(--input-border);
  border-radius: 13px;
  position: relative;
  transition: background 0.3s ease;
}

.toggle-slider::after {
  content: "";
  position: absolute;
  width: 22px;
  height: 22px;
  background: white;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-checkbox:checked + .toggle-slider {
  background: var(--accent-primary);
}

.toggle-checkbox:checked + .toggle-slider::after {
  transform: translateX(22px);
}

.toggle-text {
  font-weight: 600;
  font-size: 14px;
}

.camera-preview {
  width: 100%;
  max-width: 400px;
  border-radius: 12px;
  margin: 15px auto;
  display: block;
  border: 2px solid var(--accent-tertiary);
}

.scan-hint {
  text-align: center;
  color: var(--accent-primary);
  font-weight: 600;
  margin-top: 10px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.leave-room-section {
  margin-top: 15px;
  text-align: center;
}

.btn-leave {
  background: var(--btn-secondary-bg);
  color: #ff6b6b;
  border: 2px solid #ff6b6b;
}

.btn-leave:hover {
  background: rgba(255, 107, 107, 0.15);
}
</style>
