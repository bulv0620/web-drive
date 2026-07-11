<template>
  <div class="video-preview" @mousedown.self="$emit('close')">
    <div class="video-preview-canvas">
      <div class="video-preview-player-frame">
        <div v-if="!ready && !failed" class="video-preview-status" role="status" :aria-label="loadingText">
          <LoaderCircle class="video-preview-spinner" aria-hidden="true" />
        </div>

        <div v-else-if="failed" class="video-preview-status is-error" role="alert">
          <VideoOff aria-hidden="true" />
          <span>{{ fallbackText }}</span>
        </div>

        <video
          :key="src"
          class="video-preview-player"
          :class="{ ready }"
          controls
          playsinline
          preload="metadata"
          @loadedmetadata="handleReady"
          @canplay="handleReady"
          @error="handleError"
        >
          <source :src="src" :type="mime || undefined" />
          {{ fallbackText }}
        </video>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from "vue";
import { LoaderCircle, VideoOff } from "@lucide/vue";

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  mime: {
    type: String,
    default: ""
  },
  loadingText: {
    type: String,
    default: "Loading video"
  },
  fallbackText: {
    type: String,
    default: "Your browser does not support video playback."
  }
});

defineEmits(["close"]);

const ready = ref(false);
const failed = ref(false);

watch(
  () => props.src,
  () => {
    ready.value = false;
    failed.value = false;
  }
);

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
.video-preview {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: clamp(16px, 3vw, 36px) clamp(64px, 6vw, 92px);
  overflow: hidden;
}

.video-preview-canvas {
  container-type: size;
  width: min(100%, 1440px);
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: transparent;
}

.video-preview-player-frame {
  position: relative;
  width: min(calc(100cqw - 32px), calc(177.7778cqh - 56.8889px), 1180px);
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: var(--radius-sm);
  background: #000000;
}

.video-preview-player {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity 160ms ease;
}

.video-preview-player.ready {
  opacity: 1;
}

.video-preview-status {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: rgba(248, 250, 252, 0.82);
}

.video-preview-status.is-error {
  padding: 24px;
  color: rgba(248, 250, 252, 0.88);
  font-size: 14px;
  font-weight: 650;
  text-align: center;
}

.video-preview-status.is-error svg {
  width: 28px;
  height: 28px;
}

.video-preview-spinner {
  width: 28px;
  height: 28px;
  color: #ffffff;
  animation: video-preview-spin 800ms linear infinite;
}

@keyframes video-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .video-preview {
    padding: 10px;
  }

  .video-preview-player-frame {
    width: min(calc(100cqw - 16px), calc(177.7778cqh - 28.4444px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .video-preview-player {
    transition: none;
  }

  .video-preview-spinner {
    animation-duration: 1600ms;
  }
}
</style>
