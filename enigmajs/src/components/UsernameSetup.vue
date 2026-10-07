<script setup>
import { ref } from "vue";
import { useChatStore } from "../stores/chat";

const store = useChatStore();
const displayName = ref("");

function submit() {
  const name = displayName.value.trim();
  if (!name) {
    alert("Please enter a display name");
    return;
  }
  store.setUsername(name);
}
</script>

<template>
  <div class="section">
    <h2>Welcome!</h2>
    <p class="hint">First, choose your display name:</p>

    <div class="input-group">
      <label for="display-name">Your Display Name:</label>
      <input
        id="display-name"
        v-model="displayName"
        type="text"
        placeholder="Enter your name..."
        maxlength="20"
        @keypress.enter="submit"
      />
    </div>

    <button class="btn-primary full-width" @click="submit">Continue</button>
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
  margin-bottom: 10px;
}

.hint {
  margin-bottom: 20px;
  color: var(--text-secondary);
}

.input-group {
  margin-bottom: 20px;
}

.input-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
  color: var(--text-secondary);
}

.input-group input {
  width: 100%;
  padding: 12px;
  border: 2px solid var(--accent-primary);
  border-radius: 8px;
  font-size: 14px;
  font-family: "Barlow", sans-serif;
  background: var(--input-bg);
  color: var(--text-primary);
}

.input-group input:focus {
  outline: none;
  border-color: var(--accent-secondary);
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

.full-width {
  width: 100%;
}
</style>
