<template>
  <div class="markdown-preview">
    <div v-if="loading" class="markdown-preview-status" role="status" :aria-label="loadingText">
      <LoaderCircle class="markdown-preview-spinner" aria-hidden="true" />
      <span>{{ loadingText }}</span>
    </div>

    <div v-else-if="error" class="markdown-preview-status is-error" role="alert">
      <FileWarning aria-hidden="true" />
      <span>{{ loadFailedText }}</span>
      <button class="markdown-preview-retry" type="button" @click="loadMarkdown">
        <RefreshCw aria-hidden="true" />
        <span>{{ retryText }}</span>
      </button>
    </div>

    <el-scrollbar
      v-else
      ref="scrollRef"
      class="markdown-preview-scroll"
      :tabindex="0"
      role="region"
      :aria-label="documentLabel"
      view-class="markdown-preview-scroll-view"
    >
      <article ref="paperRef" class="markdown-preview-paper">
        <div class="markdown-body" @click="handleContentClick" @error.capture="handleResourceError" v-html="html" />
      </article>
    </el-scrollbar>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { FileWarning, LoaderCircle, RefreshCw } from "@lucide/vue";
import { authenticatedFetch, checkSession } from "../api/client.js";

const props = defineProps({
  src: {
    type: String,
    required: true
  },
  item: {
    type: Object,
    default: null
  },
  loadingText: {
    type: String,
    default: "Loading Markdown"
  },
  loadFailedText: {
    type: String,
    default: "Failed to load Markdown"
  },
  retryText: {
    type: String,
    default: "Retry"
  },
  documentLabel: {
    type: String,
    default: "Markdown document"
  }
});

const loading = ref(false);
const error = ref(false);
const html = ref("");
const scrollRef = ref(null);
const paperRef = ref(null);
let controller = null;

watch(
  () => props.src,
  () => loadMarkdown(),
  { immediate: true }
);

onBeforeUnmount(() => controller?.abort());

async function loadMarkdown() {
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
    const [{ default: DOMPurify }, { marked }, { default: highlighter }] = await Promise.all([
      import("dompurify"),
      import("marked"),
      import("highlight.js/lib/common")
    ]);
    const response = await authenticatedFetch(props.src, {
      signal: requestController.signal
    });
    if (!response.ok) throw new Error(`Markdown request failed: ${response.status}`);

    const source = await response.text();
    const rendered = marked.parse(source, { gfm: true, breaks: false });
    const sanitized = DOMPurify.sanitize(rendered, {
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "button", "select", "textarea"]
    });

    if (controller !== requestController || requestController.signal.aborted) return;
    html.value = rewriteLocalResources(sanitized, highlighter);
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

function rewriteLocalResources(source, highlighter) {
  const document = new DOMParser().parseFromString(`<div>${source}</div>`, "text/html");
  const root = document.body.firstElementChild;
  if (!root) return source;

  for (const codeBlock of root.querySelectorAll("pre > code")) highlightCodeBlock(codeBlock, highlighter);

  for (const image of root.querySelectorAll("img[src]")) {
    const path = resolveDrivePath(image.getAttribute("src"));
    if (!path) continue;
    image.setAttribute("src", previewUrl(path));
    image.setAttribute("loading", "lazy");
    image.setAttribute("decoding", "async");
  }

  for (const link of root.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href") || "";
    const path = resolveDrivePath(href);
    if (!path) continue;
    link.setAttribute("href", previewUrl(path));
    link.setAttribute("data-drive-link", "true");
  }

  return root.innerHTML;
}

function highlightCodeBlock(codeBlock, highlighter) {
  const code = codeBlock.textContent || "";
  if (!code || code.length > 200_000) return;

  const languageClass = [...codeBlock.classList].find((name) => name.startsWith("language-") || name.startsWith("lang-"));
  const requestedLanguage = languageClass?.replace(/^(language-|lang-)/, "") || "";
  const result = requestedLanguage && highlighter.getLanguage(requestedLanguage)
    ? highlighter.highlight(code, { language: requestedLanguage, ignoreIllegals: true })
    : highlighter.highlightAuto(code);

  codeBlock.innerHTML = result.value;
  codeBlock.classList.add("hljs");
  if (!languageClass && result.language) codeBlock.classList.add(`language-${result.language}`);
}

function resolveDrivePath(value = "") {
  const href = String(value).trim();
  if (!href || href.startsWith("#") || href.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(href)) return "";

  const cleanHref = href.split("#", 1)[0].split("?", 1)[0].replaceAll("\\", "/");
  const base = cleanHref.startsWith("/") ? [] : String(props.item?.path || "/").split("/").filter(Boolean).slice(0, -1);
  for (const rawPart of cleanHref.split("/")) {
    let part = rawPart;
    try {
      part = decodeURIComponent(rawPart);
    } catch {
      // Keep malformed percent sequences as literal filename characters.
    }
    if (!part || part === ".") continue;
    if (part === "..") base.pop();
    else base.push(part);
  }
  return `/${base.join("/")}`;
}

function previewUrl(path) {
  return `/api/files/preview?${new URLSearchParams({ path })}`;
}

function handleContentClick(event) {
  const link = event.target.closest?.("a");
  if (!link || !paperRef.value?.contains(link)) return;

  const href = link.getAttribute("href") || "";
  if (!href) {
    event.preventDefault();
    return;
  }
  if (href.startsWith("#")) {
    event.preventDefault();
    const id = decodeURIComponent(href.slice(1));
    if (!id) return;
    paperRef.value.querySelector(`#${CSS.escape(id)}`)?.scrollIntoView({ block: "start" });
    return;
  }

  event.preventDefault();
  window.open(link.href, "_blank", "noopener,noreferrer");
  if (link.dataset.driveLink === "true") checkSession().catch(() => {});
}

function handleResourceError() {
  checkSession().catch(() => {});
}
</script>

<style scoped>
.markdown-preview {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--page-bg);
}

.markdown-preview-scroll {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  --el-scrollbar-opacity: 0.24;
  --el-scrollbar-hover-opacity: 0.46;
}

.markdown-preview-scroll :deep(.el-scrollbar__wrap) {
  overscroll-behavior: contain;
}

.markdown-preview-scroll :deep(.el-scrollbar__wrap:focus-visible) {
  box-shadow: inset 0 0 0 3px rgba(0, 122, 255, 0.18);
  outline: none;
}

.markdown-preview-scroll :deep(.markdown-preview-scroll-view) {
  min-height: 100%;
  padding: clamp(20px, 3vw, 40px);
}

.markdown-preview-paper {
  width: min(100%, 900px);
  min-height: calc(100% - 2px);
  margin: 0 auto;
  padding: clamp(32px, 6vw, 76px) clamp(24px, 7vw, 84px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: #1f2937;
  background: #ffffff;
  box-shadow: var(--shadow-soft);
}

.markdown-body {
  max-width: 72ch;
  margin: 0 auto;
  font-size: 16px;
  line-height: 1.72;
  overflow-wrap: anywhere;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin: 1.6em 0 0.65em;
  color: #111827;
  font-weight: 720;
  line-height: 1.28;
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h1) {
  padding-bottom: 0.35em;
  border-bottom: 1px solid #e5e7eb;
  font-size: clamp(28px, 4vw, 38px);
  letter-spacing: -0.025em;
}

.markdown-body :deep(h2) {
  padding-bottom: 0.3em;
  border-bottom: 1px solid #e5e7eb;
  font-size: 26px;
  letter-spacing: -0.015em;
}

.markdown-body :deep(h3) {
  font-size: 21px;
}

.markdown-body :deep(h4) {
  font-size: 18px;
}

.markdown-body :deep(p),
.markdown-body :deep(ul),
.markdown-body :deep(ol),
.markdown-body :deep(blockquote),
.markdown-body :deep(pre),
.markdown-body :deep(table) {
  margin: 0 0 1.1em;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  padding-left: 1.6em;
}

.markdown-body :deep(li + li) {
  margin-top: 0.3em;
}

.markdown-body :deep(a) {
  color: #0067d9;
  text-decoration: underline;
  text-decoration-color: rgba(0, 103, 217, 0.35);
  text-underline-offset: 0.18em;
}

.markdown-body :deep(a:hover) {
  text-decoration-color: currentColor;
}

.markdown-body :deep(a:focus-visible) {
  border-radius: 3px;
  outline: 2px solid rgba(0, 103, 217, 0.35);
  outline-offset: 2px;
}

.markdown-body :deep(strong) {
  color: #111827;
  font-weight: 700;
}

.markdown-body :deep(blockquote) {
  padding: 0.2em 1em;
  border-left: 4px solid #cbd5e1;
  color: #526072;
  background: #f8fafc;
}

.markdown-body :deep(blockquote > :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code) {
  padding: 0.18em 0.38em;
  border-radius: 4px;
  color: #b42318;
  background: #f1f5f9;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 0.88em;
}

.markdown-body :deep(pre) {
  max-width: 100%;
  padding: 6px;
  overflow: hidden;
  border: 1px solid #2e3a4b;
  border-radius: 8px;
  color: #e2e8f0;
  background: #18212f;
  line-height: 1.55;
  tab-size: 2;
}

.markdown-body :deep(pre code) {
  box-sizing: border-box;
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  padding: 11px 12px 9px;
  overflow: auto;
  border-radius: 6px;
  color: inherit;
  background: transparent;
  font-size: 13px;
  scrollbar-color: #64748b #253244;
  scrollbar-width: thin;
}

.markdown-body :deep(pre code::-webkit-scrollbar) {
  width: 9px;
  height: 9px;
}

.markdown-body :deep(pre code::-webkit-scrollbar-track) {
  border-radius: 999px;
  background: #253244;
}

.markdown-body :deep(pre code::-webkit-scrollbar-thumb) {
  border: 2px solid #253244;
  border-radius: 999px;
  background: #64748b;
}

.markdown-body :deep(pre code::-webkit-scrollbar-thumb:hover) {
  background: #94a3b8;
}

.markdown-body :deep(pre code::-webkit-scrollbar-corner) {
  border-radius: 999px;
  background: #253244;
}

.markdown-body :deep(.hljs-comment),
.markdown-body :deep(.hljs-quote) {
  color: #8b98aa;
  font-style: italic;
}

.markdown-body :deep(.hljs-keyword),
.markdown-body :deep(.hljs-selector-tag),
.markdown-body :deep(.hljs-literal),
.markdown-body :deep(.hljs-section),
.markdown-body :deep(.hljs-link) {
  color: #c792ea;
}

.markdown-body :deep(.hljs-string),
.markdown-body :deep(.hljs-attr),
.markdown-body :deep(.hljs-template-tag),
.markdown-body :deep(.hljs-template-variable),
.markdown-body :deep(.hljs-addition) {
  color: #a7d787;
}

.markdown-body :deep(.hljs-number),
.markdown-body :deep(.hljs-symbol),
.markdown-body :deep(.hljs-bullet),
.markdown-body :deep(.hljs-variable),
.markdown-body :deep(.hljs-variable.constant_) {
  color: #f2b86b;
}

.markdown-body :deep(.hljs-title),
.markdown-body :deep(.hljs-title.function_),
.markdown-body :deep(.hljs-selector-id),
.markdown-body :deep(.hljs-selector-class) {
  color: #72b7f2;
}

.markdown-body :deep(.hljs-type),
.markdown-body :deep(.hljs-built_in),
.markdown-body :deep(.hljs-title.class_) {
  color: #f1d27a;
}

.markdown-body :deep(.hljs-meta),
.markdown-body :deep(.hljs-doctag),
.markdown-body :deep(.hljs-regexp) {
  color: #70d4c4;
}

.markdown-body :deep(.hljs-property),
.markdown-body :deep(.hljs-params),
.markdown-body :deep(.hljs-subst) {
  color: #e2e8f0;
}

.markdown-body :deep(.hljs-deletion) {
  color: #ff8f88;
}

.markdown-body :deep(.hljs-emphasis) {
  font-style: italic;
}

.markdown-body :deep(.hljs-strong) {
  font-weight: 700;
}

.markdown-body :deep(hr) {
  height: 1px;
  margin: 2em 0;
  border: 0;
  background: #e5e7eb;
}

.markdown-body :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 1.5em auto;
  border-radius: 8px;
}

.markdown-body :deep(table) {
  display: block;
  width: max-content;
  max-width: 100%;
  overflow-x: auto;
  border-spacing: 0;
  border-collapse: collapse;
  font-size: 14px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 9px 12px;
  border: 1px solid #dbe2ea;
  text-align: left;
  vertical-align: top;
}

.markdown-body :deep(th) {
  color: #111827;
  background: #f8fafc;
  font-weight: 680;
}

.markdown-body :deep(tr:nth-child(even) td) {
  background: #fbfdff;
}

.markdown-body :deep(input[type="checkbox"]) {
  width: 16px;
  height: 16px;
  margin: 0 0.45em 0.15em 0;
  vertical-align: text-top;
  accent-color: var(--accent);
}

.markdown-body :deep(.task-list-item) {
  list-style: none;
}

.markdown-preview-status {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  color: var(--muted);
  font-size: 14px;
  font-weight: 650;
}

.markdown-preview-status.is-error svg {
  width: 30px;
  height: 30px;
  color: var(--subtle);
}

.markdown-preview-spinner {
  width: 28px;
  height: 28px;
  color: var(--accent);
  animation: markdown-preview-spin 800ms linear infinite;
}

.markdown-preview-retry {
  min-height: 44px;
  margin-top: 4px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #475569;
  background: #ffffff;
  font: inherit;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}

.markdown-preview-retry svg {
  width: 16px;
  height: 16px;
}

.markdown-preview-retry:hover,
.markdown-preview-retry:focus-visible {
  border-color: rgba(0, 122, 255, 0.28);
  color: var(--accent);
  outline: 2px solid rgba(0, 122, 255, 0.14);
  outline-offset: 2px;
}

@keyframes markdown-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .markdown-preview-scroll :deep(.markdown-preview-scroll-view) {
    padding: 10px;
  }

  .markdown-preview-paper {
    min-height: 100%;
    padding: 30px 22px 48px;
  }

  .markdown-body {
    font-size: 16px;
    line-height: 1.68;
  }

  .markdown-body :deep(h2) {
    font-size: 23px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .markdown-preview-retry {
    transition: none;
  }

  .markdown-preview-spinner {
    animation-duration: 1600ms;
  }
}
</style>
