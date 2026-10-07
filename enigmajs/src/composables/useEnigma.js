/**
 * useEnigma Composable - EnigmaJS integration for Vue
 * This replaces the EnigmaJS-related logic from AppController
 */
import { ref, onUnmounted } from "vue";
import { useChatStore } from "../stores/chat";

// We'll load EnigmaJS dynamically since it needs Gun.js from CDN
let EnigmaJS = null;

// SHARED STATE - must be outside the function so all components share it!
const enigmaInstance = ref(null);
let audioContext = null;

export function useEnigma() {
  const store = useChatStore();

  /**
   * Initialize EnigmaJS class (lazy load)
   */
  async function loadEnigmaJS() {
    if (EnigmaJS) return EnigmaJS;

    // Import the EnigmaJS module
    const module = await import("../lib/enigmajs.js");
    EnigmaJS = module.EnigmaJS;
    return EnigmaJS;
  }

  /**
   * Create EnigmaJS instance with Vue callbacks
   */
  async function createInstance(username) {
    await loadEnigmaJS();

    enigmaInstance.value = new EnigmaJS({
      username: username,

      onLog: (log) => {
        store.addLog(log);
      },

      onStatusChange: (status, error) => {
        store.setStatus(status, error);

        // Update encryption status when connected
        if (status === "connected" && enigmaInstance.value?.sharedSecret) {
          store.setEncrypted(true);
        }
      },

      onConnection: (info) => {
        if (info.type === "host-ready") {
          store.addLog({
            message: "Host ready, waiting for peer...",
            type: "success",
          });
        }
      },

      onConnectionInfo: (info) => {
        store.setRoomInfo(
          info.roomId,
          enigmaInstance.value?.peerId,
          info.isHost,
        );
        updateUserList();
      },

      onMessageReceived: (msg) => {
        store.addMessage({
          username: msg.username,
          message: msg.message,
          color: msg.color,
          isSent: false,
        });
        playNotificationSound();
        showBrowserNotification(msg.username, msg.message);
      },

      onPromoted: () => {
        store.isHost = true;
        store.addLog({ message: "You are now the host!", type: "success" });
        // Update user list to refresh UI with host controls
        updateUserList();
        // Generate QR code for the new host (after DOM updates)
        setTimeout(() => {
          generateQR("qrcode", store.roomId);
        }, 200);
      },

      onNetworkQualityChange: (quality, latency) => {
        store.setNetworkQuality(quality, latency);
      },
    });

    return enigmaInstance.value;
  }

  /**
   * Initialize as host
   */
  async function initHost() {
    const instance = await createInstance(store.username);
    await instance.initHost();

    store.setRoomInfo(instance.roomId, instance.peerId, true);
    instance.setVerbose(store.verboseMode);

    return instance.roomId;
  }

  /**
   * Connect to a room as client
   * @param {string} roomId - Room ID to connect to
   * @param {string} [password] - Optional room password
   */
  async function connectToRoom(roomId, password = null) {
    const instance = await createInstance(store.username);
    instance.connectToPeer(roomId, password);
    instance.setVerbose(store.verboseMode);
  }

  /**
   * Set room password (host only)
   * @param {string|null} password - Password to set, or null to remove
   */
  async function setRoomPassword(password) {
    if (!enigmaInstance.value) return;
    await enigmaInstance.value.setRoomPassword(password);
  }

  /**
   * Set maximum users (host only)
   * @param {number} max - Maximum number of users (1-256)
   */
  function setMaxUsers(max) {
    if (!enigmaInstance.value) return;
    enigmaInstance.value.setMaxUsers(max);
  }

  /**
   * Get current room password (host only)
   */
  function getRoomPassword() {
    if (!enigmaInstance.value) return null;
    return enigmaInstance.value.roomPassword;
  }

  /**
   * Get current max users setting
   */
  function getMaxUsers() {
    if (!enigmaInstance.value) return 10;
    return enigmaInstance.value.maxUsers;
  }

  /**
   * Set room visibility (host only)
   * @param {boolean} isPublic - Whether the room is public
   * @param {string|null} roomName - Optional room name for public listing
   */
  function setRoomVisibility(isPublic, roomName = null) {
    if (!enigmaInstance.value) return;
    enigmaInstance.value.setRoomVisibility(isPublic, roomName);
  }

  /**
   * Get room visibility settings
   */
  function getRoomVisibility() {
    if (!enigmaInstance.value) return { isPublic: false, roomName: null };
    return {
      isPublic: enigmaInstance.value.isPublic,
      roomName: enigmaInstance.value.roomName,
    };
  }

  /**
   * Get list of public rooms
   * @param {Function} callback - Called with array of public rooms
   * @returns {Object} Gun instance (call .off() to stop listening)
   */
  async function getPublicRooms(callback) {
    await loadEnigmaJS();
    return EnigmaJS.getPublicRooms(callback);
  }

  /**
   * Destroy the room - kick everyone and disconnect (host only)
   */
  function destroyRoom() {
    if (!enigmaInstance.value?.isHost) return;

    // Send room-destroyed notification to all peers before kicking
    if (enigmaInstance.value.room) {
      const destroyMsg = {
        id: enigmaInstance.value.generateId(),
        type: "room-destroyed",
        sender: enigmaInstance.value.peerId,
        timestamp: Date.now(),
      };
      enigmaInstance.value.room
        .get("messages")
        .get(destroyMsg.id)
        .put(destroyMsg);
    }

    // Kick all users (no rekey needed since room is being destroyed)
    const peersToKick = [...enigmaInstance.value.peers];
    for (const peerId of peersToKick) {
      // Direct kick without rekey for destroy
      enigmaInstance.value.kickedUsers.add(peerId);
      const kickMsg = {
        id: enigmaInstance.value.generateId(),
        type: "kick",
        sender: enigmaInstance.value.peerId,
        target: peerId,
        timestamp: Date.now(),
      };
      enigmaInstance.value.room.get("messages").get(kickMsg.id).put(kickMsg);
    }

    // Reset local state
    store.addLog({ message: "Room destroyed", type: "warn" });
    store.reset();
    enigmaInstance.value = null;
  }

  /**
   * Leave the room gracefully (non-host only)
   */
  async function leaveRoom() {
    if (!enigmaInstance.value) return;

    // Send user-left message before disconnecting
    await enigmaInstance.value.sendUserLeft();

    // Small delay to ensure message is sent
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Reset local state
    store.addLog({ message: "You left the room", type: "info" });
    store.reset();
    enigmaInstance.value = null;
  }

  /**
   * Request user list sync from host (for non-hosts)
   */
  function requestUserListSync() {
    if (!enigmaInstance.value || enigmaInstance.value.isHost) return;
    enigmaInstance.value.requestUserListSync();
  }

  /**
   * Send a chat message
   */
  function sendMessage(text) {
    if (!enigmaInstance.value || !text.trim()) return;

    enigmaInstance.value.sendMessage(text);

    // Add to local messages
    const ownColor = enigmaInstance.value.generateColorFromString(
      enigmaInstance.value.peerId,
    );
    store.addMessage({
      username: store.username,
      message: text,
      color: ownColor,
      isSent: true,
    });
  }

  /**
   * Update user list from EnigmaJS state
   */
  function updateUserList() {
    if (!enigmaInstance.value) return;

    const users = [];
    for (const [peerId, info] of enigmaInstance.value.peerInfo.entries()) {
      users.push({
        peerId,
        username: info.username,
        color: info.color,
      });
    }
    store.updateUsers(users);
  }

  /**
   * Generate QR code for room ID
   */
  function generateQR(elementId, roomId) {
    if (!enigmaInstance.value) return;
    enigmaInstance.value.generateQR(elementId, roomId);
  }

  /**
   * Get contrasting text color for a background (standalone - doesn't need instance)
   */
  function getContrastingTextColor(backgroundColor) {
    if (!backgroundColor) return "#000";
    // Parse HSL color
    const match = backgroundColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!match) return "#000";
    const lightness = parseInt(match[3]);
    return lightness > 60 ? "#000" : "#fff";
  }

  /**
   * Get color for current user
   */
  function getOwnColor() {
    if (!enigmaInstance.value) return "#FF6B35";
    return enigmaInstance.value.generateColorFromString(
      enigmaInstance.value.peerId,
    );
  }

  /**
   * Kick a user (host only)
   */
  async function kickUser(peerId) {
    if (!enigmaInstance.value?.isHost) return;
    await enigmaInstance.value.kickUser(peerId);
  }

  /**
   * Promote a user to host (host only)
   */
  async function promoteUser(peerId) {
    if (!enigmaInstance.value?.isHost) return;
    await enigmaInstance.value.promoteToHost(peerId);
    // Old host loses host status
    store.isHost = false;
    store.addLog({
      message: "You transferred host to another user",
      type: "info",
    });
  }

  /**
   * Set verbose logging
   */
  function setVerbose(enabled) {
    store.verboseMode = enabled;
    if (enigmaInstance.value) {
      enigmaInstance.value.setVerbose(enabled);
    }
  }

  /**
   * Simple notification sound using Web Audio API
   */
  function playNotificationSound() {
    try {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }

      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.frequency.value = 800;
      osc.type = "sine";

      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3,
      );

      osc.start(audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Ignore audio errors
    }
  }

  /**
   * Show browser notification when tab is not active
   * @param {string} username - Sender's username
   * @param {string} message - Message preview
   */
  function showBrowserNotification(username, message) {
    // Only show if tab is not visible
    if (document.visibilityState === "visible") return;

    // Check if notifications are supported and permitted
    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
      const notification = new Notification(`EnigmaJS - ${username}`, {
        body:
          message.length > 100 ? message.substring(0, 100) + "..." : message,
        icon: "/vite.svg", // Uses the Vite logo as placeholder
        tag: "enigmajs-message", // Prevents stacking multiple notifications
        requireInteraction: false,
      });

      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);

      // Focus tab when notification clicked
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    }
  }

  /**
   * Request notification permission from user
   * @returns {Promise<string>} Permission status
   */
  async function requestNotificationPermission() {
    if (!("Notification" in window)) {
      store.addLog({
        message: "Browser notifications not supported",
        type: "warn",
      });
      return "unsupported";
    }

    if (Notification.permission === "granted") {
      store.addLog({ message: "Notifications already enabled", type: "info" });
      return "granted";
    }

    if (Notification.permission === "denied") {
      store.addLog({ message: "Notifications blocked by user", type: "warn" });
      return "denied";
    }

    const permission = await Notification.requestPermission();
    store.addLog({
      message: `Notification permission: ${permission}`,
      type: permission === "granted" ? "success" : "warn",
    });
    return permission;
  }

  /**
   * Start QR code scanner using device camera
   * @param {HTMLVideoElement} videoElement - Video element to display camera feed
   * @param {Function} onScan - Callback when QR code is scanned
   */
  let scannerStream = null;
  let scanning = false;

  async function startQRScanner(videoElement, onScan) {
    store.addLog({ message: "Starting QR scanner...", type: "info" });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      scannerStream = stream;
      videoElement.srcObject = stream;
      videoElement.style.display = "block";
      scanning = true;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const scan = () => {
        if (!scanning) return;

        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(
            imageData.data,
            imageData.width,
            imageData.height,
          );

          if (code) {
            store.addLog({
              message: `QR code scanned: ${code.data}`,
              type: "success",
            });
            stopQRScanner(videoElement);
            onScan(code.data);
            return;
          }
        }
        requestAnimationFrame(scan);
      };

      videoElement.addEventListener("loadeddata", () => {
        store.addLog({ message: "Camera ready, scanning...", type: "info" });
        scan();
      });
    } catch (err) {
      store.addLog({ message: `Camera error: ${err.message}`, type: "error" });
      throw err;
    }
  }

  /**
   * Stop QR scanner and release camera
   */
  function stopQRScanner(videoElement) {
    scanning = false;
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop());
      scannerStream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
      videoElement.style.display = "none";
    }
  }

  /**
   * Scan QR code from uploaded image file
   * @param {File} imageFile - Image file to scan
   * @param {Function} onScan - Callback when QR code is found
   */
  function scanQRFromImage(imageFile, onScan) {
    store.addLog({ message: "Scanning QR from image...", type: "info" });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = window.jsQR(
        imageData.data,
        imageData.width,
        imageData.height,
      );

      if (code) {
        store.addLog({
          message: `QR code found: ${code.data}`,
          type: "success",
        });
        onScan(code.data);
      } else {
        store.addLog({ message: "No QR code found in image", type: "error" });
        alert("No QR code found in the image. Please try another image.");
      }
    };

    img.onerror = () => {
      store.addLog({ message: "Failed to load image", type: "error" });
      alert("Failed to load the image. Please try another file.");
    };

    img.src = URL.createObjectURL(imageFile);
  }

  // Cleanup on unmount
  onUnmounted(() => {
    // Stop scanner if running
    scanning = false;
    if (scannerStream) {
      scannerStream.getTracks().forEach((track) => track.stop());
    }
  });

  return {
    enigmaInstance,
    initHost,
    connectToRoom,
    sendMessage,
    generateQR,
    getContrastingTextColor,
    getOwnColor,
    kickUser,
    promoteUser,
    setVerbose,
    updateUserList,
    startQRScanner,
    stopQRScanner,
    scanQRFromImage,
    requestNotificationPermission,
    setRoomPassword,
    setMaxUsers,
    getRoomPassword,
    getMaxUsers,
    setRoomVisibility,
    getRoomVisibility,
    getPublicRooms,
    destroyRoom,
    leaveRoom,
    requestUserListSync,
  };
}
