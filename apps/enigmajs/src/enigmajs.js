/**
 * EnigmaJS - Encrypted and decentralized web-chat using Gun.js and Vue.js
 *
 * A decentralized and end-to-end encrypted chat system for web-browsers
 * using Gun.js for data synchronization and Gun SEA for encryption.
 *
 * @class EnigmaJS
 */
export class EnigmaJS {
  constructor(options = {}) {
    this.gun = null;
    this.room = null;
    this.peerId = null;
    this.roomId = null;
    this.isHost = false;
    this.verbose = false;
    // Ensure username is always a non-empty string (Gun can have issues with numeric strings)
    this.username =
      String(options.username || "Anonymous").trim() || "Anonymous";

    // Callbacks for UI updates
    this.onLog = options.onLog || console.log;
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onConnection = options.onConnection || (() => {});
    this.onConnectionInfo = options.onConnectionInfo || (() => {});
    this.onMessageReceived = options.onMessageReceived || (() => {});
    this.onPromoted = options.onPromoted || (() => {});

    // Connection state
    this.status = "disconnected";
    this.connected = false;
    this.peers = new Set();
    this.peerInfo = new Map(); // Store username and color for each peer
    this.peerLastSeen = new Map();
    this.processedMessages = new Set();
    this.messageCount = 0;
    this.lastMessageTime = null;

    // Gun SEA - full keypair for encryption and signing
    this.seaKeyPair = null;
    this.peerKeys = new Map(); // Store full SEA keys (epub) for each peer

    // Shared secret for group encryption (derived via SEA)
    this.sharedSecret = null;

    // Room management settings
    this.maxUsers = options.maxUsers || 10; // Default max 10 users
    this.roomPassword = null;
    this.isPublic = false; // Private by default
    this.roomName = null; // Optional room name for public listing
    this.kickedUsers = new Set(); // Track kicked user IDs
    this.joinedAt = null; // Timestamp when we joined the room
    this.hostPeerId = null; // Track who the host is (for auto-promote)
    this.peerJoinOrder = []; // Track order peers joined (for auto-promote)

    // Cached room settings (for auto-promote when host leaves unexpectedly)
    this.cachedRoomSettings = null;
    // Cached secrets from host (for heir to use if host leaves unexpectedly)
    this.cachedHeirSecrets = null;

    // Network quality tracking
    this.pendingPings = new Map(); // Track ping timestamps
    this.latencyHistory = []; // Rolling history of latencies
    this.networkQuality = "unknown"; // 'excellent', 'good', 'fair', 'poor', 'unknown'
    this.onNetworkQualityChange = options.onNetworkQualityChange || (() => {});
  }

  /**
   * Initialize SEA encryption keypair
   * @returns {Promise<void>}
   */
  async initSEA() {
    this.seaKeyPair = await SEA.pair();
  }

  /**
   * Sign a message using our SEA keypair
   * Creates a signature over the message content that can be verified by recipients
   * @param {Object} msg - Message object to sign
   * @returns {Promise<Object>} Message with signature added
   */
  async signMessage(msg) {
    if (!this.seaKeyPair) {
      this.log("Cannot sign: no keypair", "error");
      return msg;
    }
    try {
      // Sign specific fields in deterministic order (Gun may add/modify other fields)
      const fieldsToSign = this.getSignableFields(msg);
      // Use sorted keys for deterministic JSON output
      const contentToSign = JSON.stringify(
        fieldsToSign,
        Object.keys(fieldsToSign).sort(),
      );
      const sig = await SEA.sign(contentToSign, this.seaKeyPair);
      return { ...msg, signature: sig };
    } catch (e) {
      this.log(`Signing error: ${e.message}`, "error");
      return msg;
    }
  }

  /**
   * Extract fields to sign from a message in deterministic order
   * @param {Object} msg - Message object
   * @returns {Object} Object with fields to sign
   */
  getSignableFields(msg) {
    // Helper to check if value should be included (not null/undefined)
    const hasValue = (v) => v !== undefined && v !== null;

    // Core fields present in all messages
    const fields = {
      id: msg.id,
      sender: msg.sender,
      timestamp: msg.timestamp,
      type: msg.type,
    };

    // Add type-specific fields (only if they have a non-null value)
    switch (msg.type) {
      case "join":
        if (hasValue(msg.epub)) fields.epub = msg.epub;
        if (hasValue(msg.password)) fields.password = msg.password;
        if (hasValue(msg.pub)) fields.pub = msg.pub;
        if (hasValue(msg.username)) fields.username = msg.username;
        break;
      case "welcome":
        if (hasValue(msg.encryptedSecret))
          fields.encryptedSecret = msg.encryptedSecret;
        if (hasValue(msg.epub)) fields.epub = msg.epub;
        if (hasValue(msg.peers)) fields.peers = msg.peers;
        if (hasValue(msg.pub)) fields.pub = msg.pub;
        if (hasValue(msg.target)) fields.target = msg.target;
        if (hasValue(msg.username)) fields.username = msg.username;
        break;
      case "message":
        if (hasValue(msg.encrypted)) fields.encrypted = msg.encrypted;
        break;
      case "reject":
        if (hasValue(msg.reason)) fields.reason = msg.reason;
        if (hasValue(msg.target)) fields.target = msg.target;
        break;
      case "kick":
        if (hasValue(msg.target)) fields.target = msg.target;
        break;
      case "kick-notify":
        if (hasValue(msg.kickedPeer)) fields.kickedPeer = msg.kickedPeer;
        break;
      case "user-joined":
        if (hasValue(msg.newUser)) fields.newUser = msg.newUser;
        if (hasValue(msg.newUserEpub)) fields.newUserEpub = msg.newUserEpub;
        if (hasValue(msg.newUserPub)) fields.newUserPub = msg.newUserPub;
        if (hasValue(msg.newUsername)) fields.newUsername = msg.newUsername;
        break;
      case "promote-notify":
        if (hasValue(msg.encryptedRoomPassword))
          fields.encryptedRoomPassword = msg.encryptedRoomPassword;
        if (hasValue(msg.encryptedSharedSecret))
          fields.encryptedSharedSecret = msg.encryptedSharedSecret;
        if (hasValue(msg.isPublic)) fields.isPublic = msg.isPublic;
        if (hasValue(msg.kickedUsers)) fields.kickedUsers = msg.kickedUsers;
        if (hasValue(msg.maxUsers)) fields.maxUsers = msg.maxUsers;
        if (hasValue(msg.newHost)) fields.newHost = msg.newHost;
        if (hasValue(msg.oldHost)) fields.oldHost = msg.oldHost;
        if (hasValue(msg.peerKeys)) fields.peerKeys = msg.peerKeys;
        if (hasValue(msg.roomName)) fields.roomName = msg.roomName;
        break;
      case "rekey":
        if (hasValue(msg.encryptedKeys))
          fields.encryptedKeys = msg.encryptedKeys;
        break;
      case "heir-secrets":
        if (hasValue(msg.target)) fields.target = msg.target;
        if (hasValue(msg.encryptedRoomPassword))
          fields.encryptedRoomPassword = msg.encryptedRoomPassword;
        if (hasValue(msg.encryptedSharedSecret))
          fields.encryptedSharedSecret = msg.encryptedSharedSecret;
        break;
      case "ping":
        // No additional fields
        break;
      case "pong":
        if (hasValue(msg.pingId)) fields.pingId = msg.pingId;
        if (hasValue(msg.target)) fields.target = msg.target;
        break;
    }

    return fields;
  }

  /**
   * Verify message signature using sender's public key
   * @param {Object} data - Message data with signature
   * @returns {Promise<boolean>} True if signature is valid
   */
  async verifySignature(data) {
    if (!data.signature) {
      this.log(
        `Message ${data.type} from ${data.sender} has no signature`,
        "warn",
      );
      return false;
    }

    // Extract the same fields that were signed and use sorted keys for deterministic JSON
    const fieldsToVerify = this.getSignableFields(data);
    const contentToVerify = JSON.stringify(
      fieldsToVerify,
      Object.keys(fieldsToVerify).sort(),
    );

    // Get sender's signing public key
    const senderKeys = this.peerKeys.get(data.sender);
    if (!senderKeys || !senderKeys.pub) {
      // For join messages, we don't have keys yet - signature provided in message
      if (data.type === "join" && data.pub) {
        // Verify using the public key provided in the join message itself
        try {
          const verified = await SEA.verify(data.signature, data.pub);
          // SEA.verify returns the original data - may be parsed as object if it was JSON
          // So we need to stringify it for comparison
          const verifiedStr =
            typeof verified === "object"
              ? JSON.stringify(verified, Object.keys(verified).sort())
              : verified;
          if (verifiedStr === contentToVerify) {
            return true;
          }
          this.log(
            `Join signature verification failed for ${data.sender}`,
            "warn",
          );
          return false;
        } catch (e) {
          this.log(`Join signature verification error: ${e.message}`, "error");
          return false;
        }
      }
      this.log(
        `Cannot verify ${data.type}: unknown sender ${data.sender}`,
        "warn",
      );
      return false;
    }

    try {
      const verified = await SEA.verify(data.signature, senderKeys.pub);
      // SEA.verify returns the original data - may be parsed as object if it was JSON
      const verifiedStr =
        typeof verified === "object"
          ? JSON.stringify(verified, Object.keys(verified).sort())
          : verified;
      if (verifiedStr === contentToVerify) {
        return true;
      }
      this.log(
        `Signature verification failed for ${data.type} from ${data.sender}`,
        "warn",
      );
      return false;
    } catch (e) {
      this.log(`Signature verification error: ${e.message}`, "error");
      return false;
    }
  }

  /**
   * Hash a password using SHA-256 with optional salt
   * @param {string} password - Plain text password
   * @param {string} salt - Salt (typically roomId)
   * @returns {Promise<string>} Hex-encoded hash
   */
  async hashPassword(password, salt = "") {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + salt);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Start periodic check for peer timeouts
   */
  startPeerTimeoutChecker() {
    setInterval(() => {
      if (!this.connected || this.peers.size === 0) return;
      const now = Date.now();
      for (const peerId of this.peers) {
        const lastSeen = this.peerLastSeen.get(peerId) || now;
        if (now - lastSeen > 30000) {
          this.handlePeerLeave(peerId);
        }
      }
    }, 10000);
  }

  /**
   * Handle peer leaving the room
   * @param {string} peerId - ID of peer that left
   */
  handlePeerLeave(peerId) {
    const info = this.peerInfo.get(peerId);
    const username = info ? info.username : "Unknown";

    // Check if the host left
    const hostLeft = peerId === this.hostPeerId;

    this.peers.delete(peerId);
    this.peerInfo.delete(peerId);
    this.peerKeys.delete(peerId);
    this.peerLastSeen.delete(peerId);

    // Remove from join order
    this.peerJoinOrder = this.peerJoinOrder.filter((id) => id !== peerId);

    this.log(`${username} left the room`, "warn", true);

    // If host left and we're not the host, check for auto-promote
    if (hostLeft && !this.isHost) {
      this.handleHostLeft();
    }

    this.updateConnectionInfo();
  }

  /**
   * Handle when the host leaves - auto-promote oldest peer
   */
  handleHostLeft() {
    this.log("Host has disconnected", "warn", true);

    // In decentralized systems, we need a deterministic way to pick a new host
    // Use lexicographically smallest peerId among all remaining peers (including self)
    const remainingPeers = [...this.peers]; // Other peers still connected
    const allCandidates = [...remainingPeers, this.peerId].sort();

    this.log(
      `Auto-promote candidates: ${allCandidates.join(", ")} (self: ${this.peerId})`,
      "info",
    );

    if (allCandidates[0] === this.peerId) {
      // We have the smallest peer ID - we become host
      this.selfPromote();
    } else {
      // Someone else will become host
      this.hostPeerId = allCandidates[0];
      const newHostInfo = this.peerInfo.get(this.hostPeerId);
      const newHostName = newHostInfo ? newHostInfo.username : "Unknown";
      this.log(
        `Waiting for ${newHostName} to become the new host`,
        "info",
        true,
      );
    }
  }

  /**
   * Self-promote to host (when original host leaves)
   */
  async selfPromote() {
    this.log("You are now the host (auto-promoted)", "success", true);
    this.isHost = true;
    this.hostPeerId = this.peerId;

    // Use cached room settings if available (from last promote-notify we observed)
    if (this.cachedRoomSettings) {
      this.maxUsers = this.cachedRoomSettings.maxUsers || 10;
      this.isPublic = this.cachedRoomSettings.isPublic || false;
      this.roomName = this.cachedRoomSettings.roomName || null;
      this.kickedUsers = new Set(this.cachedRoomSettings.kickedUsers || []);
    } else {
      // Fallback: no cached settings available
      this.kickedUsers = new Set();
    }

    // Use cached heir secrets if available (sent by old host before they left)
    if (this.cachedHeirSecrets) {
      if (this.cachedHeirSecrets.sharedSecret) {
        this.sharedSecret = this.cachedHeirSecrets.sharedSecret;
        this.log("Restored room key from heir secrets", "info");
      }
      if (this.cachedHeirSecrets.roomPassword) {
        this.roomPassword = this.cachedHeirSecrets.roomPassword;
        this.log("Restored room password from heir secrets", "info");
      }
      this.cachedHeirSecrets = null; // Clear after use
    } else {
      // No heir secrets - password cannot be recovered
      this.roomPassword = null;
      this.log("No heir secrets available - room password reset", "info");
    }

    this.updateConnectionInfo();

    // Notify UI
    if (this.onPromoted) {
      this.onPromoted();
    }

    // Serialize peerKeys for broadcast (in case other peers need them)
    const peerKeysArray = [];
    for (const [pid, keys] of this.peerKeys.entries()) {
      peerKeysArray.push({ peerId: pid, epub: keys.epub, pub: keys.pub });
    }
    // Include our own keys
    peerKeysArray.push({
      peerId: this.peerId,
      epub: this.seaKeyPair.epub,
      pub: this.seaKeyPair.pub,
    });

    // Broadcast that we're the new host so others know
    // Note: We do NOT send roomPassword or sharedSecret in auto-promote
    // as we can't encrypt them without the old host
    let promoteNotifyMsg = {
      id: this.generateId(),
      type: "promote-notify",
      sender: this.peerId,
      oldHost: this.hostPeerId,
      newHost: this.peerId,
      maxUsers: this.maxUsers,
      // No roomPassword - can't securely transfer in auto-promote
      isPublic: this.isPublic ? "true" : "false",
      roomName: this.roomName || "",
      kickedUsers: Array.from(this.kickedUsers).join(","),
      peerKeys: JSON.stringify(peerKeysArray), // Public keys - OK to share
      timestamp: Date.now(),
    };
    promoteNotifyMsg = await this.signMessage(promoteNotifyMsg);
    this.room.get("messages").get(promoteNotifyMsg.id).put(promoteNotifyMsg);

    // Send heir secrets to the new potential heir (for if we disconnect unexpectedly)
    await this.sendHeirSecrets();
  }

  /**
   * Send encrypted heir secrets to the next-in-line peer
   * Called when host changes or when peer list changes
   */
  async sendHeirSecrets() {
    if (!this.isHost) return;

    // Determine heir: lexicographically smallest peer ID (excluding self)
    const candidates = [...this.peers].sort();
    if (candidates.length === 0) return; // No heir

    const heirId = candidates[0];
    const heirKeys = this.peerKeys.get(heirId);
    if (!heirKeys || !heirKeys.epub) {
      this.log(`Cannot send heir-secrets: missing keys for ${heirId}`, "warn");
      return;
    }

    // Encrypt secrets using ECDH
    const dhKey = await SEA.secret(heirKeys.epub, this.seaKeyPair);
    const encryptedSharedSecret = this.sharedSecret
      ? await SEA.encrypt(this.sharedSecret, dhKey)
      : null;
    const encryptedRoomPassword = this.roomPassword
      ? await SEA.encrypt(this.roomPassword, dhKey)
      : null;

    let heirMsg = {
      id: this.generateId(),
      type: "heir-secrets",
      sender: this.peerId,
      target: heirId,
      encryptedSharedSecret,
      encryptedRoomPassword,
      timestamp: Date.now(),
    };
    heirMsg = await this.signMessage(heirMsg);
    this.room.get("messages").get(heirMsg.id).put(heirMsg);
    this.log(`Sent heir secrets to ${heirId}`, "info");
  }

  /**
   * Generate a consistent color from a string (username or peerId)
   * Colors constrained to warm spectrum (red/orange/yellow) to match Rockstar Energy Peach theme
   * @param {string} str - String to generate color from
   * @returns {string} HSL color string
   */
  generateColorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Constrain to warm colors (0-60 = red to orange to yellow)
    const hue = Math.abs(hash % 60);
    // Higher saturation for vibrant, energetic feel
    const saturation = 70 + (Math.abs(hash >> 8) % 25); // 70-95%
    // Balanced lightness for readability with vibrant colors
    const lightness = 60 + (Math.abs(hash >> 16) % 20); // 60-80%

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  /**
   * Calculate contrasting text color (black or white) based on background
   * @param {string} backgroundColor - HSL color string
   * @returns {string} Hex color for text
   */
  getContrastingTextColor(backgroundColor) {
    // Parse HSL color
    const match = backgroundColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (!match) return "#000";

    const lightness = parseInt(match[3]);
    // If lightness > 60, use dark text, otherwise use light text
    return lightness > 60 ? "#000" : "#fff";
  }

  /**
   * Log a message with filtering based on verbose mode
   * @param {string} message - Message to log
   * @param {string} type - Log type ('info', 'success', 'warn', 'error')
   * @param {boolean} force - Force logging regardless of verbose setting
   */
  log(message, type = "info", force = false) {
    // Filter verbose messages unless enabled or forced
    if (!force && !this.verbose && type === "info") return;

    const timestamp = new Date().toLocaleTimeString();
    this.onLog({ timestamp, message, type });
  }

  /**
   * Enable or disable verbose logging
   * @param {boolean} enabled - Whether to enable verbose logging
   */
  setVerbose(enabled) {
    this.verbose = enabled;
    this.log(
      `Verbose logging ${enabled ? "enabled" : "disabled"}`,
      "info",
      true,
    );
  }

  /**
   * Set connection status and notify callbacks
   * @param {string} status - Status ('disconnected', 'connecting', 'waiting', 'connected')
   * @param {string|null} errorMsg - Optional error message
   */
  setStatus(status, errorMsg = null) {
    this.status = status;
    this.onStatusChange(status, errorMsg);
    if (errorMsg) {
      this.log(`Status: ${status} - ${errorMsg}`, "error", true);
    } else if (this.verbose) {
      this.log(`Status: ${status}`, "info", true);
    }
  }

  /**
   * Generate a unique ID for messages
   * @returns {string} Unique identifier
   */
  generateId() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Generate readable room/peer IDs like "FIRE-3K7-WXYZ"
   * @returns {string} Human-readable ID
   */
  generatePeerId() {
    // Exclude confusing chars (0, O, 1, I)
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const words = [
      "FIRE",
      "BOLT",
      "WAVE",
      "STAR",
      "NOVA",
      "DASH",
      "GLOW",
      "ZOOM",
      "APEX",
      "CYAN",
      "ECHO",
      "FLEX",
      "VOLT",
      "ZETA",
      "BLUR",
      "RUSH",
      "FURY",
      "BEAM",
      "NEON",
      "PEAK",
    ];

    const word = words[Math.floor(Math.random() * words.length)];
    let segment1 = "";
    let segment2 = "";

    for (let i = 0; i < 3; i++) {
      segment1 += chars[Math.floor(Math.random() * chars.length)];
    }
    for (let i = 0; i < 4; i++) {
      segment2 += chars[Math.floor(Math.random() * chars.length)];
    }

    return `${word}-${segment1}-${segment2}`;
  }

  /**
   * Initialize Gun.js network connection with multiple public relays
   */
  initGun() {
    // Multiple public Gun.js relay servers for redundancy and better connectivity
    const peers = [
      // Primary relays
      "https://gun-manhattan.herokuapp.com/gun",
      "https://gun-us.herokuapp.com/gun",
      "https://gun-eu.herokuapp.com/gun",
      // Community relays
      "https://gun-gun.herokuapp.com/gun",
      "https://gunjs.herokuapp.com/gun",
      "https://gun.o8.is/gun",
      // Additional public relays
      "https://peer.wallie.io/gun",
      "https://gundb-relay-mlccl.ondigitalocean.app/gun",
      "https://gun-relay.scuffle.de/gun",
      "https://plankton-app-6qfp3.ondigitalocean.app/gun",
      // Newly added relays
      "https://gun.defucc.me/gun",
      "https://shogun-relay.scobrudot.dev/gun",
      "https://relay.peer.ooo/gun",
    ];

    this.gun = Gun({ peers, localStorage: false, radisk: false });
    if (this.verbose) {
      this.log(`Gun initialized with ${peers.length} relay peers`, "success");
    }
  }

  /**
   * Initialize as host and create a new room
   * @returns {Promise<void>}
   */
  async initHost() {
    this.setStatus("connecting");

    if (!this.seaKeyPair) {
      await this.initSEA();
      this.log("SEA keypair generated", "info");
    }

    // Generate cryptographically secure password for room encryption
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    this.sharedSecret = Array.from(randomBytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    this.log(
      `Room password generated (length: ${this.sharedSecret.length})`,
      "info",
    );

    this.peerId = this.generatePeerId();
    this.roomId = this.generatePeerId();
    this.isHost = true;
    this.hostPeerId = this.peerId; // We are the host
    this.joinedAt = Date.now();
    this.log(`Room ID: ${this.roomId}, Peer ID: ${this.peerId}`, "info");

    this.initGun();
    this.room = this.gun.get("enigmajs").get(this.roomId);
    this.log("Gun network initialized, room created", "info");

    this.setStatus("waiting");
    this.onConnection({ type: "host-ready", peerId: this.roomId });
    this.log("Room created, waiting for connections...", "success", true);
    this.setupMessageListener();
    this.log("Message listener active", "info");
    this.updateConnectionInfo();
    this.startHeartbeat();
    this.startPeerTimeoutChecker();
    this.startBackgroundKeepAlive();
  }

  /**
   * Connect to an existing room as a peer
   * @param {string} roomId - Room ID to connect to
   * @param {string} [password] - Optional room password
   * @returns {Promise<void>}
   */
  async connectToPeer(roomId, password = null) {
    this.setStatus("connecting");

    if (!this.seaKeyPair) {
      await this.initSEA();
      this.log("SEA keypair generated", "info");
    }

    this.peerId = this.generatePeerId();
    this.roomId = roomId;
    this.isHost = false;
    this.joinedAt = Date.now();
    this.log(`Peer ID: ${this.peerId}`, "info");

    this.initGun();
    this.room = this.gun.get("enigmajs").get(this.roomId);
    this.log(`Connecting to room: ${this.roomId}`, "info");

    this.setupMessageListener();
    this.log("Message listener active", "info");

    // Send join message with SEA keys
    const hashedPassword = password
      ? await this.hashPassword(password, this.roomId)
      : null;
    let joinMsg = {
      id: this.generateId(),
      type: "join",
      sender: this.peerId,
      username: this.username,
      epub: this.seaKeyPair.epub, // Encryption public key
      pub: this.seaKeyPair.pub, // Signing public key
      password: hashedPassword, // Hashed room password
      timestamp: Date.now(),
    };
    joinMsg = await this.signMessage(joinMsg);
    this.room.get("messages").get(joinMsg.id).put(joinMsg);
    this.log(
      `Joining room with epub: ${this.seaKeyPair.epub.substring(0, 16)}...`,
      "info",
    );
    this.log("Joining room...", "info", true);
    this.setStatus("waiting");
    this.updateConnectionInfo();
    this.startHeartbeat();
    this.startPeerTimeoutChecker();
    this.startBackgroundKeepAlive();
  }

  /**
   * Send periodic ping messages to keep connection alive
   */
  startHeartbeat() {
    // Send ping every 30 seconds to keep connection alive
    this.heartbeatInterval = setInterval(() => {
      // Update public listing even when waiting for connections (host not yet "connected")
      if (this.isHost && this.isPublic && this.room) {
        this.updatePublicListing();
      }

      if (this.connected && this.room) {
        this.sendPing();
      }
    }, 30000);
  }

  /**
   * Start background keep-alive mechanisms to prevent disconnect when tab sleeps
   */
  startBackgroundKeepAlive() {
    // Track visibility changes
    this.lastVisibilityChange = Date.now();
    this.wasHidden = false;

    // When tab becomes visible again, immediately reconnect if needed
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.wasHidden = true;
        this.lastVisibilityChange = Date.now();
      } else {
        // Tab became visible again
        const hiddenDuration = Date.now() - this.lastVisibilityChange;

        if (this.wasHidden && hiddenDuration > 5000 && this.connected) {
          // Been hidden for more than 5 seconds, send immediate ping to verify connection
          this.log("Resuming from background, checking connection...", "info");
          this.sendPing();

          // If hidden for a long time, do multiple rapid pings
          if (hiddenDuration > 30000) {
            setTimeout(() => this.sendPing(), 1000);
            setTimeout(() => this.sendPing(), 3000);
          }
        }
        this.wasHidden = false;
      }
    });

    // Use Web Locks API if available to request a lock that prevents page suspension
    if (navigator.locks) {
      this.requestWakeLock();
    }

    // Use a more aggressive keep-alive for mobile browsers
    // ServiceWorker periodic sync would be ideal but requires more setup
    // For now, use a secondary interval that's more frequent
    this.mobileKeepAlive = setInterval(() => {
      if (this.connected && this.room && document.hidden) {
        // Send a lightweight ping even when hidden
        this.sendPing();
      }
    }, 15000); // Every 15 seconds when hidden
  }

  /**
   * Request a wake lock to prevent page suspension (where supported)
   */
  async requestWakeLock() {
    // Web Locks API - request a shared lock that we hold
    // This signals to the browser that we have an active connection
    try {
      await navigator.locks.request(
        "enigmajs-connection",
        { mode: "shared" },
        async () => {
          // Hold the lock as long as we're connected
          return new Promise((resolve) => {
            this.releaseLock = resolve;
          });
        },
      );
    } catch (e) {
      // Lock API not supported or failed, ignore
    }
  }

  /**
   * Set up listener for incoming messages
   */
  setupMessageListener() {
    this.room
      .get("messages")
      .map()
      .on(async (data, key) => {
        if (!data || !data.id || !data.type || !data.sender) return;

        // Skip messages from before we joined (Gun replays history)
        if (
          data.timestamp &&
          this.joinedAt &&
          data.timestamp < this.joinedAt - 5000
        ) {
          return; // Ignore messages from before we joined (5s grace period)
        }

        if (this.processedMessages.has(data.id)) {
          return;
        }
        this.processedMessages.add(data.id);

        if (data.sender === this.peerId) {
          return;
        }

        this.peerLastSeen.set(data.sender, Date.now());

        // Verify signature for message types that require it
        // join and welcome messages are verified with the key in the message itself
        // ping/pong and user-joined are lenient - verify if we know the sender, but don't reject if unknown
        // (user-joined may arrive before welcome is processed due to Gun.js message ordering)
        // other messages require the sender to be known (key in peerKeys)
        const requiresStrictVerification = [
          "message",
          "kick",
          "kick-notify",
          "promote-notify",
          "rekey",
          "reject",
          "heir-secrets",
        ];

        // For ping/pong/user-joined, skip verification entirely
        // These are non-critical messages (UI updates only, no security impact)
        // user-joined can arrive before welcome due to Gun.js message ordering
        const skipVerification = ["ping", "pong", "user-joined"];
        if (skipVerification.includes(data.type)) {
          // Allow without verification
        } else if (requiresStrictVerification.includes(data.type)) {
          const isValid = await this.verifySignature(data);
          if (!isValid) {
            this.log(
              `Rejected ${data.type} from ${data.sender}: invalid signature`,
              "warn",
            );
            return; // Drop message with invalid signature
          }
        }

        // Route message to appropriate handler
        switch (data.type) {
          case "join":
            // Verify join signature using the pub key in the message
            if (data.pub && data.signature) {
              const isValid = await this.verifySignature(data);
              if (!isValid) {
                this.log(
                  `Rejected JOIN from ${data.sender}: invalid signature`,
                  "warn",
                );
                return;
              }
            }
            this.log(
              `Received JOIN from ${data.username || data.sender}`,
              "info",
            );
            Promise.resolve(this.handleJoin(data));
            break;
          case "welcome":
            // Verify welcome signature using the pub key in the message
            if (data.pub && data.signature) {
              try {
                const fieldsToVerify = this.getSignableFields(data);
                const contentToVerify = JSON.stringify(
                  fieldsToVerify,
                  Object.keys(fieldsToVerify).sort(),
                );
                const verified = await SEA.verify(data.signature, data.pub);
                // SEA.verify returns the original data - may be parsed as object if it was JSON
                const verifiedStr =
                  typeof verified === "object"
                    ? JSON.stringify(verified, Object.keys(verified).sort())
                    : verified;
                if (verifiedStr !== contentToVerify) {
                  this.log(
                    `Rejected WELCOME from ${data.sender}: invalid signature`,
                    "warn",
                  );
                  return;
                }
              } catch (e) {
                this.log(
                  `WELCOME signature verification error: ${e.message}`,
                  "error",
                );
                return;
              }
            }
            this.log(
              `Received WELCOME from ${data.username || data.sender}`,
              "info",
            );
            Promise.resolve(this.handleWelcome(data));
            break;
          case "message":
            // Only process messages if we have the shared secret
            if (this.sharedSecret) {
              Promise.resolve(this.handleMessage(data));
            }
            break;
          case "reject":
            this.handleReject(data);
            break;
          case "kick":
            this.handleKick(data);
            break;
          case "kick-notify":
            this.handleKickNotify(data);
            break;
          case "user-joined":
            this.handleUserJoined(data);
            break;
          case "promote-notify":
            Promise.resolve(this.handlePromoteNotify(data));
            break;
          case "room-destroyed":
            this.handleRoomDestroyed(data);
            break;
          case "ping":
            Promise.resolve(this.handlePing(data));
            break;
          case "pong":
            this.handlePong(data);
            break;
          case "rekey":
            Promise.resolve(this.handleRekey(data));
            break;
          case "heir-secrets":
            Promise.resolve(this.handleHeirSecrets(data));
            break;
        }
      });
  }

  /**
   * Handle incoming join message
   * @param {Object} data - Join message data
   * @returns {Promise<void>}
   */
  async handleJoin(data) {
    const displayName = data.username || "Anonymous";

    // Only HOST processes join requests and decides who gets in
    // Other clients wait for welcome-ack or user-joined notifications
    if (!this.isHost) {
      // Non-hosts just log that someone is trying to join
      this.log(`${displayName} is trying to join...`, "info");
      return;
    }

    // Check if user was kicked
    if (this.kickedUsers.has(data.sender)) {
      this.log(`Rejected join from kicked user: ${displayName}`, "warn", true);
      return;
    }

    // Check room size limit (host)
    if (this.peers.size >= this.maxUsers) {
      this.log(`Room full, rejected: ${displayName}`, "warn", true);
      // Send rejection message
      let rejectMsg = {
        id: this.generateId(),
        type: "reject",
        sender: this.peerId,
        target: data.sender,
        reason: "Room is full",
        timestamp: Date.now(),
      };
      rejectMsg = await this.signMessage(rejectMsg);
      this.room.get("messages").get(rejectMsg.id).put(rejectMsg);
      return;
    }

    // Check password if set
    if (
      this.isHost &&
      this.roomPassword &&
      data.password !== this.roomPassword
    ) {
      this.log(`Wrong password from: ${displayName}`, "warn", true);
      let rejectMsg = {
        id: this.generateId(),
        type: "reject",
        sender: this.peerId,
        target: data.sender,
        reason: "Incorrect password",
        timestamp: Date.now(),
      };
      rejectMsg = await this.signMessage(rejectMsg);
      this.room.get("messages").get(rejectMsg.id).put(rejectMsg);
      return;
    }

    this.log(`${displayName} joined`, "success", true);

    this.peers.add(data.sender);
    this.peerInfo.set(data.sender, {
      username: displayName,
      color: this.generateColorFromString(data.sender),
    });

    // Track join order for auto-promote
    if (!this.peerJoinOrder.includes(data.sender)) {
      this.peerJoinOrder.push(data.sender);
    }

    // Store peer's SEA keys for encryption
    if (data.epub) {
      this.peerKeys.set(data.sender, { epub: data.epub, pub: data.pub });
    }

    // Host sends welcome with encrypted shared secret
    if (this.isHost && data.epub) {
      try {
        if (!this.seaKeyPair || !this.sharedSecret) {
          this.log("Cannot welcome new user: missing keys", "error", true);
          return;
        }

        // Derive shared secret using ECDH via SEA
        const dhKey = await SEA.secret(data.epub, this.seaKeyPair);

        // Encrypt the room password using the ECDH key
        const encryptedSecret = await SEA.encrypt(this.sharedSecret, dhKey);

        // Build list of existing peers to share with new joiner
        // Only include peers that have been seen recently (not stale)
        // Include their pub/epub keys so new joiner can verify their messages
        const now = Date.now();
        const staleThreshold = 35000; // 35 seconds (slightly more than heartbeat)
        const existingPeers = [];
        for (const [peerId, info] of this.peerInfo.entries()) {
          if (peerId !== data.sender) {
            const lastSeen = this.peerLastSeen.get(peerId);
            // Include peer if they've been seen recently, or if no lastSeen (just joined)
            if (!lastSeen || now - lastSeen < staleThreshold) {
              const peerKeys = this.peerKeys.get(peerId);
              existingPeers.push({
                id: peerId,
                username: info.username,
                epub: peerKeys?.epub,
                pub: peerKeys?.pub,
              });
            } else {
              // This peer is stale, clean them up
              this.log(
                `Removing stale peer ${info.username} from list`,
                "info",
              );
              this.peers.delete(peerId);
              this.peerInfo.delete(peerId);
              this.peerKeys.delete(peerId);
              this.peerLastSeen.delete(peerId);
              this.peerJoinOrder = this.peerJoinOrder.filter(
                (id) => id !== peerId,
              );
            }
          }
        }

        // Ensure username is always a string (Gun can be picky about types)
        const hostUsername = String(this.username || "Host");

        let welcomeMsg = {
          id: this.generateId(),
          type: "welcome",
          sender: this.peerId,
          username: hostUsername,
          target: data.sender,
          epub: this.seaKeyPair.epub,
          pub: this.seaKeyPair.pub,
          encryptedSecret: encryptedSecret,
          peers: JSON.stringify(existingPeers), // Send as JSON string for Gun
          timestamp: Date.now(),
        };
        welcomeMsg = await this.signMessage(welcomeMsg);
        this.room.get("messages").get(welcomeMsg.id).put(welcomeMsg);

        // Notify existing peers about the new user (include ECDH keys so they can re-key if promoted)
        let userJoinedMsg = {
          id: this.generateId(),
          type: "user-joined",
          sender: this.peerId,
          newUser: data.sender,
          newUsername: displayName,
          newUserEpub: data.epub, // Include ECDH key for re-keying capability
          newUserPub: data.pub,
          timestamp: Date.now(),
        };
        userJoinedMsg = await this.signMessage(userJoinedMsg);
        this.room.get("messages").get(userJoinedMsg.id).put(userJoinedMsg);

        // Update heir secrets since peer list changed
        await this.sendHeirSecrets();

        this.connected = true;
        this.setStatus("connected");
      } catch (e) {
        this.log(`Key exchange error: ${e.message}`, "error", true);
      }
    }
    this.updateConnectionInfo();
  }

  /**
   * Handle incoming welcome message
   * @param {Object} data - Welcome message data
   * @returns {Promise<void>}
   */
  async handleWelcome(data) {
    if (data.target !== this.peerId) return;

    const hostName = data.username || "Host";
    this.log(`Connected to ${hostName}'s room`, "success", true);

    // Track who the host is
    this.hostPeerId = data.sender;

    this.peers.add(data.sender);
    this.peerInfo.set(data.sender, {
      username: hostName,
      color: this.generateColorFromString(data.sender),
    });

    // Host is first in join order
    this.peerJoinOrder = [data.sender];

    // Add existing peers from the host's list
    if (data.peers) {
      try {
        const existingPeers = JSON.parse(data.peers);
        for (const peer of existingPeers) {
          this.peers.add(peer.id);
          this.peerInfo.set(peer.id, {
            username: peer.username,
            color: this.generateColorFromString(peer.id),
          });
          // Store peer's SEA keys for signature verification
          if (peer.epub && peer.pub) {
            this.peerKeys.set(peer.id, { epub: peer.epub, pub: peer.pub });
          }
          // Add to join order (they joined before us)
          this.peerJoinOrder.push(peer.id);
        }
        if (existingPeers.length > 0) {
          this.log(
            `Found ${existingPeers.length} other user(s) in room`,
            "info",
            true,
          );
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Store host's SEA keys
    if (data.epub) {
      this.peerKeys.set(data.sender, { epub: data.epub, pub: data.pub });

      // Decrypt shared secret from host using ECDH
      if (data.encryptedSecret) {
        try {
          // Derive the same shared key using ECDH
          const dhKey = await SEA.secret(data.epub, this.seaKeyPair);

          const decrypted = await SEA.decrypt(data.encryptedSecret, dhKey);

          if (decrypted) {
            this.sharedSecret = decrypted;
          } else {
            throw new Error("Decryption returned null");
          }
        } catch (e) {
          this.log(`Key exchange failed: ${e.message}`, "error", true);
        }
      }
    }

    this.connected = true;
    this.setStatus("connected");
    this.updateConnectionInfo();
  }

  /**
   * Handle incoming encrypted message
   * @param {Object} data - Message data
   * @returns {Promise<void>}
   */
  async handleMessage(data) {
    if (!data.encrypted) {
      return;
    }

    const sender = data.sender || "Unknown";
    const peerInfo = this.peerInfo.get(sender) || {
      username: "Anonymous",
      color: "#666",
    };

    if (!this.sharedSecret) {
      return; // Silently skip - we don't have the key yet
    }

    let message = null;
    try {
      message = await SEA.decrypt(data.encrypted, this.sharedSecret);
      if (!message) return; // Decryption failed, likely old message with different key
      // Ensure message is a string
      if (typeof message !== "string") {
        message = String(message);
      }
      this.log(
        `Message from ${peerInfo.username}: "${message.substring(0, 50)}${message.length > 50 ? "..." : ""}"`,
        "info",
      );
    } catch (e) {
      return; // Silently fail - probably old message
    }

    this.messageCount++;
    this.lastMessageTime = new Date().toLocaleTimeString();
    this.onMessageReceived({
      sender,
      username: peerInfo.username,
      color: peerInfo.color,
      message,
    });
    this.updateConnectionInfo();
  }

  /**
   * Handle incoming ping message
   * @param {Object} data - Ping message data
   */
  async handlePing(data) {
    let pongMsg = {
      id: this.generateId(),
      type: "pong",
      sender: this.peerId,
      target: data.sender,
      pingId: data.id,
      timestamp: Date.now(),
    };
    pongMsg = await this.signMessage(pongMsg);
    this.room.get("messages").get(pongMsg.id).put(pongMsg);
  }

  /**
   * Handle incoming pong message
   * @param {Object} data - Pong message data
   */
  handlePong(data) {
    if (data.target !== this.peerId) return;

    // Calculate latency from ping timestamp
    if (data.pingId && this.pendingPings.has(data.pingId)) {
      const sentTime = this.pendingPings.get(data.pingId);
      const latency = Date.now() - sentTime;
      this.pendingPings.delete(data.pingId);

      // Add to latency history (keep last 10)
      this.latencyHistory.push(latency);
      if (this.latencyHistory.length > 10) {
        this.latencyHistory.shift();
      }

      // Update network quality based on average latency
      this.updateNetworkQuality();
    }
  }

  /**
   * Update network quality based on latency history
   * Note: This measures Gun.js relay round-trip, not direct peer latency
   * Typical relay latency is 500-2000ms depending on server locations
   */
  updateNetworkQuality() {
    if (this.latencyHistory.length === 0) {
      this.networkQuality = "unknown";
      return;
    }

    const avg =
      this.latencyHistory.reduce((a, b) => a + b, 0) /
      this.latencyHistory.length;
    let quality;

    // Thresholds adjusted for Gun.js relay (not direct P2P)
    if (avg < 250) {
      quality = "excellent";
    } else if (avg < 800) {
      quality = "good";
    } else if (avg < 1500) {
      quality = "fair";
    } else {
      quality = "poor";
    }

    if (quality !== this.networkQuality) {
      this.networkQuality = quality;
      this.onNetworkQualityChange(quality, Math.round(avg));
    }
  }

  /**
   * Get current network quality info
   * @returns {Object} Network quality info
   */
  getNetworkInfo() {
    const avg =
      this.latencyHistory.length > 0
        ? Math.round(
            this.latencyHistory.reduce((a, b) => a + b, 0) /
              this.latencyHistory.length,
          )
        : null;
    return {
      quality: this.networkQuality,
      latency: avg,
      samples: this.latencyHistory.length,
    };
  }

  /**
   * Handle rejection message (room full, wrong password, etc.)
   * @param {Object} data - Rejection message data
   */
  handleReject(data) {
    if (data.target !== this.peerId) return;
    const reason = data.reason || "Connection rejected";
    this.log(`Rejected: ${reason}`, "error", true);
    this.setStatus("disconnected", reason);
    this.connected = false;
    // Clear the room
    if (this.room) {
      this.room = null;
    }
  }

  /**
   * Handle room destroyed message
   * @param {Object} data - Room destroyed message data
   */
  handleRoomDestroyed(data) {
    this.log("Room has been closed by the host", "error", true);
    this.setStatus("disconnected", "Room destroyed");
    this.connected = false;
    this.peers.clear();
    this.peerInfo.clear();
    // Clear the room
    if (this.room) {
      this.room = null;
    }
  }

  /**
   * Handle incoming kick message
   * @param {Object} data - Kick message data
   */
  handleKick(data) {
    if (data.target !== this.peerId) return;
    this.log("You have been kicked from the room", "error", true);
    this.setStatus("disconnected", "Kicked by host");
    this.connected = false;

    // Clear all sensitive data
    this.sharedSecret = null;
    this.seaKeyPair = null;
    this.peerKeys.clear();
    this.peers.clear();
    this.peerInfo.clear();
    this.cachedRoomSettings = null;
    this.cachedHeirSecrets = null;

    this.updateConnectionInfo();
    // Clear the room
    if (this.room) {
      this.room = null;
    }
  }

  /**
   * Handle kick notification for other peers
   * @param {Object} data - Kick notification data
   */
  handleKickNotify(data) {
    // Other clients get notified about the kick
    if (data.kickedPeer && this.peers.has(data.kickedPeer)) {
      const userInfo = this.peerInfo.get(data.kickedPeer);
      const username = userInfo ? userInfo.username : "User";
      this.log(`${username} was kicked from the room`, "warn", true);
      this.peers.delete(data.kickedPeer);
      this.peerInfo.delete(data.kickedPeer);
      this.peerKeys.delete(data.kickedPeer);
      this.peerLastSeen.delete(data.kickedPeer);
      // Also remove from join order
      this.peerJoinOrder = this.peerJoinOrder.filter(
        (id) => id !== data.kickedPeer,
      );
      this.updateConnectionInfo();
    }
  }

  /**
   * Handle user-joined notification (from host to other clients)
   * @param {Object} data - User joined notification data
   */
  handleUserJoined(data) {
    // Host already has this user, skip
    if (this.isHost) return;

    // Add the new user to our peer list
    if (
      data.newUser &&
      data.newUser !== this.peerId &&
      !this.peers.has(data.newUser)
    ) {
      const displayName = data.newUsername || "Anonymous";
      this.log(`${displayName} joined`, "success", true);

      this.peers.add(data.newUser);
      this.peerInfo.set(data.newUser, {
        username: displayName,
        color: this.generateColorFromString(data.newUser),
      });

      // Store ECDH keys (needed for re-keying if we become host)
      if (data.newUserEpub) {
        this.peerKeys.set(data.newUser, {
          epub: data.newUserEpub,
          pub: data.newUserPub,
        });
      }

      // Track join order for auto-promote
      if (!this.peerJoinOrder.includes(data.newUser)) {
        this.peerJoinOrder.push(data.newUser);
      }

      this.updateConnectionInfo();
    }
  }

  /**
   * Handle host promotion notification
   * @param {Object} data - Promotion notification data
   */
  async handlePromoteNotify(data) {
    // Update who the host is
    this.hostPeerId = data.newHost;

    // Check if we're the new host
    if (data.newHost === this.peerId) {
      this.log("You are now the host!", "success", true);

      // Set host state
      this.isHost = true;

      // Decrypt secrets from old host using ECDH
      const oldHostKeys = this.peerKeys.get(data.sender);
      if (oldHostKeys && oldHostKeys.epub) {
        try {
          const dhKey = await SEA.secret(oldHostKeys.epub, this.seaKeyPair);

          // Decrypt sharedSecret (manual promote sends encrypted, auto-promote doesn't)
          if (data.encryptedSharedSecret) {
            const decryptedSecret = await SEA.decrypt(
              data.encryptedSharedSecret,
              dhKey,
            );
            if (decryptedSecret) {
              this.sharedSecret = decryptedSecret;
              this.log("Received encrypted room key from old host", "info");
            }
          }

          // Decrypt roomPassword if provided
          if (data.encryptedRoomPassword) {
            const decryptedPassword = await SEA.decrypt(
              data.encryptedRoomPassword,
              dhKey,
            );
            if (decryptedPassword) {
              this.roomPassword = decryptedPassword;
            }
          }
        } catch (e) {
          this.log(
            `Failed to decrypt secrets from old host: ${e.message}`,
            "warn",
          );
        }
      }

      this.maxUsers = data.maxUsers || 10;
      this.isPublic = data.isPublic === "true";
      this.roomName = data.roomName || null;
      // Parse kickedUsers from comma-separated string
      const kickedList = data.kickedUsers
        ? data.kickedUsers.split(",").filter((x) => x)
        : [];
      this.kickedUsers = new Set(kickedList);

      // Receive peerKeys from old host (needed for re-keying after kicks)
      if (data.peerKeys) {
        try {
          const keysArray = JSON.parse(data.peerKeys);
          for (const keyData of keysArray) {
            if (keyData.peerId && keyData.epub) {
              this.peerKeys.set(keyData.peerId, {
                epub: keyData.epub,
                pub: keyData.pub,
              });
            }
          }
          this.log(
            `Received ${keysArray.length} peer keys from old host`,
            "info",
          );
        } catch (e) {
          this.log(`Failed to parse peer keys: ${e.message}`, "warn");
        }
      }

      this.updateConnectionInfo();

      // Update public listing if public
      if (this.isPublic) {
        this.updatePublicListing();
      }

      // Trigger UI update
      if (this.onPromoted) {
        this.onPromoted();
      }
      return;
    }

    // All other clients get notified about host change
    // Cache room settings in case we need to auto-promote later
    // Note: roomPassword is NOT cached for security reasons
    if (data.maxUsers || data.kickedUsers) {
      const kickedList = data.kickedUsers
        ? data.kickedUsers.split(",").filter((x) => x)
        : [];
      this.cachedRoomSettings = {
        maxUsers: data.maxUsers || 10,
        // roomPassword intentionally NOT stored - security risk
        isPublic: data.isPublic === "true",
        roomName: data.roomName || null,
        kickedUsers: kickedList,
      };
    }

    // Also store peerKeys if provided (for potential future auto-promote)
    if (data.peerKeys) {
      try {
        const keysArray = JSON.parse(data.peerKeys);
        for (const keyData of keysArray) {
          if (
            keyData.peerId &&
            keyData.epub &&
            keyData.peerId !== this.peerId
          ) {
            this.peerKeys.set(keyData.peerId, {
              epub: keyData.epub,
              pub: keyData.pub,
            });
          }
        }
      } catch (e) {
        // Ignore parse errors for non-host peers
      }
    }

    const newHostInfo = this.peerInfo.get(data.newHost);
    const newHostName = newHostInfo ? newHostInfo.username : "User";
    this.log(`${newHostName} is now the host`, "info", true);
    this.updateConnectionInfo();
  }

  /**
   * Handle heir-secrets message (secrets sent by host to potential heir)
   * @param {Object} data - Message data with encrypted secrets
   */
  async handleHeirSecrets(data) {
    // Only process if we are the target
    if (data.target !== this.peerId) {
      return;
    }

    // Accept from current host OR from anyone we have keys for
    // (heir-secrets might arrive before promote-notify due to Gun.js message ordering)
    // Signature verification already ensures the sender is legitimate
    const senderKeys = this.peerKeys.get(data.sender);
    if (!senderKeys || !senderKeys.epub) {
      this.log("Cannot decrypt heir-secrets: missing sender keys", "warn");
      return;
    }

    try {
      const dhKey = await SEA.secret(senderKeys.epub, this.seaKeyPair);
      this.cachedHeirSecrets = {
        sharedSecret: data.encryptedSharedSecret
          ? await SEA.decrypt(data.encryptedSharedSecret, dhKey)
          : null,
        roomPassword: data.encryptedRoomPassword
          ? await SEA.decrypt(data.encryptedRoomPassword, dhKey)
          : null,
      };
      this.log(`Received heir secrets from ${data.sender}`, "info");
    } catch (e) {
      this.log(`Failed to decrypt heir-secrets: ${e.message}`, "warn");
    }
  }

  /**
   * Kick a user from the room (host only)
   * @param {string} peerId - ID of peer to kick
   */
  async kickUser(peerId) {
    if (!this.isHost) return;

    const userInfo = this.peerInfo.get(peerId);
    const username = userInfo ? userInfo.username : "User";

    this.kickedUsers.add(peerId);

    // Send kick message to the kicked user
    let kickMsg = {
      id: this.generateId(),
      type: "kick",
      sender: this.peerId,
      target: peerId,
      timestamp: Date.now(),
    };
    kickMsg = await this.signMessage(kickMsg);
    this.room.get("messages").get(kickMsg.id).put(kickMsg);

    // Notify all other peers about the kick
    let kickNotifyMsg = {
      id: this.generateId(),
      type: "kick-notify",
      sender: this.peerId,
      kickedPeer: peerId,
      timestamp: Date.now(),
    };
    kickNotifyMsg = await this.signMessage(kickNotifyMsg);
    this.room.get("messages").get(kickNotifyMsg.id).put(kickNotifyMsg);

    // Remove from local state
    this.peers.delete(peerId);
    this.peerInfo.delete(peerId);
    this.peerKeys.delete(peerId);
    this.peerLastSeen.delete(peerId);
    // Also remove from join order
    this.peerJoinOrder = this.peerJoinOrder.filter((id) => id !== peerId);

    this.log(`Kicked ${username} from room`, "warn", true);

    // Re-key: Generate new shared secret and distribute to remaining peers
    // This ensures kicked user can't read new messages
    if (this.peers.size > 0) {
      await this.rekeyRoom();
    }

    // Update heir secrets since peer list changed
    await this.sendHeirSecrets();

    this.updateConnectionInfo();
  }

  /**
   * Generate new room key and distribute to all remaining peers
   * Called after kicking a user to invalidate their key
   */
  async rekeyRoom() {
    this.log("Generating new room key...", "info");

    // Generate new shared secret
    const newSecret = new Uint8Array(32);
    crypto.getRandomValues(newSecret);
    const newSharedSecret = Array.from(newSecret, (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");

    // Encrypt new secret for each remaining peer using their ECDH key
    const encryptedKeys = {};
    for (const [peerId, keys] of this.peerKeys.entries()) {
      if (this.peers.has(peerId) && keys.epub) {
        try {
          const derivedKey = await SEA.secret(keys.epub, this.seaKeyPair);
          const encrypted = await SEA.encrypt(newSharedSecret, derivedKey);
          encryptedKeys[peerId] = encrypted;
        } catch (err) {
          this.log(
            `Failed to encrypt key for ${peerId}: ${err.message}`,
            "error",
          );
        }
      }
    }

    // Broadcast rekey message
    let rekeyMsg = {
      id: this.generateId(),
      type: "rekey",
      sender: this.peerId,
      encryptedKeys: JSON.stringify(encryptedKeys),
      timestamp: Date.now(),
    };
    rekeyMsg = await this.signMessage(rekeyMsg);
    this.room.get("messages").get(rekeyMsg.id).put(rekeyMsg);

    // Update our own key
    this.sharedSecret = newSharedSecret;
    this.log(
      "Room key rotated (kicked user can no longer read messages)",
      "success",
      true,
    );
  }

  /**
   * Handle rekey message (new room key after someone was kicked)
   * @param {Object} data - Rekey message data
   */
  async handleRekey(data) {
    // Only process if we're not the host (host already has new key)
    if (this.isHost) return;

    try {
      const encryptedKeys = JSON.parse(data.encryptedKeys);
      const myEncryptedKey = encryptedKeys[this.peerId];

      if (!myEncryptedKey) {
        this.log("No new key for us in rekey message", "warn");
        return;
      }

      // Get host's public key
      const hostKeys = this.peerKeys.get(data.sender);
      if (!hostKeys || !hostKeys.epub) {
        this.log("Cannot decrypt new key: missing host public key", "error");
        return;
      }

      // Decrypt new shared secret
      const derivedKey = await SEA.secret(hostKeys.epub, this.seaKeyPair);
      const newSharedSecret = await SEA.decrypt(myEncryptedKey, derivedKey);

      if (newSharedSecret) {
        this.sharedSecret = newSharedSecret;
        this.log("Room key updated", "info", true);
      }
    } catch (err) {
      this.log(`Failed to process rekey: ${err.message}`, "error");
    }
  }

  /**
   * Promote another user to host (host only)
   * @param {string} peerId - ID of peer to promote
   */
  async promoteToHost(peerId) {
    if (!this.isHost) {
      this.log("Cannot promote: not host", "error", true);
      return;
    }

    const userInfo = this.peerInfo.get(peerId);
    const username = userInfo ? userInfo.username : "User";

    this.log(`Transferring host to ${username}...`, "info", true);

    // Get new host's public key for encryption
    const newHostKeys = this.peerKeys.get(peerId);
    if (!newHostKeys || !newHostKeys.epub) {
      this.log(
        "Cannot promote: missing new host's encryption key",
        "error",
        true,
      );
      return;
    }

    // Encrypt sharedSecret for the new host using ECDH
    const dhKey = await SEA.secret(newHostKeys.epub, this.seaKeyPair);
    const encryptedSharedSecret = await SEA.encrypt(this.sharedSecret, dhKey);

    // Encrypt roomPassword for the new host (if set)
    const encryptedRoomPassword = this.roomPassword
      ? await SEA.encrypt(this.roomPassword, dhKey)
      : null;

    // Serialize peerKeys for transfer (needed for re-keying after kicks)
    // Include all peers EXCEPT the new host (they have their own keys)
    const peerKeysArray = [];
    for (const [pid, keys] of this.peerKeys.entries()) {
      if (pid !== peerId) {
        // Don't send the new host their own keys
        peerKeysArray.push({ peerId: pid, epub: keys.epub, pub: keys.pub });
      }
    }
    // Also include the old host's (our) own keys so new host can re-key for us
    peerKeysArray.push({
      peerId: this.peerId,
      epub: this.seaKeyPair.epub,
      pub: this.seaKeyPair.pub,
    });

    // Send promote-notify with ENCRYPTED sensitive data
    let promoteNotifyMsg = {
      id: this.generateId(),
      type: "promote-notify",
      sender: this.peerId,
      oldHost: this.peerId,
      newHost: peerId,
      encryptedSharedSecret: encryptedSharedSecret, // ENCRYPTED for new host only
      encryptedRoomPassword: encryptedRoomPassword, // ENCRYPTED for new host only
      maxUsers: this.maxUsers,
      isPublic: this.isPublic ? "true" : "false",
      roomName: this.roomName || "",
      kickedUsers: Array.from(this.kickedUsers).join(","), // Not sensitive
      peerKeys: JSON.stringify(peerKeysArray), // Public keys - OK to share
      timestamp: Date.now(),
    };
    promoteNotifyMsg = await this.signMessage(promoteNotifyMsg);

    this.room.get("messages").get(promoteNotifyMsg.id).put(promoteNotifyMsg);

    // Transfer complete - demote self and update host tracking
    this.isHost = false;
    this.hostPeerId = peerId; // Track the new host
    this.log(`${username} is now the host`, "success", true);
    this.updateConnectionInfo();
  }

  /**
   * Set room password (host only)
   * @param {string|null} password - Password to set, or null to remove
   */
  async setRoomPassword(password) {
    if (!this.isHost) {
      this.log("Cannot set password: not host", "error", true);
      return;
    }
    // Store hashed password with roomId as salt
    this.roomPassword = password
      ? await this.hashPassword(password, this.roomId)
      : null;
    this.log(
      password ? "Room password set" : "Room password removed",
      "success",
      true,
    );
    // Update heir secrets with new password
    await this.sendHeirSecrets();
  }

  /**
   * Set maximum users (host only)
   * @param {number} max - Maximum number of users (1-256)
   */
  setMaxUsers(max) {
    if (!this.isHost) {
      this.log("Cannot set max users: not host", "error", true);
      return;
    }
    this.maxUsers = Math.min(256, Math.max(1, max));
    this.log(`Max users set to ${this.maxUsers}`, "success", true);
  }

  /**
   * Set room visibility (host only)
   * @param {boolean} isPublic - Whether the room is public
   * @param {string|null} roomName - Optional room name for public listing
   */
  setRoomVisibility(isPublic, roomName = null) {
    if (!this.isHost) {
      this.log("Cannot set visibility: not host", "error", true);
      return;
    }

    const wasPublic = this.isPublic;
    this.isPublic = isPublic;
    this.roomName = roomName;

    if (isPublic) {
      this.updatePublicListing();
      this.log(
        `Room is now public${roomName ? ` as "${roomName}"` : ""}`,
        "success",
        true,
      );
    } else {
      if (wasPublic) {
        this.removePublicListing();
      }
      this.log("Room is now private", "success", true);
    }
  }

  /**
   * Update public room listing in Gun
   */
  updatePublicListing() {
    if (!this.gun || !this.isPublic || !this.isHost) return;

    const listing = {
      roomId: this.roomId,
      roomName: this.roomName || `${this.username}'s Room`,
      hostName: this.username,
      userCount: this.peers.size + 1,
      maxUsers: this.maxUsers,
      hasPassword: !!this.roomPassword,
      lastUpdate: Date.now(),
    };

    this.gun.get("enigmajs-public-rooms").get(this.roomId).put(listing);
  }

  /**
   * Remove public room listing from Gun
   */
  removePublicListing() {
    if (!this.gun) return;
    this.gun.get("enigmajs-public-rooms").get(this.roomId).put(null);
  }

  /**
   * Get list of public rooms (static method, can be called without instance)
   * @param {Function} callback - Called with array of public rooms
   */
  static getPublicRooms(callback) {
    const gun = Gun({
      peers: [
        "https://gun-manhattan.herokuapp.com/gun",
        "https://gun-us.herokuapp.com/gun",
        "https://gun-eu.herokuapp.com/gun",
        "https://gun-gun.herokuapp.com/gun",
        "https://gunjs.herokuapp.com/gun",
        "https://gun.o8.is/gun",
        "https://peer.wallie.io/gun",
        "https://gundb-relay-mlccl.ondigitalocean.app/gun",
        "https://gun-relay.scuffle.de/gun",
        "https://plankton-app-6qfp3.ondigitalocean.app/gun",
      ],
      localStorage: false,
      radisk: false,
    });

    const rooms = new Map();
    const staleThreshold = 90000; // 90 seconds (3x heartbeat interval for safety)

    gun
      .get("enigmajs-public-rooms")
      .map()
      .on((data, roomId) => {
        if (!data || !data.roomId) {
          rooms.delete(roomId);
        } else if (Date.now() - data.lastUpdate < staleThreshold) {
          rooms.set(roomId, data);
        } else {
          rooms.delete(roomId);
        }

        // Debounce callback
        clearTimeout(gun._roomsTimeout);
        gun._roomsTimeout = setTimeout(() => {
          callback(Array.from(rooms.values()));
        }, 100);
      });

    return gun; // Return gun instance so caller can .off() when done
  }

  /**
   * Send a ping message
   */
  async sendPing() {
    if (!this.room) return;
    const pingId = this.generateId();
    let pingMsg = {
      id: pingId,
      type: "ping",
      sender: this.peerId,
      timestamp: Date.now(),
    };
    pingMsg = await this.signMessage(pingMsg);
    // Track this ping for latency measurement
    this.pendingPings.set(pingId, Date.now());
    // Clean up old pending pings (> 10 seconds old)
    for (const [id, time] of this.pendingPings) {
      if (Date.now() - time > 10000) {
        this.pendingPings.delete(id);
      }
    }
    this.room.get("messages").get(pingMsg.id).put(pingMsg);
  }

  /**
   * Send an encrypted message to the room
   * @param {string} text - Message text to send
   * @returns {Promise<void>}
   */
  async sendMessage(text) {
    if (!this.room || !this.sharedSecret) {
      this.log("Cannot send: not connected or no shared key", "error", true);
      return;
    }

    try {
      this.log(
        `Encrypting message: "${text.substring(0, 30)}${text.length > 30 ? "..." : ""}"`,
        "info",
      );

      // Encrypt using shared secret (simple string password)
      const encrypted = await SEA.encrypt(text, this.sharedSecret);
      this.log(`Message encrypted (length: ${encrypted?.length || 0})`, "info");

      let msg = {
        id: this.generateId(),
        type: "message",
        sender: this.peerId,
        encrypted: encrypted,
        timestamp: Date.now(),
      };
      msg = await this.signMessage(msg);

      this.room.get("messages").get(msg.id).put(msg);
      this.log("Message sent to Gun network", "info");

      this.messageCount++;
      this.lastMessageTime = new Date().toLocaleTimeString();
      this.updateConnectionInfo();
    } catch (e) {
      this.log(`Send error: ${e.message}`, "error", true);
    }
  }

  /**
   * Update connection info and notify callback
   */
  updateConnectionInfo() {
    this.onConnectionInfo({
      peerId: this.peerId,
      roomId: this.roomId,
      isHost: this.isHost,
      connected: this.connected,
      peers: Array.from(this.peers),
      messageCount: this.messageCount,
      lastMessageTime: this.lastMessageTime,
    });
  }

  /**
   * Generate QR code for room ID
   * @param {string} elementId - ID of DOM element to render QR code into
   * @param {string} peerId - Peer/Room ID to encode
   */
  generateQR(elementId, peerId) {
    const el = document.getElementById(elementId);
    el.innerHTML = "";
    new QRCode(el, {
      text: peerId,
      width: 256,
      height: 256,
      colorDark: "#667eea",
      colorLight: "#ffffff",
    });
    this.log("QR code generated", "success");
  }

  /**
   * Start QR code scanner using device camera
   * @param {HTMLVideoElement} videoElement - Video element to display camera feed
   * @param {Function} onScan - Callback when QR code is scanned
   * @returns {Promise<void>}
   */
  async startQRScanner(videoElement, onScan) {
    this.log("Starting QR scanner...", "info");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      videoElement.srcObject = stream;
      videoElement.style.display = "block";

      const canvas = document.getElementById("canvas");
      const ctx = canvas.getContext("2d");
      let scanning = true;

      const scan = () => {
        if (!scanning) return;

        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);

          if (code) {
            this.log(`QR code scanned: ${code.data}`, "success", true);
            scanning = false;
            stream.getTracks().forEach((track) => track.stop());
            videoElement.style.display = "none";
            onScan(code.data);
            return;
          }
        }
        requestAnimationFrame(scan);
      };

      videoElement.addEventListener("loadeddata", () => {
        this.log("Camera ready, scanning...", "info");
        scan();
      });
    } catch (err) {
      this.log(`Camera error: ${err.message}`, "error");
    }
  }

  /**
   * Scan QR code from uploaded image file
   * @param {File} imageFile - Image file to scan
   * @param {Function} onScan - Callback when QR code is found
   */
  scanQRFromImage(imageFile, onScan) {
    this.log("Scanning QR from image...", "info");

    const canvas = document.getElementById("qr-canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        this.log(`QR code found: ${code.data}`, "success", true);
        onScan(code.data);
      } else {
        this.log(`No QR code found in image`, "error");
      }
    };

    img.src = URL.createObjectURL(imageFile);
  }
}
