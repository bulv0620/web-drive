<template>
  <div class="image-preview" @mousedown.self="$emit('close')">
    <el-button
      v-if="hasPrevious"
      class="common-button image-preview-nav previous"
      :icon="ChevronLeft"
      circle
      :aria-label="previousLabel"
      :title="previousLabel"
      @click="$emit('previous')"
    />

    <div class="image-preview-canvas">
      <div v-if="isLoading" class="image-preview-status" role="status" :aria-label="loadingText">
        <LoaderCircle class="image-preview-spinner" aria-hidden="true" />
      </div>

      <div v-else-if="hasError" class="image-preview-status is-error" role="alert">
        <ImageOff aria-hidden="true" />
        <span>{{ loadFailedText }}</span>
      </div>

      <img
        :key="src"
        class="image-preview-media"
        :class="{ loaded: isLoaded }"
        :src="src"
        :alt="item?.name || 'preview'"
        decoding="async"
        draggable="false"
        @load="handleLoad"
        @error="handleError"
      />
    </div>

    <el-button
      v-if="hasNext"
      class="common-button image-preview-nav next"
      :icon="ChevronRight"
      circle
      :aria-label="nextLabel"
      :title="nextLabel"
      @click="$emit('next')"
    />

    <div v-if="total > 1" class="image-preview-count">{{ index + 1 }} / {{ total }}</div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, ImageOff, LoaderCircle } from "@lucide/vue";
import { checkSession } from "../api/client.js";

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  item: {
    type: Object,
    default: null
  },
  index: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  hasPrevious: {
    type: Boolean,
    default: false
  },
  hasNext: {
    type: Boolean,
    default: false
  },
  previousLabel: {
    type: String,
    default: "Previous"
  },
  nextLabel: {
    type: String,
    default: "Next"
  },
  loadingText: {
    type: String,
    default: "Loading image"
  },
  loadFailedText: {
    type: String,
    default: "Failed to load image"
  }
});

defineEmits(["previous", "next", "close"]);

const loadedSrc = ref("");
const failedSrc = ref("");
const isLoaded = computed(() => Boolean(props.src) && loadedSrc.value === props.src);
const hasError = computed(() => Boolean(props.src) && failedSrc.value === props.src);
const isLoading = computed(() => Boolean(props.src) && !isLoaded.value && !hasError.value);

watch(
  () => props.src,
  () => {
    loadedSrc.value = "";
    failedSrc.value = "";
  }
);

function handleLoad(event) {
  const loadedUrl = event.currentTarget?.getAttribute("src") || "";
  if (loadedUrl !== props.src) return;
  loadedSrc.value = loadedUrl;
  failedSrc.value = "";
}

function handleError(event) {
  const failedUrl = event.currentTarget?.getAttribute("src") || "";
  if (failedUrl !== props.src) return;
  failedSrc.value = failedUrl;
  loadedSrc.value = "";
  checkSession().catch(() => {});
}
</script>

<style scoped>
.image-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: clamp(16px, 3vw, 36px) clamp(64px, 6vw, 92px);
  overflow: hidden;
}

.image-preview-canvas {
  position: relative;
  width: min(100%, 1440px);
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card-strong);
  box-shadow: var(--shadow-soft);
}

.image-preview-media {
  position: absolute;
  top: 50%;
  left: 50%;
  display: block;
  width: auto;
  height: auto;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 32px);
  object-fit: contain;
  opacity: 0;
  transform: translate(-50%, -50%);
  user-select: none;
  transition: opacity 160ms ease;
}

.image-preview-media.loaded {
  opacity: 1;
}

.image-preview-status {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--muted);
}

.image-preview-status.is-error {
  font-size: 14px;
  font-weight: 650;
}

.image-preview-status.is-error svg {
  width: 28px;
  height: 28px;
  color: var(--subtle);
}

.image-preview-spinner {
  width: 28px;
  height: 28px;
  color: var(--accent);
  animation: image-preview-spin 800ms linear infinite;
}

.image-preview-nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  transform: translateY(-50%);
}

.image-preview-nav.previous {
  left: clamp(10px, 2vw, 28px);
}

.image-preview-nav.next {
  right: clamp(10px, 2vw, 28px);
}

.image-preview-count {
  position: absolute;
  right: 18px;
  bottom: 18px;
  min-height: 30px;
  padding: 6px 11px;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: #475569;
  background: var(--card-strong);
  box-shadow: var(--shadow-soft);
  font-size: 12px;
  font-weight: 760;
  font-variant-numeric: tabular-nums;
}

@keyframes image-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .image-preview {
    padding: 10px;
  }

  .image-preview-nav.previous {
    left: 8px;
  }

  .image-preview-nav.next {
    right: 8px;
  }

  .image-preview-count {
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
  }

  .image-preview-media {
    max-width: calc(100% - 16px);
    max-height: calc(100% - 16px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .image-preview-media {
    transition: none;
  }

  .image-preview-spinner {
    animation-duration: 1600ms;
  }
}
</style>
