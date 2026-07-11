<template>
  <Teleport to="body">
    <Transition name="file-preview-fade">
      <div
        v-if="visible"
        ref="overlayRef"
        class="file-preview-overlay"
        tabindex="-1"
        @mousedown.self="$emit('close')"
        @keydown.esc.prevent="$emit('close')"
        @keydown.left.prevent="handlePrevious"
        @keydown.right.prevent="handleNext"
      >
        <section class="file-preview-window" role="dialog" aria-modal="true" :aria-label="item?.name || title">
          <header class="file-preview-topbar">
            <div class="file-preview-title-group">
              <FileIcon v-if="item" :item="item" class="file-preview-icon" aria-hidden="true" />
              <div class="file-preview-title-copy">
                <div class="file-preview-name" :title="item?.name || title">{{ item?.name || title }}</div>
                <div v-if="meta" class="file-preview-meta">{{ meta }}</div>
              </div>
            </div>

            <div class="file-preview-actions">
              <el-button v-if="item" class="common-button" :icon="Download" circle :aria-label="downloadLabel" :title="downloadLabel" @click="$emit('download', item)" />
              <el-button class="common-button" :icon="X" circle :aria-label="closeLabel" :title="closeLabel" @click="$emit('close')" />
            </div>
          </header>

          <main class="file-preview-stage">
            <ImagePreview
              v-if="kind === 'image'"
              :key="src"
              :src="src"
              :item="item"
              :index="imageIndex"
              :total="imageTotal"
              :has-previous="hasPreviousImage"
              :has-next="hasNextImage"
              :previous-label="previousLabel"
              :next-label="nextLabel"
              :loading-text="imageLoadingText"
              :load-failed-text="imageLoadFailedText"
              @previous="handlePrevious"
              @next="handleNext"
              @close="$emit('close')"
            />
            <VideoPreview
              v-else-if="kind === 'video'"
              :src="src"
              :mime="item?.mime"
              :loading-text="videoLoadingText"
              :fallback-text="videoFallbackText"
              @close="$emit('close')"
            />
            <AudioPreview
              v-else-if="kind === 'audio'"
              :key="src"
              :src="src"
              :mime="item?.mime"
              :player-label="item?.name || title"
              :loading-text="audioLoadingText"
              :fallback-text="audioFallbackText"
              :retry-text="retryLabel"
              @close="$emit('close')"
            />
            <MarkdownPreview
              v-else-if="kind === 'markdown'"
              :key="src"
              :src="src"
              :item="item"
              :loading-text="markdownLoadingText"
              :load-failed-text="markdownLoadFailedText"
              :retry-text="retryLabel"
              :document-label="item?.name || title"
            />
            <CodePreview
              v-else-if="kind === 'code' || kind === 'text'"
              :key="src"
              :src="src"
              :item="item"
              :kind="kind"
              :loading-text="textLoadingText"
              :load-failed-text="textLoadFailedText"
              :retry-text="retryLabel"
              :document-label="item?.name || title"
            />
            <PdfPreview
              v-else-if="kind === 'pdf'"
              :key="src"
              :src="src"
              :loading-text="pdfLoadingText"
              :load-failed-text="pdfLoadFailedText"
              :retry-text="retryLabel"
              :document-label="item?.name || title"
              :toolbar-label="pdfToolbarLabel"
              :zoom-out-label="pdfZoomOutLabel"
              :zoom-in-label="pdfZoomInLabel"
              :fit-width-label="pdfFitWidthLabel"
              :page-count-template="pdfPageCountTemplate"
              :page-label-template="pdfPageLabelTemplate"
            />
          </main>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, ref, watch } from "vue";
import { Download, X } from "@lucide/vue";
import AudioPreview from "./AudioPreview.vue";
import FileIcon from "./FileIcon.vue";
import ImagePreview from "./ImagePreview.vue";
import MarkdownPreview from "./MarkdownPreview.vue";
import VideoPreview from "./VideoPreview.vue";

const CodePreview = defineAsyncComponent(() => import("./CodePreview.vue"));
const PdfPreview = defineAsyncComponent(() => import("./PdfPreview.vue"));

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  item: {
    type: Object,
    default: null
  },
  src: {
    type: String,
    default: ""
  },
  kind: {
    type: String,
    default: ""
  },
  meta: {
    type: String,
    default: ""
  },
  imageIndex: {
    type: Number,
    default: 0
  },
  imageTotal: {
    type: Number,
    default: 0
  },
  title: {
    type: String,
    default: "Preview"
  },
  closeLabel: {
    type: String,
    default: "Close"
  },
  downloadLabel: {
    type: String,
    default: "Download"
  },
  previousLabel: {
    type: String,
    default: "Previous image"
  },
  nextLabel: {
    type: String,
    default: "Next image"
  },
  imageLoadingText: {
    type: String,
    default: "Loading image"
  },
  imageLoadFailedText: {
    type: String,
    default: "Failed to load image"
  },
  videoLoadingText: {
    type: String,
    default: "Loading video"
  },
  videoFallbackText: {
    type: String,
    default: "Your browser does not support video playback."
  },
  audioLoadingText: {
    type: String,
    default: "Loading audio"
  },
  audioFallbackText: {
    type: String,
    default: "Your browser does not support audio playback."
  },
  markdownLoadingText: {
    type: String,
    default: "Loading Markdown"
  },
  markdownLoadFailedText: {
    type: String,
    default: "Failed to load Markdown"
  },
  textLoadingText: {
    type: String,
    default: "Loading file"
  },
  textLoadFailedText: {
    type: String,
    default: "Failed to load file"
  },
  pdfLoadingText: {
    type: String,
    default: "Loading PDF"
  },
  pdfLoadFailedText: {
    type: String,
    default: "Failed to load PDF"
  },
  pdfToolbarLabel: {
    type: String,
    default: "PDF controls"
  },
  pdfZoomOutLabel: {
    type: String,
    default: "Zoom out"
  },
  pdfZoomInLabel: {
    type: String,
    default: "Zoom in"
  },
  pdfFitWidthLabel: {
    type: String,
    default: "Fit to width"
  },
  pdfPageCountTemplate: {
    type: String,
    default: "{current} / {total}"
  },
  pdfPageLabelTemplate: {
    type: String,
    default: "Page {current} of {total}"
  },
  retryLabel: {
    type: String,
    default: "Retry"
  }
});

const emit = defineEmits(["close", "download", "previous-image", "next-image"]);
const overlayRef = ref(null);

const hasPreviousImage = computed(() => props.kind === "image" && props.imageTotal > 1 && props.imageIndex > 0);
const hasNextImage = computed(() => props.kind === "image" && props.imageTotal > 1 && props.imageIndex >= 0 && props.imageIndex < props.imageTotal - 1);

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) return;
    await nextTick();
    overlayRef.value?.focus?.();
  }
);

function handlePrevious() {
  if (!hasPreviousImage.value) return;
  emit("previous-image");
}

function handleNext() {
  if (!hasNextImage.value) return;
  emit("next-image");
}
</script>

<style scoped>
.file-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  width: 100vw;
  height: 100dvh;
  display: grid;
  place-items: stretch;
  background: var(--el-mask-color, rgba(15, 23, 42, 0.36));
  outline: none;
}

.file-preview-window {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  color: var(--text);
  background: var(--page-bg);
}

.file-preview-topbar {
  min-width: 0;
  min-height: 68px;
  padding: max(10px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) 10px max(18px, env(safe-area-inset-left));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  background: var(--card-strong);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
}

.file-preview-title-group {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.file-preview-icon {
  flex: 0 0 auto;
}

.file-preview-title-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.file-preview-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 14px;
  font-weight: 740;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-meta {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  font-weight: 640;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-preview-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 6px;
}

.file-preview-stage {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--page-bg);
}

.file-preview-fade-enter-active,
.file-preview-fade-leave-active {
  transition: opacity 180ms ease;
}

.file-preview-fade-enter-from,
.file-preview-fade-leave-to {
  opacity: 0;
}

@media (max-width: 640px) {
  .file-preview-topbar {
    min-height: 62px;
    padding-right: max(10px, env(safe-area-inset-right));
    padding-left: max(12px, env(safe-area-inset-left));
  }

  .file-preview-actions {
    gap: 4px;
  }

  .file-preview-meta {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .file-preview-fade-enter-active,
  .file-preview-fade-leave-active {
    transition: none;
  }
}
</style>
