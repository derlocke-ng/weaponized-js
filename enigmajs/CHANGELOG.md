# EnigmaJS Changelog

## [2.3.0] - 2026-01-18 - Leave Room & User List Sync

### ✨ New Features

- **Leave Room button** - Non-host users can now actively leave a room with a dedicated button, sending a `user-left` message to notify others immediately
- **Periodic user list sync** - Clients request updated user list from host every 30 seconds, cleaning up stale users that may have disconnected without notice

### Technical Details

- New `user-left` message type for graceful disconnects
- New `request-user-list` and `user-list-sync` message types for periodic sync
- `leaveRoom()` and `requestUserListSync()` added to useEnigma composable
- Automatic cleanup of users not in host's authoritative list

---

## [2.2.3] - 2026-01-18 - Heir Secrets Retry & UI Improvements

### Bug Fixes

- 🐛 **Heir-secrets retry mechanism** - `heir-secrets` messages now retry up to 5 times (300ms interval) when the host isn't known yet. Fixes race condition where secrets arrive before welcome message due to Gun.js message ordering.
- 🐛 **Deferred verification for heir-secrets** - Moved `heir-secrets` to skipVerification list, then performs mandatory signature verification inside handler after retry. Ensures secrets are always verified but tolerates arrival order issues.

### UI Improvements

- ✨ **Collapsible Share Room panel** - Share Room section is now collapsed by default with a toggle button, keeping the interface cleaner
- 📱 **Mobile CSS improvements** - Setting rows (Max Users, Password) now stack vertically on small screens (≤480px) for better usability
- 🎯 **Auto-open Share Room for hosts** - When hosting a room, the Share Room panel automatically opens so hosts can easily share the room link/QR

---

## [2.2.2] - 2026-01-18 - Skip Verification for Non-Critical Messages

### Bug Fixes

- 🐛 **Skip verification for ping/pong/user-joined** - These non-critical messages (UI updates only) now skip signature verification entirely. Fixes race condition where user-joined arrives before welcome is processed.

---

## [2.2.1] - 2026-01-18 - Heir Secrets Race Fix

### Bug Fixes

- 🐛 **Fixed heir-secrets race condition** - `heir-secrets` could arrive before `promote-notify` due to Gun.js message ordering. Now accepts secrets from any verified sender (signature verification ensures legitimacy).

---

## [2.2.0] - 2026-01-18 - Heir Secrets

### 🔐 New Feature

- **Password survives host disconnect** - Host now proactively sends encrypted secrets (roomPassword, sharedSecret) to the next-in-line peer. If host disconnects unexpectedly, the heir can take over with password intact.

### Technical Details

- New `heir-secrets` message type with ECDH encryption
- Secrets updated when: peer joins, peer kicked, password changes
- `selfPromote()` uses cached heir secrets if available

---

## [2.1.1] - 2026-01-18 - Race Condition Fix

### Bug Fixes

- 🐛 **Fixed user-joined verification race condition** - `user-joined` messages could arrive before `welcome` was processed, causing "unknown sender" errors. Now uses lenient verification (verify if known, allow if unknown) like ping/pong messages.

---

## [2.1.0] - 2026-01-18 - Security Hardening

### 🔒 Major Security Update

Comprehensive security audit and hardening of the encryption and messaging system.

### Security Improvements

#### Message Authentication (NEW)

- 🔒 **Message Signing** - All messages now cryptographically signed with sender's SEA private key
- 🔒 **Signature Verification** - Recipients verify signatures using sender's public key
- 🔒 **Sender Impersonation Prevention** - Attackers cannot forge messages as other users
- 🔒 **Control Message Protection** - Kick, promote, and rekey messages are now authenticated
- 🔒 **Deterministic JSON Signing** - Sorted keys ensure consistent signatures across Gun.js transport

#### Host Transfer Security (FIXED)

- 🔒 **Encrypted sharedSecret Transfer** - Was sent in PLAINTEXT, now encrypted via ECDH
- 🔒 **Encrypted roomPassword Transfer** - Was sent hashed, now encrypted via ECDH
- 🔒 **Secure Auto-Promote** - Password reset when host leaves (can't securely transfer without old host)

#### Peer Key Management (IMPROVED)

- 🔒 **Peer Keys in Welcome Message** - New joiners receive pub/epub keys of all existing peers
- 🔒 **peerKeys Transfer on Promotion** - New host receives all peer keys for re-keying capability
- 🔒 **ECDH Keys in user-joined** - All peers store keys for potential future host duties

#### Room Key Security (IMPROVED)

- 🔒 **Re-keying After Kick** - Generate new room key and distribute via ECDH to remaining peers
- 🔒 **Key Cleanup on Kick** - Clear sharedSecret, seaKeyPair, peerKeys when kicked
- 🔒 **Stale Peer Cleanup** - Remove timed-out peers before sending peer list to new joiners

### Technical Changes

- Added `signMessage()` method using `SEA.sign(content, seaKeyPair)`
- Added `verifySignature()` method using `SEA.verify(signature, pubKey)`
- Added `getSignableFields()` for deterministic field extraction per message type
- Strict signature verification for security-critical messages (kick, promote, rekey, etc.)
- Lenient verification for ping/pong (allow unknown senders for keepalive)
- Fixed SEA.verify returning parsed object instead of string (stringify for comparison)

### Bug Fixes

- Fixed ghost users appearing in user list after host migration
- Fixed peerJoinOrder not cleaned up on kick/kick-notify
- Fixed new joiners unable to verify messages from existing peers (missing keys)

---

## [2.0.0] - 2026-01-17 - Vue.js Migration

### 🚀 Major Rewrite

Complete migration from vanilla HTML/JS to Vue 3 with modern tooling.

### Architecture Changes

- **Vue 3 Composition API** - Modern reactive framework with `<script setup>`
- **Vite Build System** - Fast HMR development and optimized production builds
- **Pinia State Management** - Centralized store for app state
- **Component-Based Architecture** - Modular, reusable UI components
- **Composables** - `useEnigma` and `useQRScanner` for reusable logic

### New Features

#### Room Management

- ✨ **Public/Private Rooms** - Toggle room visibility with public room listing
- ✨ **Room Passwords** - Optional PIN protection for rooms
- ✨ **Configurable Room Size** - Set max users (2-256)
- ✨ **Host Migration** - Transfer host role to another user
- ✨ **Destroy Room** - Host can kick all users and close room
- ✨ **Auto-Promote** - Automatic host promotion when host leaves

#### Sharing & Connectivity

- ✨ **Share Link Button** - Copy room invite link to clipboard
- ✨ **QR Code Scanner** - Scan QR codes to join rooms (mobile-friendly)
- ✨ **10 Gun.js Relays** - Multiple public relays for better connectivity
- ✨ **Network Quality Indicator** - Real-time latency monitoring with signal bars
- ✨ **Keep-Alive** - Background ping to maintain connections on locked phones

#### User Experience

- ✨ **Browser Notifications** - Get notified of new messages when tab is inactive
- ✨ **Notification Sounds** - Audio alert for incoming messages
- ✨ **Message Timestamps** - See when each message was sent
- ✨ **User Colors** - Unique colors for each participant
- ✨ **User List Panel** - See all connected users with kick option for hosts
- ✨ **Auto-Scroll** - Smart scroll with "jump to bottom" button
- ✨ **Dark/Light Theme** - Toggle between themes

#### Error Handling

- ✨ **Error Toast Notifications** - User-friendly error messages
- ✨ **Connection Status** - Clear visual feedback for connection state
- ✨ **Better Error Messages** - Descriptive errors for connection failures

### Components Created

- `App.vue` - Main application container
- `AppHeader.vue` - Header with theme toggle and network indicator
- `UsernameSetup.vue` - Initial username entry
- `ModeSelector.vue` - Host/Join mode selection
- `ChatRoom.vue` - Main chat interface with settings panel
- `ChatMessages.vue` - Message list with auto-scroll
- `UserList.vue` - Connected users sidebar
- `StatusBadge.vue` - Connection status indicator
- `NetworkIndicator.vue` - Latency and signal quality
- `QRScanner.vue` - Camera-based QR code scanner
- `PublicRoomList.vue` - Browse and join public rooms
- `DebugPanel.vue` - Developer debugging tools

### Technical Improvements

- **HTTPS Development** - SSL enabled for camera/notification APIs
- **Modular Code** - EnigmaJS core extracted to reusable ES module
- **Reactive State** - All UI automatically updates on state changes
- **Clean Lifecycle** - Proper cleanup of Gun.js listeners and intervals
- **Error Boundaries** - Graceful error handling throughout

### Security

- 🔒 E2E encryption maintained (ECDH + AES-GCM)
- 🔒 No message persistence - ephemeral by design
- 🔒 Room passwords hashed before transmission
- 🔒 Cryptographically secure random for all keys

---

## [1.0.0] - Original Release

### Features

- Single-file HTML application (`index.html`)
- E2E encrypted P2P chat over Gun.js
- QR code room sharing
- Basic host/join functionality
- Dark mode support
- Verbose logging toggle
