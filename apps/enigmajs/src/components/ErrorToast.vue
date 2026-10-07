<script setup>
import { useChatStore } from "../stores/chat";

const store = useChatStore();
</script>

<template>
  <Transition name="slide">
    <div
      v-if="store.errorMessage"
      class="error-toast"
      :class="store.errorType"
      @click="store.clearError"
    >
      <div class="toast-content">
        <span class="toast-message">{{ store.errorMessage }}</span>
        <button class="toast-close" @click.stop="store.clearError">×</button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.error-toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  max-width: 90%;
  width: 400px;
  padding: 16px 20px;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.error-toast.error {
  background: linear-gradient(
    135deg,
    rgba(220, 53, 69, 0.95),
    rgba(180, 30, 45, 0.95)
  );
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.error-toast.warning {
  background: linear-gradient(
    135deg,
    rgba(255, 193, 7, 0.95),
    rgba(220, 160, 0, 0.95)
  );
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #1a1a2e;
}

.error-toast.info {
  background: linear-gradient(
    135deg,
    rgba(23, 162, 184, 0.95),
    rgba(15, 120, 140, 0.95)
  );
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toast-message {
  flex: 1;
  font-weight: 500;
  font-size: 14px;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 24px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
  line-height: 1;
}

.toast-close:hover {
  opacity: 1;
}

/* Slide transition */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
