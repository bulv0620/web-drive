<template>
  <div class="pdf-preview">
    <div v-if="loading" class="pdf-preview-status" role="status" :aria-label="loadingText">
      <LoaderCircle class="pdf-preview-spinner" aria-hidden="true" />
      <span>{{ loadingText }}</span>
    </div>

    <div v-else-if="error" class="pdf-preview-status is-error" role="alert">
      <FileWarning aria-hidden="true" />
      <span>{{ loadFailedText }}</span>
      <span v-if="errorDetail" class="pdf-preview-error-detail">{{ errorDetail }}</span>
      <button class="pdf-preview-retry" type="button" @click="loadPdf">
        <RefreshCw aria-hidden="true" />
        <span>{{ retryText }}</span>
      </button>
    </div>

    <template v-else>
      <el-scrollbar
        ref="scrollRef"
        class="pdf-preview-scroll"
        tabindex="0"
        role="region"
        :aria-label="documentLabel"
        view-class="pdf-preview-scroll-view"
        @scroll="handleScroll"
        @keydown="handleKeydown"
      >
        <div class="pdf-preview-pages">
          <section
            v-for="page in pages"
            :key="page.number"
            :ref="(element) => setPageShell(page.number, element)"
            class="pdf-preview-page-shell"
            :class="{ 'is-rendered': page.rendered }"
            :style="pageStyle(page)"
            :aria-label="formatPageLabel(page.number, pageCount)"
          >
            <canvas :ref="(element) => setPageCanvas(page.number, element)" class="pdf-preview-page" aria-hidden="true" />
          </section>
        </div>
      </el-scrollbar>

      <div class="pdf-preview-toolbar" role="toolbar" :aria-label="toolbarLabel">
        <output class="pdf-preview-page-count" aria-live="polite">
          {{ formatPageCount(currentPage, pageCount) }}
        </output>
        <div class="pdf-preview-zoom-controls">
          <el-button
            class="common-button pdf-preview-tool-button"
            circle
            :icon="Minus"
            :disabled="zoom <= minZoom"
            :aria-label="zoomOutLabel"
            :title="zoomOutLabel"
            @click="changeZoom(-zoomStep)"
          />
          <el-button
            class="common-button pdf-preview-scale-button"
            circle
            :aria-label="fitWidthLabel"
            :title="fitWidthLabel"
            @click="resetZoom"
          >
            {{ Math.round(zoom * 100) }}%
          </el-button>
          <el-button
            class="common-button pdf-preview-tool-button"
            circle
            :icon="Plus"
            :disabled="zoom >= maxZoom"
            :aria-label="zoomInLabel"
            :title="zoomInLabel"
            @click="changeZoom(zoomStep)"
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import { FileWarning, LoaderCircle, Minus, Plus, RefreshCw } from "@lucide/vue";

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  loadingText: {
    type: String,
    default: "Loading PDF"
  },
  loadFailedText: {
    type: String,
    default: "Failed to load PDF"
  },
  retryText: {
    type: String,
    default: "Retry"
  },
  documentLabel: {
    type: String,
    default: "PDF document"
  },
  toolbarLabel: {
    type: String,
    default: "PDF controls"
  },
  zoomOutLabel: {
    type: String,
    default: "Zoom out"
  },
  zoomInLabel: {
    type: String,
    default: "Zoom in"
  },
  fitWidthLabel: {
    type: String,
    default: "Fit to width"
  },
  pageCountTemplate: {
    type: String,
    default: "{current} / {total}"
  },
  pageLabelTemplate: {
    type: String,
    default: "Page {current} of {total}"
  }
});

const minZoom = 0.5;
const maxZoom = 2;
const zoomStep = 0.25;
const loading = ref(false);
const error = ref(false);
const errorDetail = ref("");
const pages = ref([]);
const zoom = ref(1);
const fitScale = ref(1);
const currentPage = ref(1);
const scrollRef = ref(null);
const pdfDocument = shallowRef(null);
const pageCount = ref(0);
const pageCanvases = new Map();
const pageShells = new Map();
const pageCache = new Map();
const renderTasks = new Map();
const visiblePages = new Set();
let loadingTask = null;
let requestController = null;
let intersectionObserver = null;
let resizeObserver = null;
let documentGeneration = 0;
let renderRevision = 0;
let scrollFrame = 0;

watch(
  () => props.src,
  () => loadPdf(),
  { immediate: true }
);

onBeforeUnmount(() => disposeDocument());

async function loadPdf() {
  const generation = ++documentGeneration;
  await disposeDocument(false);
  pages.value = [];
  pageCount.value = 0;
  currentPage.value = 1;
  zoom.value = 1;
  error.value = false;
  errorDetail.value = "";

  if (!props.src) {
    loading.value = false;
    error.value = true;
    errorDetail.value = "PDF preview URL is empty.";
    return;
  }

  loading.value = true;
  const fetchController = new AbortController();
  requestController = fetchController;
  try {
    const [{ getDocument }, workerModule, response] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs"),
      fetch(props.src, {
        credentials: "same-origin",
        signal: fetchController.signal
      })
    ]);
    if (!response.ok) throw new Error(`PDF request failed: ${response.status}`);
    const pdfData = new Uint8Array(await response.arrayBuffer());
    if (!pdfData.byteLength) throw new Error("PDF file is empty");
    if (generation !== documentGeneration || fetchController.signal.aborted) return;

    globalThis.pdfjsWorker ||= workerModule;
    const assetBase = `${import.meta.env.BASE_URL}pdfjs/`;
    const task = getDocument({
      data: pdfData,
      cMapUrl: `${assetBase}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${assetBase}standard_fonts/`,
      wasmUrl: `${assetBase}wasm/`,
      iccUrl: `${assetBase}iccs/`,
      useSystemFonts: true
    });
    loadingTask = task;
    const document = await task.promise;
    if (generation !== documentGeneration) {
      await document.destroy();
      return;
    }

    pdfDocument.value = document;
    pageCount.value = document.numPages;
    if (!document.numPages) throw new Error("PDF has no pages");

    const firstPage = await document.getPage(1);
    const firstViewport = firstPage.getViewport({ scale: 1 });
    pageCache.set(1, firstPage);
    pages.value = Array.from({ length: document.numPages }, (_, index) => ({
      number: index + 1,
      width: firstViewport.width,
      height: firstViewport.height,
      rendered: false
    }));
    loading.value = false;

    await nextTick();
    setupViewportObservers();
    updateFitScale();
    scrollRef.value?.setScrollTop?.(0);
    scrollRef.value?.setScrollLeft?.(0);
    scrollRef.value?.update?.();
    renderPage(1);
  } catch (loadError) {
    if (generation !== documentGeneration || loadError?.name === "AbortError" || loadError?.name === "AbortException") return;
    error.value = true;
    errorDetail.value = describePdfError(loadError, "load");
    pages.value = [];
    pageCount.value = 0;
  } finally {
    if (requestController === fetchController) requestController = null;
    if (generation === documentGeneration) loading.value = false;
  }
}

async function disposeDocument(invalidate = true) {
  if (invalidate) documentGeneration += 1;
  renderRevision += 1;
  cancelRenderTasks();
  intersectionObserver?.disconnect();
  resizeObserver?.disconnect();
  intersectionObserver = null;
  resizeObserver = null;
  visiblePages.clear();
  pageCanvases.clear();
  pageShells.clear();
  pageCache.clear();
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  requestController?.abort();
  requestController = null;

  const task = loadingTask;
  const document = pdfDocument.value;
  loadingTask = null;
  pdfDocument.value = null;
  if (task) {
    try {
      await task.destroy();
    } catch {
      // The loading task may already be settled or canceled.
    }
  } else if (document) {
    try {
      await document.destroy();
    } catch {
      // Ignore cleanup errors when closing the preview.
    }
  }
}

function setupViewportObservers() {
  const root = scrollElement();
  if (!root) return;

  intersectionObserver?.disconnect();
  intersectionObserver = new IntersectionObserver(handleIntersections, {
    root,
    rootMargin: "800px 600px",
    threshold: 0.01
  });
  for (const shell of pageShells.values()) intersectionObserver.observe(shell);

  resizeObserver?.disconnect();
  resizeObserver = new ResizeObserver(() => updateFitScale());
  resizeObserver.observe(root);
}

function handleIntersections(entries) {
  for (const entry of entries) {
    const number = Number(entry.target.dataset.pageNumber);
    if (!number) continue;
    if (entry.isIntersecting) {
      visiblePages.add(number);
      renderPage(number);
    } else {
      visiblePages.delete(number);
      if (Math.abs(number - currentPage.value) > 2) releasePage(number);
    }
  }
}

function setPageShell(number, element) {
  const previous = pageShells.get(number);
  if (previous && previous !== element) intersectionObserver?.unobserve(previous);
  if (!element) {
    pageShells.delete(number);
    return;
  }
  element.dataset.pageNumber = String(number);
  pageShells.set(number, element);
  intersectionObserver?.observe(element);
}

function setPageCanvas(number, element) {
  if (element) pageCanvases.set(number, element);
  else pageCanvases.delete(number);
}

async function renderPage(number) {
  const document = pdfDocument.value;
  const canvas = pageCanvases.get(number);
  if (!document || !canvas || renderTasks.has(number)) return;
  const model = pages.value[number - 1];
  if (!model || model.rendered) return;

  const revision = renderRevision;
  let renderTask = null;
  try {
    const page = pageCache.get(number) || (await document.getPage(number));
    if (revision !== renderRevision || document !== pdfDocument.value) return;
    pageCache.set(number, page);

    const unitViewport = page.getViewport({ scale: 1 });
    if (Math.abs(model.width - unitViewport.width) > 0.5 || Math.abs(model.height - unitViewport.height) > 0.5) {
      updatePageModel(number, { width: unitViewport.width, height: unitViewport.height });
      await nextTick();
    }

    const viewport = page.getViewport({ scale: fitScale.value * zoom.value });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
    canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;

    renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0]
    });
    renderTasks.set(number, renderTask);
    await renderTask.promise;
    if (revision === renderRevision) updatePageModel(number, { rendered: true });
  } catch (renderError) {
    if (renderError?.name !== "RenderingCancelledException") {
      releasePage(number, false);
      error.value = true;
      errorDetail.value = describePdfError(renderError, "render");
    }
  } finally {
    if (renderTasks.get(number) === renderTask) renderTasks.delete(number);
  }
}

function releasePage(number, cancel = true) {
  if (cancel) renderTasks.get(number)?.cancel?.();
  renderTasks.delete(number);
  const canvas = pageCanvases.get(number);
  if (canvas) {
    canvas.width = 1;
    canvas.height = 1;
  }
  if (pages.value[number - 1]?.rendered) updatePageModel(number, { rendered: false });
}

function cancelRenderTasks() {
  for (const task of renderTasks.values()) task.cancel?.();
  renderTasks.clear();
}

function updatePageModel(number, patch) {
  const index = number - 1;
  const current = pages.value[index];
  if (!current) return;
  const nextPages = pages.value.slice();
  nextPages[index] = { ...current, ...patch };
  pages.value = nextPages;
}

function updateFitScale() {
  const root = scrollElement();
  const firstPage = pages.value[0];
  if (!root || !firstPage?.width) return;
  const gutter = root.clientWidth <= 640 ? 24 : 64;
  const availableWidth = Math.max(240, Math.min(920, root.clientWidth - gutter));
  const nextScale = availableWidth / firstPage.width;
  if (Math.abs(nextScale - fitScale.value) < 0.01) return;
  fitScale.value = nextScale;
  invalidateRenderedPages();
}

function changeZoom(delta) {
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, Number((zoom.value + delta).toFixed(2))));
  if (nextZoom === zoom.value) return;
  zoom.value = nextZoom;
  invalidateRenderedPages();
}

function resetZoom() {
  if (zoom.value === 1) return;
  zoom.value = 1;
  invalidateRenderedPages();
}

async function invalidateRenderedPages() {
  renderRevision += 1;
  cancelRenderTasks();
  pages.value = pages.value.map((page) => ({ ...page, rendered: false }));
  await nextTick();
  const targets = visiblePages.size ? [...visiblePages] : [currentPage.value];
  for (const number of targets) renderPage(number);
}

function pageStyle(page) {
  const scale = fitScale.value * zoom.value;
  return {
    width: `${page.width * scale}px`,
    height: `${page.height * scale}px`
  };
}

function handleScroll() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    const root = scrollElement();
    if (!root) return;
    const rootTop = root.getBoundingClientRect().top;
    let closestNumber = currentPage.value;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const [number, shell] of pageShells) {
      const rect = shell.getBoundingClientRect();
      if (rect.bottom < rootTop || rect.top > rootTop + root.clientHeight) continue;
      const distance = Math.abs(rect.top - rootTop - 24);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestNumber = number;
      }
    }
    currentPage.value = closestNumber;
  });
}

function scrollElement() {
  const exposedWrap = scrollRef.value?.wrapRef;
  return exposedWrap?.value || exposedWrap || scrollRef.value?.$el?.querySelector?.(".el-scrollbar__wrap") || null;
}

function handleKeydown(event) {
  if (!(event.ctrlKey || event.metaKey)) return;
  if (event.key === "+" || event.key === "=") {
    event.preventDefault();
    changeZoom(zoomStep);
  } else if (event.key === "-") {
    event.preventDefault();
    changeZoom(-zoomStep);
  } else if (event.key === "0") {
    event.preventDefault();
    resetZoom();
  }
}

function formatTemplate(template, values) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

function describePdfError(pdfError, stage) {
  const name = String(pdfError?.name || "");
  const message = String(pdfError?.message || pdfError || "Unknown PDF error");
  if (name === "PasswordException") return "This PDF is password-protected and cannot be previewed without a password.";
  if (name === "InvalidPDFException") return "The file is not a valid PDF or the PDF data is damaged.";
  if (name === "MissingPDFException") return "The PDF file could not be found.";
  return `${stage === "render" ? "PDF render" : "PDF load"} error: ${message}`;
}

function formatPageCount(current, total) {
  return formatTemplate(props.pageCountTemplate, { current, total });
}

function formatPageLabel(current, total) {
  return formatTemplate(props.pageLabelTemplate, { current, total });
}
</script>

<style scoped>
.pdf-preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden;
  background: #e9edf3;
}

.pdf-preview-toolbar {
  position: relative;
  z-index: 2;
  min-height: 56px;
  padding: 6px max(16px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  border-top: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 -5px 18px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}

.pdf-preview-page-count {
  min-width: 72px;
  color: #475569;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-align: center;
}

.pdf-preview-zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pdf-preview-scale-button {
  color: #475569;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 720;
}

.pdf-preview-retry:hover,
.pdf-preview-retry:focus-visible {
  border-color: rgba(0, 122, 255, 0.26);
  color: var(--accent);
  background: rgba(0, 122, 255, 0.06);
  outline: 2px solid rgba(0, 122, 255, 0.16);
  outline-offset: 1px;
}

.pdf-preview-retry:active {
  transform: scale(0.97);
}

.pdf-preview-scroll {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  --el-scrollbar-opacity: 0.28;
  --el-scrollbar-hover-opacity: 0.5;
}

.pdf-preview-scroll :deep(.el-scrollbar__wrap) {
  overscroll-behavior: contain;
}

.pdf-preview-scroll :deep(.el-scrollbar__wrap:focus-visible) {
  box-shadow: inset 0 0 0 3px rgba(0, 122, 255, 0.18);
  outline: none;
}

.pdf-preview-scroll :deep(.pdf-preview-scroll-view) {
  width: max-content;
  min-width: 100%;
  min-height: 100%;
}

.pdf-preview-pages {
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  padding: 32px;
  box-sizing: border-box;
  display: grid;
  justify-items: center;
  align-content: start;
  gap: 24px;
}

.pdf-preview-page-shell {
  position: relative;
  max-width: none;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14), 0 1px 3px rgba(15, 23, 42, 0.16);
  transition: width 180ms ease, height 180ms ease;
}

.pdf-preview-page-shell:not(.is-rendered)::after {
  position: absolute;
  inset: 0;
  content: "";
  background: linear-gradient(110deg, #ffffff 30%, #f4f6f8 46%, #ffffff 62%);
  background-size: 240% 100%;
  animation: pdf-preview-shimmer 1.35s ease-in-out infinite;
}

.pdf-preview-page {
  width: 100%;
  height: 100%;
  display: block;
  background: #ffffff;
}

.pdf-preview-status {
  grid-row: 1 / -1;
  min-height: 100%;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 650;
  text-align: center;
  background: var(--page-bg);
}

.pdf-preview-status.is-error > svg {
  width: 30px;
  height: 30px;
  color: #dc2626;
}

.pdf-preview-error-detail {
  max-width: min(620px, 100%);
  color: #64748b;
  font-size: 12px;
  font-weight: 560;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.pdf-preview-spinner {
  width: 30px;
  height: 30px;
  color: var(--accent);
  animation: pdf-preview-spin 800ms linear infinite;
}

.pdf-preview-retry {
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  color: var(--accent);
  background: #ffffff;
  font: inherit;
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.pdf-preview-retry svg {
  width: 17px;
  height: 17px;
}

@keyframes pdf-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pdf-preview-shimmer {
  to {
    background-position: -240% 0;
  }
}

@media (max-width: 640px) {
  .pdf-preview-toolbar {
    min-height: 54px;
    justify-content: space-between;
    gap: 8px;
    padding-top: 5px;
    padding-bottom: max(5px, env(safe-area-inset-bottom));
  }

  .pdf-preview-pages {
    padding: 12px;
    gap: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pdf-preview-retry,
  .pdf-preview-page-shell {
    transition: none;
  }

  .pdf-preview-spinner,
  .pdf-preview-page-shell:not(.is-rendered)::after {
    animation: none;
  }
}
</style>
