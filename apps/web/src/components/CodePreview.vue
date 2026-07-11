<template>
  <div class="code-preview" :class="{ 'is-plain-text': plainText }">
    <div v-if="loading" class="code-preview-status" role="status" :aria-label="loadingText">
      <LoaderCircle class="code-preview-spinner" aria-hidden="true" />
      <span>{{ loadingText }}</span>
    </div>

    <div v-else-if="error" class="code-preview-status is-error" role="alert">
      <FileWarning aria-hidden="true" />
      <span>{{ loadFailedText }}</span>
      <button class="code-preview-retry" type="button" @click="loadSource">
        <RefreshCw aria-hidden="true" />
        <span>{{ retryText }}</span>
      </button>
    </div>

    <el-scrollbar
      v-else
      ref="scrollRef"
      class="code-preview-scroll"
      :tabindex="0"
      role="region"
      :aria-label="documentLabel"
      view-class="code-preview-scroll-view"
    >
      <article class="code-preview-paper">
        <div class="code-preview-content" v-html="html" />
      </article>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { FileWarning, LoaderCircle, RefreshCw } from "@lucide/vue";
import { authenticatedFetch } from "../api/client.js";
import { codeLanguageFor } from "../utils/file-icons.js";

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  item: {
    type: Object,
    default: null
  },
  kind: {
    type: String,
    default: "code"
  },
  loadingText: {
    type: String,
    default: "Loading file"
  },
  loadFailedText: {
    type: String,
    default: "Failed to load file"
  },
  retryText: {
    type: String,
    default: "Retry"
  },
  documentLabel: {
    type: String,
    default: "File preview"
  }
});

const loading = ref(false);
const error = ref(false);
const html = ref("");
const scrollRef = ref(null);
const plainText = computed(() => props.kind === "text" || !codeLanguageFor(props.item));
let controller = null;

watch(
  () => [props.src, props.item?.name, props.item?.mime],
  () => loadSource(),
  { immediate: true }
);

onBeforeUnmount(() => controller?.abort());

async function loadSource() {
  controller?.abort();
  if (!props.src) {
    html.value = "";
    loading.value = false;
    error.value = true;
    return;
  }

  const requestController = new AbortController();
  controller = requestController;
  loading.value = true;
  error.value = false;

  try {
    const [{ codeToHtml }, response] = await Promise.all([
      import("shiki"),
      authenticatedFetch(props.src, {
        signal: requestController.signal
      })
    ]);
    if (!response.ok) throw new Error(`File request failed: ${response.status}`);

    const source = await response.text();
    if (controller !== requestController || requestController.signal.aborted) return;

    const language = plainText.value || source.length > 500_000 ? "text" : codeLanguageFor(props.item);
    html.value = await highlightSource(codeToHtml, source, language || "text");
    if (controller !== requestController || requestController.signal.aborted) return;

    loading.value = false;
    await nextTick();
    scrollRef.value?.setScrollTop?.(0);
    scrollRef.value?.setScrollLeft?.(0);
    scrollRef.value?.update?.();
  } catch (loadError) {
    if (loadError?.name === "AbortError") return;
    html.value = "";
    error.value = true;
  } finally {
    if (controller === requestController && !requestController.signal.aborted) loading.value = false;
  }
}

async function highlightSource(codeToHtml, source, language) {
  try {
    return await codeToHtml(source, { lang: language, theme: "github-light" });
  } catch (highlightError) {
    if (language === "text") throw highlightError;
    return codeToHtml(source, { lang: "text", theme: "github-light" });
  }
}
</script>

<style scoped>
.code-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--page-bg);
}

.code-preview-scroll {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  --el-scrollbar-opacity: 0.24;
  --el-scrollbar-hover-opacity: 0.46;
}

.code-preview-scroll :deep(.el-scrollbar__wrap) {
  overscroll-behavior: contain;
}

.code-preview-scroll :deep(.el-scrollbar__wrap:focus-visible) {
  box-shadow: inset 0 0 0 3px rgba(0, 122, 255, 0.18);
  outline: none;
}

.code-preview-scroll :deep(.code-preview-scroll-view) {
  min-height: 100%;
  padding: clamp(20px, 3vw, 40px);
}

.code-preview-paper {
  width: min(100%, 1100px);
  min-height: calc(100% - 2px);
  margin: 0 auto;
  padding: clamp(20px, 4vw, 44px) clamp(12px, 3vw, 32px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: #24292e;
  background: #ffffff;
  box-shadow: var(--shadow-soft);
}

.code-preview-content {
  min-width: 0;
}

.code-preview-content :deep(.shiki) {
  max-width: 100%;
  margin: 0;
  padding: 4px 0;
  overflow: auto;
  border: 0;
  background: #ffffff !important;
  color: #24292e;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: clamp(12px, 1.3vw, 14px);
  line-height: 1.65;
  tab-size: 2;
  scrollbar-color: #cbd5e1 #f8fafc;
  scrollbar-width: thin;
}

.code-preview-content :deep(.shiki code) {
  display: block;
  min-width: max-content;
  counter-reset: code-line;
}

.code-preview-content :deep(.shiki .line) {
  display: inline-block;
  min-width: 100%;
  padding-right: 20px;
  counter-increment: code-line;
}

.code-preview-content :deep(.shiki .line::before) {
  position: sticky;
  left: 0;
  display: inline-block;
  width: 4ch;
  margin-right: 20px;
  border-right: 1px solid #e5e7eb;
  color: #57606a;
  background: #ffffff;
  content: counter(code-line);
  text-align: right;
  user-select: none;
}

.is-plain-text .code-preview-content :deep(.shiki code) {
  min-width: 0;
}

.is-plain-text .code-preview-content :deep(.shiki .line) {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.code-preview-status {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 650;
  text-align: center;
}

.code-preview-status.is-error > svg {
  width: 34px;
  height: 34px;
  color: var(--danger);
}

.code-preview-spinner {
  width: 30px;
  height: 30px;
  color: var(--accent);
  animation: code-preview-spin 800ms linear infinite;
}

.code-preview-retry {
  min-height: 44px;
  padding: 0 16px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text);
  background: #ffffff;
  cursor: pointer;
}

.code-preview-retry svg {
  width: 16px;
  height: 16px;
}

.code-preview-retry:hover,
.code-preview-retry:focus-visible {
  border-color: rgba(0, 122, 255, 0.35);
  outline: 3px solid rgba(0, 122, 255, 0.14);
}

@keyframes code-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .code-preview-scroll :deep(.code-preview-scroll-view) {
    padding: 12px;
  }

  .code-preview-paper {
    min-height: 100%;
    padding: 18px 8px;
    border-radius: 6px;
  }

  .code-preview-content :deep(.shiki .line) {
    padding-right: 12px;
  }

  .code-preview-content :deep(.shiki .line::before) {
    width: 3.5ch;
    margin-right: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .code-preview-spinner {
    animation: none;
  }
}
</style>
