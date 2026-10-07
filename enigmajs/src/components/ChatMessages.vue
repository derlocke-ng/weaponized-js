<script setup>
import { ref, nextTick, watch } from "vue";
import { useChatStore } from "../stores/chat";
import { useEnigma } from "../composables/useEnigma";

const store = useChatStore();
const enigma = useEnigma();

const messageInput = ref("");
const messagesContainer = ref(null);
const showScrollButton = ref(false);

function sendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;

  enigma.sendMessage(text);
  messageInput.value = "";

  // Scroll to bottom after sending
  nextTick(() => {
    scrollToBottom();
  });
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTo({
      top: messagesContainer.value.scrollHeight,
      behavior: "smooth",
    });
  }
}

function handleScroll() {
  if (!messagesContainer.value) return;

  const { scrollHeight, scrollTop, clientHeight } = messagesContainer.value;
  const isAtBottom = scrollHeight - scrollTop <= clientHeight + 50;
  showScrollButton.value = !isAtBottom;
}

// Auto-scroll when new messages arrive (if already at bottom)
watch(
  () => store.messages.length,
  () => {
    nextTick(() => {
      if (!showScrollButton.value && messagesContainer.value) {
        messagesContainer.value.scrollTop =
          messagesContainer.value.scrollHeight;
      }
    });
  },
);
</script>

<template>
  <div class="chat-area">
    <h3>💬 Chat</h3>

    <div ref="messagesContainer" class="chat-messages" @scroll="handleScroll">
      <div
        v-for="msg in store.messages"
        :key="msg.id"
        class="message"
        :class="{ sent: msg.isSent }"
        :style="{
          backgroundColor: msg.color,
          color: enigma.getContrastingTextColor(msg.color),
        }"
      >
        <div class="message-sender">{{ msg.username }}</div>
        <div class="message-text">{{ msg.message }}</div>
        <div class="message-time">{{ msg.timestamp }}</div>
      </div>

      <div v-if="store.messages.length === 0" class="no-messages">
        No messages yet. Say hello! 👋
      </div>
    </div>

    <button
      v-show="showScrollButton"
      class="scroll-to-bottom"
      @click="scrollToBottom"
    >
      ↓
    </button>

    <div class="message-input-container">
      <input
        v-model="messageInput"
        type="text"
        class="message-input"
        placeholder="Type a message..."
        @keypress.enter="sendMessage"
      />
      <button class="btn-primary" @click="sendMessage">Send</button>
    </div>
  </div>
</template>

<style scoped>
.chat-area {
  margin-top: 20px;
  position: relative;
}

h3 {
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 15px;
}

.chat-messages {
  background: var(--chat-messages-bg);
  border: 1px solid var(--chat-messages-border);
  border-radius: 8px;
  padding: 15px;
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 10px;
}

.message {
  padding: 12px 16px;
  margin: 8px 0;
  border-radius: 18px;
  max-width: 80%;
  font-weight: 500;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message.sent {
  margin-left: auto;
  text-align: right;
}

.message-sender {
  font-size: 11px;
  opacity: 0.8;
  font-weight: 600;
  margin-bottom: 3px;
}

.message-text {
  word-wrap: break-word;
}

.message-time {
  font-size: 10px;
  opacity: 0.6;
  margin-top: 4px;
  text-align: right;
}

.no-messages {
  text-align: center;
  color: var(--text-secondary);
  padding: 40px 20px;
  font-style: italic;
}

.scroll-to-bottom {
  position: absolute;
  bottom: 70px;
  right: 20px;
  background: var(--container-bg);
  color: var(--accent-primary);
  border: 2px solid var(--accent-primary);
  border-radius: 50%;
  width: 40px;
  height: 40px;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scroll-to-bottom:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
  background: var(--accent-primary);
  color: white;
}

.message-input-container {
  display: flex;
  gap: 8px;
}

.message-input {
  flex: 1;
  padding: 14px;
  border: 2px solid var(--input-border);
  border-radius: 12px;
  font-family: "Barlow", sans-serif;
  font-size: 15px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-weight: 500;
  transition: border 0.3s;
}

.message-input:focus {
  outline: none;
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px rgba(255, 107, 53, 0.1);
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
</style>
