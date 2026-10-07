<script setup>
import { ref } from "vue";

const isOpen = ref(false);

function open() {
  isOpen.value = true;
}

function close() {
  isOpen.value = false;
}

defineExpose({ open });
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <button class="close-btn" @click="close">✕</button>

      <h2>
        <svg
          class="title-lock"
          viewBox="0 0 24 24"
          fill="none"
          stroke="url(#lockGrad)"
          stroke-width="2"
        >
          <defs>
            <linearGradient id="lockGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color: #ff6b35" />
              <stop offset="100%" style="stop-color: #ff8c42" />
            </linearGradient>
          </defs>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span class="title-text">About EnigmaJS</span>
      </h2>
      <p class="tagline">Private chat that leaves no trace</p>

      <div class="feature-badges">
        <span
          class="badge badge-ephemeral"
          title="Messages exist only during the session"
        >
          🔥 Ephemeral
        </span>
        <span
          class="badge badge-e2e"
          title="Encrypted before leaving your device"
        >
          🔒 E2E Encrypted
        </span>
        <span
          class="badge badge-decentralized"
          title="No central server stores data"
        >
          🌐 Decentralized
        </span>
        <span class="badge badge-noserver" title="No accounts required">
          👤 No Registration
        </span>
      </div>

      <div class="info-section">
        <h3>How it works</h3>
        <ol>
          <li><strong>Host creates room</strong> → Gets a unique room code</li>
          <li><strong>Share the code</strong> → Via QR, copy/paste, or link</li>
          <li>
            <strong>Others join</strong> → Encrypted connection established
          </li>
          <li><strong>Chat privately</strong> → All messages E2E encrypted</li>
          <li><strong>Room closes</strong> → Everything disappears forever</li>
        </ol>
      </div>

      <div class="info-section">
        <h3>What this means</h3>
        <ul>
          <li>
            <strong>Ephemeral:</strong> No chat history saved anywhere. When the
            room ends, messages are gone.
          </li>
          <li>
            <strong>E2E Encrypted:</strong> Messages encrypted on your device.
            Relay servers only see encrypted blobs.
          </li>
          <li>
            <strong>Decentralized:</strong> Uses
            <a href="https://gun.eco/" target="_blank">Gun.js</a> distributed
            relays. No single point of failure.
          </li>
        </ul>
      </div>

      <div class="info-section honest">
        <h3>Honest limitations</h3>
        <ul>
          <li>Can't prevent screenshots or copy/paste</li>
          <li>Can't verify who you're talking to (share codes securely)</li>
          <li>Relay servers could log metadata (IPs, timestamps)</li>
          <li>Decentralized sync can have delays</li>
        </ul>
      </div>

      <p class="footer">
        <a
          href="https://github.com/derlocke-ng/enigmajs"
          target="_blank"
          rel="noopener"
          >Source Code</a
        >
        • PolyForm Noncommercial License 1.0.0
      </p>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: var(--section-bg);
  border-radius: 16px;
  padding: 30px;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
  border: 2px solid var(--accent-tertiary);
}

.close-btn {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 5px 10px;
  border-radius: 6px;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--btn-secondary-bg);
  color: var(--text-primary);
}

h2 {
  margin: 0 0 5px 0;
  font-size: 1.5em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-lock {
  width: 28px;
  height: 28px;
}

.title-text {
  background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.tagline {
  color: var(--text-secondary);
  margin: 0 0 20px 0;
  font-style: italic;
}

.feature-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 25px;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: help;
}

.badge-ephemeral {
  background: linear-gradient(135deg, #ff6b35 0%, #ff8c42 100%);
  color: white;
}

.badge-e2e {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.badge-decentralized {
  background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
  color: white;
}

.badge-noserver {
  background: linear-gradient(135deg, #4a4a4a 0%, #6a6a6a 100%);
  color: white;
}

.info-section {
  margin-bottom: 20px;
}

.info-section h3 {
  font-size: 1em;
  margin: 0 0 10px 0;
  color: var(--accent-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.info-section ol,
.info-section ul {
  margin: 0;
  padding-left: 20px;
}

.info-section li {
  margin-bottom: 6px;
  color: var(--text-primary);
  font-size: 0.9em;
}

.info-section.honest {
  background: rgba(255, 107, 53, 0.1);
  padding: 15px;
  border-radius: 10px;
  border-left: 3px solid #ff6b35;
}

.info-section.honest h3 {
  color: #ff6b35;
}

.info-section a {
  color: var(--accent-primary);
}

.footer {
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.85em;
  margin: 20px 0 0 0;
  padding-top: 15px;
  border-top: 1px solid var(--input-border);
}

.footer a {
  color: var(--accent-primary);
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}
</style>
