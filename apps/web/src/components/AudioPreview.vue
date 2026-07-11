<template>
  <div class="audio-preview" @mousedown.self="$emit('close')">
    <section class="audio-preview-card" :aria-busy="!ready && !failed">
      <div class="audio-preview-artwork" aria-hidden="true">
        <AudioLines />
      </div>

      <div class="audio-preview-player-frame">
        <div v-if="!ready && !failed" class="audio-preview-status" role="status">
          <LoaderCircle class="audio-preview-spinner" aria-hidden="true" />
          <span>{{ loadingText }}</span>
        </div>

        <div v-else-if="failed" class="audio-preview-status is-error" role="alert">
          <CircleAlert aria-hidden="true" />
          <span>{{ fallbackText }}</span>
          <button class="audio-preview-retry" type="button" @click="retry">
            <RotateCcw aria-hidden="true" />
            <span>{{ retryText }}</span>
          </button>
        </div>

        <audio
          :key="playerKey"
          class="audio-preview-player"
          :class="{ ready }"
          :aria-label="playerLabel"
          controls
          preload="metadata"
          @loadedmetadata="handleReady"
          @canplay="handleReady"
          @error="handleError"
        >
          <source :src="src" :type="mime || undefined" />
          {{ fallbackText }}
        </audio>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { AudioLines, CircleAlert, LoaderCircle, RotateCcw } from "@lucide/vue";

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  mime: {
    type: String,
    default: ""
  },
  playerLabel: {
    type: String,
    default: "Audio player"
  },
  loadingText: {
    type: String,
    default: "Loading audio"
  },
  fallbackText: {
    type: String,
    default: "Your browser does not support audio playback."
  },
  retryText: {
    type: String,
    default: "Retry"
  }
});

defineEmits(["close"]);

const ready = ref(false);
const failed = ref(false);
const playerKey = ref(0);

watch(
  () => props.src,
  () => reset()
);

function reset() {
  ready.value = false;
  failed.value = false;
  playerKey.value += 1;
}

function retry() {
  reset();
}

function handleReady() {
  ready.value = true;
  failed.value = false;
}

function handleError() {
  ready.value = false;
  failed.value = true;
}
</script>

<style scoped>
.audio-preview {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: clamp(20px, 5vw, 64px);
  overflow: auto;
}

.audio-preview-card {
  width: min(100%, 560px);
  min-width: 0;
  padding: clamp(24px, 5vw, 44px);
  display: grid;
  justify-items: center;
  gap: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-strong);
  box-shadow: var(--shadow-soft);
}

.audio-preview-artwork {
  width: clamp(104px, 22vw, 144px);
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border: 1px solid var(--el-color-primary-light-7);
  border-radius: 50%;
  color: var(--accent);
  background: var(--el-color-primary-light-9);
}

.audio-preview-artwork svg {
  width: 42%;
  height: 42%;
  stroke-width: 1.7;
}

.audio-preview-player-frame {
  position: relative;
  width: 100%;
  min-height: 56px;
  display: grid;
  place-items: center;
}

.audio-preview-player {
  grid-area: 1 / 1;
  display: block;
  width: 100%;
  min-height: 54px;
  opacity: 0;
  transition: opacity 160ms ease;
}

.audio-preview-player.ready {
  opacity: 1;
}

.audio-preview-status {
  grid-area: 1 / 1;
  z-index: 1;
  width: 100%;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 650;
  text-align: center;
}

.audio-preview-status.is-error {
  flex-direction: column;
  gap: 12px;
  color: var(--text);
}

.audio-preview-status.is-error > svg {
  width: 28px;
  height: 28px;
  color: var(--danger);
}

.audio-preview-spinner {
  width: 24px;
  height: 24px;
  color: var(--accent);
  animation: audio-preview-spin 800ms linear infinite;
}

.audio-preview-retry {
  min-height: 44px;
  padding: 0 18px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text);
  background: var(--card-strong);
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}

.audio-preview-retry:hover {
  border-color: var(--el-color-primary-light-5);
  color: var(--accent);
  background: var(--el-color-primary-light-9);
}

.audio-preview-retry:focus-visible {
  outline: 3px solid var(--el-color-primary-light-7);
  outline-offset: 2px;
}

.audio-preview-retry svg {
  width: 17px;
  height: 17px;
}

@keyframes audio-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .audio-preview {
    padding: 16px;
  }

  .audio-preview-card {
    padding: 24px 16px;
    gap: 24px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .audio-preview-player,
  .audio-preview-retry {
    transition: none;
  }

  .audio-preview-spinner {
    animation-duration: 1600ms;
  }
}
</style>
