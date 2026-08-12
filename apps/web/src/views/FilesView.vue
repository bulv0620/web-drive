<template>
  <AppShell :title="t('app.title')" :subtitle="currentPath">
    <section class="panel file-panel" :class="{ 'has-selection': selectedRows.length }">
      <div class="breadcrumb-row">
        <el-button class="common-button" :icon="ArrowLeft" :disabled="currentPath === '/'" circle @click="goUp" :aria-label="t('files.back')" />
        <nav class="path-navigator" :title="currentPath" :aria-label="currentPath">
          <div class="path-trail">
            <button class="path-crumb path-root" type="button" @click="openPath('/')">{{ t("files.allFiles") }}</button>
            <template v-if="breadcrumbParts.length">
              <span class="path-separator" aria-hidden="true">/</span>
              <el-dropdown v-if="collapsedBreadcrumbParts.length" trigger="click" :show-arrow="false" popper-class="drive-dropdown-popper path-dropdown-popper">
                <button class="path-crumb path-more-trigger" type="button" :aria-label="t('files.moreActions')">
                  <el-icon><MoreHorizontal /></el-icon>
                </button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-for="part in collapsedBreadcrumbParts" :key="part.path" @click="openPath(part.path)">
                      {{ part.name }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
              <span v-if="collapsedBreadcrumbParts.length && visibleBreadcrumbParts.length" class="path-separator" aria-hidden="true">/</span>
              <template v-for="(part, index) in visibleBreadcrumbParts" :key="part.path">
                <button class="path-crumb" :class="{ current: part.path === currentPath }" type="button" @click="openPath(part.path)">
                  {{ part.name }}
                </button>
                <span v-if="index < visibleBreadcrumbParts.length - 1" class="path-separator" aria-hidden="true">/</span>
              </template>
            </template>
          </div>
          <div class="path-mobile-summary">
            <button class="path-current" type="button" @click="openPath(currentPath)">{{ currentFolderLabel }}</button>
            <div v-if="parentPathLabel" class="path-parent">{{ parentPathLabel }}</div>
          </div>
        </nav>
        <div class="breadcrumb-actions">
          <el-button class="desktop-file-action" :icon="FolderPlus" @click="promptCreateFolder">{{ t("files.newFolder") }}</el-button>
          <el-button class="desktop-file-action" type="primary" :icon="Upload" @click="fileInput?.click()">{{ t("files.upload") }}</el-button>
          <el-dropdown class="desktop-file-action" trigger="click" :show-arrow="false" popper-class="drive-dropdown-popper">
            <el-button class="common-button" :icon="MoreHorizontal" circle :aria-label="t('files.moreActions')" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="FolderUp" @click="folderInput?.click()">{{ t("files.uploadFolder") }}</el-dropdown-item>
                <el-dropdown-item :icon="RefreshCw" @click="loadFiles">{{ t("files.refresh") }}</el-dropdown-item>
                <el-dropdown-item :icon="viewMode === 'list' ? LayoutGrid : LayoutList" @click="toggleView">{{ viewMode === "list" ? t("files.gridView") : t("files.listView") }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button class="language-toggle desktop-file-action" text :icon="languageIcon" :aria-label="localeToggleLabel" :title="localeToggleLabel" @click="toggleLocale" />
          <el-dropdown trigger="click" class="breadcrumb-user-menu" :show-arrow="false" popper-class="drive-dropdown-popper">
            <button class="account-trigger" type="button" :aria-label="t('files.accountMenu', { name: accountName })">
              <span class="account-name">{{ accountName }}</span>
              <span class="avatar" aria-hidden="true">{{ initial }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="LogOut" :disabled="loggingOut" @click="logout">{{ t("files.logout") }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="simple-toolbar">
        <el-input v-model="query" clearable :placeholder="t('files.search')" class="search-input" :prefix-icon="Search" @keyup.enter="loadFiles" @clear="loadFiles" />
      </div>

      <input ref="fileInput" type="file" multiple hidden @change="handleFileInput" />
      <input ref="folderInput" type="file" multiple hidden webkitdirectory directory @change="handleFileInput" />

      <Transition name="selection-bar-slide">
        <div v-if="selectedRows.length" class="selection-bar">
          <span class="selection-count">{{ t("files.selectionCount", { count: selectedRows.length }) }}</span>
          <div class="selection-actions">
            <el-button text type="primary" @click="downloadSelected">{{ t("files.download") }}</el-button>
            <el-button text type="danger" @click="deleteSelected">{{ t("files.delete") }}</el-button>
          </div>
        </div>
      </Transition>

      <div
        class="file-browser-area"
        :class="{ dragging }"
        @dragenter.prevent="handleDragEnter"
        @dragover.prevent="handleDragOver"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleDrop"
      >
        <template v-if="!isMobile">
          <el-auto-resizer v-if="viewMode === 'list'" v-loading="loading" class="file-table-resizer">
            <template #default="{ height, width }">
              <el-table-v2
                v-if="items.length"
                ref="tableRef"
                class="file-table file-table-v2"
                :cache="8"
                :columns="tableColumns"
                :data="items"
                :height="height"
                :row-event-handlers="tableRowEventHandlers"
                :row-height="54"
                row-key="path"
                :sort-by="tableSortBy"
                :width="width"
                @column-sort="handleTableSort"
              />
              <div v-else class="empty-state file-table-empty" :style="{ height: `${height}px` }">
                <FolderOpen class="empty-state-icon" aria-hidden="true" />
                <div class="empty-state-title">{{ t("files.empty") }}</div>
              </div>
            </template>
          </el-auto-resizer>

          <el-scrollbar v-else v-loading="loading" class="file-grid-scrollbar">
            <div class="file-grid" :class="{ empty: !items.length }">
              <div v-if="!loading && items.length === 0" class="empty-state">
                <FolderOpen class="empty-state-icon" aria-hidden="true" />
                <div class="empty-state-title">{{ t("files.empty") }}</div>
              </div>
              <div v-for="item in items" :key="item.path" class="file-card" :class="{ selected: selectedMap.has(item.path) }" @dblclick="openItem(item)" @click="toggleGridSelection(item)">
                <div class="file-card-head">
                  <FileIcon :item="item" />
                  <el-checkbox :model-value="selectedMap.has(item.path)" @click.stop @change="toggleGridSelection(item)" />
                </div>
                <div class="file-card-name">{{ item.name }}</div>
                <div class="file-card-meta">{{ item.sizeLabel }}</div>
                <div class="file-card-meta">{{ item.modifiedAtLabel }}</div>
              </div>
            </div>
          </el-scrollbar>
        </template>

        <el-scrollbar v-else v-loading="loading" class="mobile-file-scrollbar">
          <div class="mobile-file-list" :class="{ empty: !items.length }">
            <div v-if="!loading && items.length === 0" class="empty-state">
              <FolderOpen class="empty-state-icon" aria-hidden="true" />
              <div class="empty-state-title">{{ t("files.empty") }}</div>
            </div>
            <div
              v-for="item in items"
              :key="item.path"
              class="mobile-file-item"
              :class="{ selected: selectedMap.has(item.path) }"
              role="button"
              tabindex="0"
              @click="openItem(item)"
              @keydown.enter.prevent="openItem(item)"
              @keydown.space.prevent="toggleGridSelection(item)"
              @contextmenu.prevent="openRowContextMenu(item, null, $event)"
            >
              <el-checkbox
                class="mobile-file-check"
                :model-value="selectedMap.has(item.path)"
                :aria-label="t('files.selectionCount', { count: selectedRows.length })"
                @click.stop
                @change="toggleGridSelection(item)"
              />
              <FileIcon :item="item" class="mobile-file-icon" />
              <div class="mobile-file-main">
                <div class="mobile-file-name">{{ item.name }}</div>
                <div class="mobile-file-meta">
                  <span>{{ item.sizeLabel }}</span>
                  <span>{{ item.modifiedAtLabel }}</span>
                </div>
              </div>
              <button class="mobile-row-action" type="button" :aria-label="t('files.rowActions', { name: item.name })" @click.stop="openMobileRowActions(item, $event)">
                <el-icon><MoreHorizontal /></el-icon>
              </button>
            </div>
          </div>
        </el-scrollbar>

        <Transition name="file-drop-overlay-fade">
          <div v-if="dragging" class="file-drop-overlay" aria-hidden="true">
            <div class="file-drop-message">
              <el-icon><Upload /></el-icon>
              <span>{{ t("files.dropToUpload") }}</span>
            </div>
          </div>
        </Transition>
      </div>

      <Transition name="upload-widget-fade">
        <div v-if="tasks.length" class="upload-widget">
          <button
            class="upload-orb"
            type="button"
            :aria-expanded="uploadPanelOpen"
            :aria-label="t('files.uploadTasks')"
            :style="{ '--upload-progress': `${overallUploadProgress * 3.6}deg` }"
            @click="uploadPanelOpen = true"
          >
            <el-icon><Upload /></el-icon>
            <span v-if="uploadOrbBadge" class="upload-orb-badge">{{ uploadOrbBadge }}</span>
          </button>
        </div>
      </Transition>

      <el-dialog
        v-model="uploadPanelOpen"
        append-to-body
        class="upload-dialog"
        :width="isMobile ? 'calc(100vw - 24px)' : '720px'"
        :show-close="false"
        align-center
      >
        <template #header>
          <div class="upload-dialog-head">
            <div class="upload-dialog-heading">
              <div class="upload-dialog-title">{{ t("files.uploadTasks") }}</div>
              <div class="upload-dialog-subtitle">{{ uploadSummary }}</div>
            </div>
            <button class="upload-dialog-close" type="button" :aria-label="t('common.close')" @click="uploadPanelOpen = false">
              <el-icon><X /></el-icon>
            </button>
          </div>
        </template>

        <div class="upload-dialog-body">
          <div class="upload-dialog-actions">
            <el-button v-if="hasPausableTasks" :icon="Pause" @click="pauseAllUploads">{{ t("upload.pauseAll") }}</el-button>
            <el-button v-if="hasPausedTasks" :icon="Play" @click="resumeAllUploads">{{ t("upload.resumeAll") }}</el-button>
            <el-button v-if="hasFailedTasks" :icon="RefreshCw" @click="retryFailedUploads">{{ t("upload.retryFailed") }}</el-button>
            <el-button v-if="hasFinishedTasks" text @click="clearFinishedTasks">{{ t("files.clearFinished") }}</el-button>
          </div>

          <el-scrollbar class="upload-task-scrollbar" max-height="min(52dvh, 430px)">
            <div v-if="tasks.length" class="upload-task-list">
              <article v-for="task in tasks" :key="task.id" class="upload-task" :class="`is-${task.status}`">
                <FileIcon :item="task" class="upload-task-icon" aria-hidden="true" />
                <div class="upload-task-content">
                  <div class="upload-task-row">
                    <span class="upload-task-name" :title="task.name">{{ task.name }}</span>
                    <span class="upload-task-status">{{ uploadTaskProgressText(task) }}</span>
                  </div>

                  <el-progress
                    :percentage="Math.round(task.progress)"
                    :status="uploadProgressStatus(task)"
                    :stroke-width="5"
                    :show-text="false"
                  />

                  <div class="upload-task-meta">
                    <span>{{ formatSize(task.loadedBytes) }} / {{ formatSize(task.size) }}</span>
                    <span>{{ uploadEtaText(task) }}</span>
                  </div>

                  <div v-if="task.errorMessage" class="upload-task-error">{{ task.errorMessage }}</div>
                </div>

                <div class="upload-task-actions">
                  <el-button v-if="canPauseTask(task)" circle text :icon="Pause" :aria-label="t('upload.pause')" :title="t('upload.pause')" @click="pauseUploadTask(task)" />
                  <el-button v-if="canResumeTask(task)" circle text :icon="Play" :aria-label="t('upload.resume')" :title="t('upload.resume')" @click="resumeUploadTask(task)" />
                  <el-button v-if="canRetryTask(task)" circle text :icon="RotateCcw" :aria-label="t('upload.retry')" :title="t('upload.retry')" @click="retryUploadTask(task)" />
                  <el-button v-if="canCancelTask(task)" circle text type="danger" :icon="X" :aria-label="t('upload.cancel')" :title="t('upload.cancel')" @click="cancelUploadTask(task)" />
                </div>
              </article>
            </div>
            <div v-else class="upload-empty-state">{{ t("files.noTasks") }}</div>
          </el-scrollbar>
        </div>
      </el-dialog>

      <Transition name="mobile-action-menu-fade">
        <div v-if="actionMenuOpen" class="mobile-action-scrim" @click="actionMenuOpen = false" />
      </Transition>
      <div class="mobile-action-widget" :class="{ open: actionMenuOpen }">
        <Transition name="mobile-action-menu-pop">
          <div v-if="actionMenuOpen" class="mobile-action-menu" role="menu">
            <button type="button" role="menuitem" @click="runMobileAction(promptCreateFolder)">
              <el-icon><FolderPlus /></el-icon>
              <span>{{ t("files.newFolder") }}</span>
            </button>
            <button type="button" role="menuitem" @click="runMobileAction(() => fileInput?.click())">
              <el-icon><Upload /></el-icon>
              <span>{{ t("files.upload") }}</span>
            </button>
            <button type="button" role="menuitem" @click="runMobileAction(() => folderInput?.click())">
              <el-icon><FolderUp /></el-icon>
              <span>{{ t("files.uploadFolder") }}</span>
            </button>
            <button type="button" role="menuitem" @click="runMobileAction(loadFiles)">
              <el-icon><RefreshCw /></el-icon>
              <span>{{ t("files.refresh") }}</span>
            </button>
            <button type="button" role="menuitem" @click="runMobileAction(toggleLocale)">
              <el-icon><component :is="languageIcon" /></el-icon>
              <span>{{ localeToggleLabel }}</span>
            </button>
          </div>
        </Transition>
        <button
          class="mobile-action-fab"
          type="button"
          :aria-expanded="actionMenuOpen"
          :aria-label="t('files.moreActions')"
          @click="actionMenuOpen = !actionMenuOpen"
        >
          <el-icon><MoreHorizontal /></el-icon>
        </button>
      </div>

    </section>

    <el-dialog v-model="shareDialog" :title="t('files.shareDialogTitle')" width="min(460px, calc(100vw - 32px))">
      <div class="share-box">
        <el-input v-model="shareUrl" readonly />
        <el-button type="primary" @click="copyShareUrl">{{ t("files.copyLink") }}</el-button>
      </div>
    </el-dialog>

    <FilePreviewOverlay
      :visible="previewOpen"
      :item="previewItem"
      :src="previewUrl"
      :kind="previewKind"
      :meta="previewMeta"
      :image-index="previewImageIndex"
      :image-total="previewImages.length"
      :title="t('files.preview')"
      :close-label="t('common.close')"
      :download-label="t('files.download')"
      :previous-label="t('files.previousImage')"
      :next-label="t('files.nextImage')"
      :image-loading-text="t('files.imageLoading')"
      :image-load-failed-text="t('files.imageLoadFailed')"
      :video-loading-text="t('files.videoLoading')"
      :video-fallback-text="t('files.videoUnsupported')"
      :audio-loading-text="t('files.audioLoading')"
      :audio-fallback-text="t('files.audioUnsupported')"
      :markdown-loading-text="t('files.markdownLoading')"
      :markdown-load-failed-text="t('files.markdownLoadFailed')"
      :text-loading-text="t('files.textLoading')"
      :text-load-failed-text="t('files.textLoadFailed')"
      :pdf-loading-text="t('files.pdfLoading')"
      :pdf-load-failed-text="t('files.pdfLoadFailed')"
      :pdf-toolbar-label="t('files.pdfToolbar')"
      :pdf-zoom-out-label="t('files.pdfZoomOut')"
      :pdf-zoom-in-label="t('files.pdfZoomIn')"
      :pdf-fit-width-label="t('files.pdfFitWidth')"
      :pdf-page-count-template="t('files.pdfPageCount', { current: '{current}', total: '{total}' })"
      :pdf-page-label-template="t('files.pdfPageLabel', { current: '{current}', total: '{total}' })"
      :retry-label="t('common.retry')"
      @close="closePreview"
      @download="download"
      @previous-image="showPreviousImage"
      @next-image="showNextImage"
    />

    <Teleport to="body">
      <div v-if="contextMenu.visible" class="context-menu-layer" @mousedown="closeContextMenu" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div
          class="drive-dropdown-popper drive-context-menu el-popper"
          :class="{ 'is-mobile-context': isMobile }"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          @mousedown.stop
          @contextmenu.prevent.stop
        >
          <div class="el-dropdown-menu">
            <button class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('open')">
              <el-icon><FolderOpen /></el-icon><span>{{ t("files.open") }}</span>
            </button>
            <button v-if="contextMenu.item?.type === 'file'" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('download')">
              <el-icon><Download /></el-icon><span>{{ t("files.download") }}</span>
            </button>
            <button v-if="contextMenu.item && canPreview(contextMenu.item)" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('preview')">
              <el-icon><Eye /></el-icon><span>{{ t("files.preview") }}</span>
            </button>
            <button class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('rename')">
              <el-icon><Pencil /></el-icon><span>{{ t("files.rename") }}</span>
            </button>
            <button class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('move')">
              <el-icon><Move /></el-icon><span>{{ t("files.move") }}</span>
            </button>
            <button v-if="contextMenu.item?.type === 'file'" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('share')">
              <el-icon><Share2 /></el-icon><span>{{ t("files.share") }}</span>
            </button>
            <button class="el-dropdown-menu__item el-dropdown-menu__item--divided context-menu-item dropdown-danger" type="button" role="menuitem" @click="runContextAction('delete')">
              <el-icon><Trash2 /></el-icon><span>{{ t("files.delete") }}</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </AppShell>
</template>

<script setup>
import { computed, h, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElCheckbox, ElMessage, ElMessageBox } from "element-plus";
import {
  ALargeSmall,
  ArrowLeft,
  Download,
  Eye,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Languages,
  LayoutGrid,
  LayoutList,
  LogOut,
  MoreHorizontal,
  Move,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Upload,
  X
} from "@lucide/vue";
import { api, checkSession, isRetryableUploadError } from "../api/client.js";
import FilePreviewOverlay from "../components/FilePreviewOverlay.vue";
import FileIcon from "../components/FileIcon.vue";
import { dateLocale, locale, localeToggleLabel, t, toggleLocale, uiError } from "../i18n.js";
import { applyAuth, state } from "../store.js";
import { codeLanguageFor, fileKind, isPlainTextFile } from "../utils/file-icons.js";
import AppShell from "./AppShell.vue";

const router = useRouter();
const route = useRoute();
const currentPath = ref(pathFromRoute(route));
const items = ref([]);
const loading = ref(false);
const hasLoadedCurrentPath = ref(false);
const query = ref("");
const sort = ref("name");
const order = ref("asc");
const viewMode = ref(localStorage.getItem("web-drive-view") || "list");
const isMobile = ref(false);
const selectedRows = ref([]);
const tableRef = ref(null);
const fileInput = ref(null);
const folderInput = ref(null);
const dragging = ref(false);
const actionMenuOpen = ref(false);
const tasks = reactive([]);
const uploadPanelOpen = ref(false);
const activeUploads = ref(0);
const shareDialog = ref(false);
const shareUrl = ref("");
const previewOpen = ref(false);
const previewItem = ref(null);
const loggingOut = ref(false);
const contextMenu = reactive({ visible: false, x: 0, y: 0, item: null });
const chunkSize = computed(() => Number(state.config.uploadChunkSize || 8 * 1024 * 1024));
const accountName = computed(() => state.user?.username || t("app.user"));
const initial = computed(() => accountName.value.slice(0, 1).toUpperCase());
const languageIcon = computed(() => (locale.value === "zh-CN" ? Languages : ALargeSmall));
const uploadConcurrency = 3;
const uploadChunkConcurrency = 3;
const uploadChunkMaxAttempts = 3;
const uploadChunkRetryBaseDelayMs = 800;
const uploadQueue = [];
const uploadChunkWaiters = [];
let activeUploadChunks = 0;
const dateTimeFormatter = computed(() => new Intl.DateTimeFormat(dateLocale.value, { dateStyle: "medium", timeStyle: "short" }));
const uploadTaskFiles = new Map();
let uploadRefreshTimer = null;
let mobileMediaQuery = null;

const breadcrumbParts = computed(() => {
  const parts = currentPath.value.split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join("/")}` }));
});
const collapsedBreadcrumbParts = computed(() => (breadcrumbParts.value.length > 3 ? breadcrumbParts.value.slice(0, -2) : []));
const visibleBreadcrumbParts = computed(() => (collapsedBreadcrumbParts.value.length ? breadcrumbParts.value.slice(-2) : breadcrumbParts.value));
const currentFolderLabel = computed(() => breadcrumbParts.value.at(-1)?.name || t("files.allFiles"));
const parentPathLabel = computed(() => {
  if (!breadcrumbParts.value.length) return "";
  const parents = breadcrumbParts.value.slice(0, -1).map((part) => part.name);
  return [t("files.allFiles"), ...parents].join(" / ");
});
const selectedMap = computed(() => new Map(selectedRows.value.map((item) => [item.path, item])));
const allListSelected = computed(() => items.value.length > 0 && items.value.every((item) => selectedMap.value.has(item.path)));
const someListSelected = computed(() => selectedRows.value.length > 0 && !allListSelected.value);
const tableSortBy = computed(() => ({ key: sort.value, order: order.value }));
const uploadActiveCount = computed(() => tasks.filter((task) => task.status === "uploading" || task.status === "pending").length);
const uploadPausingCount = computed(() => tasks.filter((task) => task.status === "pausing").length);
const uploadPausedCount = computed(() => tasks.filter((task) => task.status === "paused").length);
const uploadDoneCount = computed(() => tasks.filter((task) => task.status === "done").length);
const uploadErrorCount = computed(() => tasks.filter((task) => task.status === "error").length);
const uploadCanceledCount = computed(() => tasks.filter((task) => task.status === "canceled").length);
const hasPausableTasks = computed(() => tasks.some((task) => canPauseTask(task)));
const hasPausedTasks = computed(() => tasks.some((task) => canResumeTask(task)));
const hasFailedTasks = computed(() => tasks.some((task) => canRetryTask(task)));
const hasFinishedTasks = computed(() => tasks.some((task) => ["done", "error", "canceled"].includes(task.status)));
const overallUploadProgress = computed(() => {
  if (!tasks.length) return 0;
  return tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length;
});
const uploadOrbBadge = computed(() => uploadActiveCount.value + uploadPausingCount.value);
const uploadSummary = computed(() => {
  const parts = [];
  if (uploadActiveCount.value) parts.push(t("files.uploadActive", { count: uploadActiveCount.value }));
  if (uploadPausingCount.value) parts.push(t("files.uploadPausing", { count: uploadPausingCount.value }));
  if (uploadPausedCount.value) parts.push(t("files.uploadPaused", { count: uploadPausedCount.value }));
  if (uploadDoneCount.value) parts.push(t("files.uploadDone", { count: uploadDoneCount.value }));
  if (uploadErrorCount.value) parts.push(t("files.uploadError", { count: uploadErrorCount.value }));
  if (uploadCanceledCount.value) parts.push(t("files.uploadCanceled", { count: uploadCanceledCount.value }));
  return parts.join(" · ") || t("files.noTasks");
});
const previewKind = computed(() => previewKindFor(previewItem.value));
const previewUrl = computed(() => (previewItem.value ? `/api/files/preview?${new URLSearchParams({ path: previewItem.value.path })}` : ""));
const previewImages = computed(() => items.value.filter((item) => previewKindFor(item) === "image"));
const previewImageIndex = computed(() => previewImages.value.findIndex((item) => item.path === previewItem.value?.path));
const previewMeta = computed(() => {
  const item = previewItem.value;
  if (!item) return "";
  const parts = [];
  if (item.type === "file") parts.push(item.sizeLabel || formatSize(item.size));
  if (item.modifiedAtLabel && item.modifiedAtLabel !== "-") parts.push(item.modifiedAtLabel);
  return parts.join(" · ");
});
const sortableTableKeys = new Set(["name", "size", "modifiedAt"]);
const tableRowEventHandlers = {
  onDblclick: ({ rowData, event }) => handleVirtualRowDblclick(rowData, event),
  onContextmenu: ({ rowData, event }) => openRowContextMenu(rowData, null, event)
};
const tableColumns = computed(() => [
  {
    key: "selection",
    dataKey: "selection",
    width: 44,
    align: "center",
    headerCellRenderer: () =>
      h(ElCheckbox, {
        modelValue: allListSelected.value,
        indeterminate: someListSelected.value,
        onClick: (event) => event.stopPropagation(),
        onChange: toggleAllListSelection
      }),
    cellRenderer: ({ rowData }) =>
      h(ElCheckbox, {
        modelValue: selectedMap.value.has(rowData.path),
        onClick: (event) => event.stopPropagation(),
        onChange: () => toggleGridSelection(rowData)
      })
  },
  {
    key: "name",
    dataKey: "name",
    title: t("files.name"),
    width: 460,
    flexGrow: 1,
    sortable: true,
    cellRenderer: ({ rowData }) => renderFileNameCell(rowData)
  },
  {
    key: "size",
    dataKey: "size",
    title: t("files.size"),
    width: 120,
    sortable: true,
    cellRenderer: ({ rowData }) => (rowData.type === "folder" ? "-" : rowData.sizeLabel)
  },
  {
    key: "modifiedAt",
    dataKey: "modifiedAt",
    title: t("files.modifiedAt"),
    width: 190,
    sortable: true,
    cellRenderer: ({ rowData }) => rowData.modifiedAtLabel
  },
  {
    key: "actions",
    dataKey: "actions",
    title: "",
    width: 104,
    align: "center",
    cellRenderer: ({ rowData }) => renderActionButton(rowData)
  }
]);

watch(viewMode, (value) => localStorage.setItem("web-drive-view", value));
watch(isMobile, (value) => {
  if (!value) actionMenuOpen.value = false;
});
watch(locale, () => {
  items.value = items.value.map(normalizeFileItem);
});
watch(
  () => route.fullPath,
  () => {
    if (route.name !== "files") return;
    const nextPath = pathFromRoute(route);
    if (nextPath === currentPath.value && hasLoadedCurrentPath.value) return;
    currentPath.value = nextPath;
    hasLoadedCurrentPath.value = false;
    loadFiles();
  },
  { immediate: true }
);
watch(query, () => {
  clearTimeout(watch.timer);
  watch.timer = setTimeout(loadFiles, 250);
});

onMounted(() => {
  mobileMediaQuery = window.matchMedia("(max-width: 640px)");
  syncMobileState(mobileMediaQuery);
  mobileMediaQuery.addEventListener?.("change", syncMobileState);
});

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener?.("change", syncMobileState);
  clearTimeout(uploadRefreshTimer);
});

function syncMobileState(event) {
  isMobile.value = Boolean(event.matches);
}

async function loadFiles(options = {}) {
  const { preserveSelection = false, resetScroll = true, silent = false } = options;
  if (!silent) loading.value = true;
  try {
    const data = await api.files({ path: currentPath.value, q: query.value, sort: sort.value, order: order.value });
    const nextPath = normalizeDrivePath(data.path || currentPath.value);
    currentPath.value = nextPath;
    items.value = (data.items || []).map(normalizeFileItem);
    state.config = data.config || state.config;
    if (!preserveSelection) selectedRows.value = [];
    if (resetScroll) tableRef.value?.scrollToTop?.(0);
    hasLoadedCurrentPath.value = true;
    if (route.name === "files" && nextPath !== pathFromRoute(route)) router.replace(fileRouteForPath(nextPath));
  } catch (err) {
    ElMessage.error(uiError(err, "files.readFailed"));
  } finally {
    if (!silent) loading.value = false;
  }
}

async function logout() {
  if (loggingOut.value) return;
  loggingOut.value = true;
  try {
    await api.logout();
    applyAuth(null);
    router.push("/login");
  } catch (err) {
    ElMessage.error(uiError(err, "files.logoutFailed"));
  } finally {
    loggingOut.value = false;
  }
}

function openPath(path) {
  const nextPath = normalizeDrivePath(path);
  if (nextPath === currentPath.value) {
    loadFiles();
    return;
  }
  router.push(fileRouteForPath(nextPath));
}

function normalizeDrivePath(path = "/") {
  const parts = String(path || "/")
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  return `/${parts.join("/")}`;
}

function pathFromRoute(targetRoute) {
  const value = targetRoute.params.drivePath;
  const parts = Array.isArray(value) ? value : String(value || "").split("/");
  return normalizeDrivePath(`/${parts.filter(Boolean).join("/")}`);
}

function fileRouteForPath(path) {
  const parts = normalizeDrivePath(path).split("/").filter(Boolean);
  return { name: "files", params: { drivePath: parts } };
}

function goUp() {
  const parts = currentPath.value.split("/").filter(Boolean);
  parts.pop();
  openPath(`/${parts.join("/")}`);
}

function openItem(item) {
  if (item.type === "folder") openPath(item.path);
  else if (canPreview(item)) preview(item);
  else download(item);
}

function handleVirtualRowDblclick(row, event) {
  if (event?.target?.closest?.(".el-checkbox, .table-action-button, .el-button")) return;
  openItem(row);
}

function handleRowDblclick(row, column, event) {
  if (column?.type === "selection" || event?.target?.closest?.(".el-checkbox")) return;
  openItem(row);
}

function toggleAllListSelection(value) {
  selectedRows.value = value ? [...items.value] : [];
}

function handleTableSort({ key, order: nextOrder }) {
  const nextKey = String(key || "");
  if (!sortableTableKeys.has(nextKey)) return;
  const changedColumn = nextKey !== sort.value;
  sort.value = nextKey;
  order.value = changedColumn ? "asc" : nextOrder === "desc" ? "desc" : "asc";
  selectedRows.value = [];
  tableRef.value?.scrollToTop?.(0);
  loadFiles();
}

function renderFileNameCell(row) {
  return h(
    "button",
    {
      class: "file-name",
      type: "button",
      onClick: (event) => {
        event.stopPropagation();
        openItem(row);
      }
    },
    [
      h(FileIcon, { item: row }),
      h("span", { class: "file-name-text" }, row.name)
    ]
  );
}

function renderActionButton(row) {
  return h(
    "button",
    {
      class: "table-action-button",
      type: "button",
      "aria-label": t("files.rowActions", { name: row.name }),
      onClick: (event) => openRowContextMenu(row, null, event, { anchor: "button" })
    },
    [h("span", null, t("files.actions"))]
  );
}

function openRowContextMenu(row, column, event, options = {}) {
  event.preventDefault();
  event.stopPropagation?.();
  actionMenuOpen.value = false;
  const menuWidth = 164;
  const itemCount = 4 + (row.type === "file" ? 3 : 0) + (canPreview(row) ? 1 : 0);
  const menuHeight = Math.min(360, 14 + itemCount * 40);
  const rect = options.anchor === "button" ? event.currentTarget?.getBoundingClientRect?.() : null;
  const x = rect ? rect.right - menuWidth : event.clientX;
  const y = rect ? rect.bottom + 6 : event.clientY;
  contextMenu.item = row;
  contextMenu.x = Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  contextMenu.y = Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));
  contextMenu.visible = true;
}

function openMobileRowActions(item, event) {
  openRowContextMenu(item, null, event, { anchor: "button" });
}

function closeContextMenu() {
  contextMenu.visible = false;
  contextMenu.item = null;
}

function runMobileAction(action) {
  actionMenuOpen.value = false;
  action();
}

async function runContextAction(action) {
  const item = contextMenu.item;
  if (!item) return;
  closeContextMenu();
  if (action === "open") return openItem(item);
  if (action === "download") return download(item);
  if (action === "preview") return preview(item);
  if (action === "rename") return promptRename(item);
  if (action === "move") return promptMove(item);
  if (action === "share") return share(item);
  if (action === "delete") return deleteOne(item);
}

function canPreview(item) {
  return Boolean(previewKindFor(item));
}

function previewKindFor(item) {
  if (item?.type !== "file") return "";
  const name = String(item.name || item.fileName || "").toLowerCase();
  const mime = String(item.mime || "").toLowerCase();
  if (name.endsWith(".md") || mime.startsWith("text/markdown")) return "markdown";
  const kind = item.kind || fileKind(item);
  if (kind === "image" || kind === "video" || kind === "audio" || kind === "pdf") return kind;
  if (codeLanguageFor(item)) return "code";
  if (isPlainTextFile(item)) return "text";
  return "";
}

function normalizeFileItem(item) {
  const kind = fileKind(item);
  return {
    ...item,
    kind,
    sizeLabel: item.type === "folder" ? t("files.folder") : formatSize(item.size),
    modifiedAtLabel: formatTime(item.modifiedAt)
  };
}

function toggleView() {
  viewMode.value = viewMode.value === "list" ? "grid" : "list";
}

function toggleGridSelection(item) {
  if (selectedMap.value.has(item.path)) selectedRows.value = selectedRows.value.filter((row) => row.path !== item.path);
  else selectedRows.value = [...selectedRows.value, item];
}

function formatSize(size = 0) {
  if (!size) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatTime(value) {
  if (!value) return "-";
  return dateTimeFormatter.value.format(new Date(value));
}

function download(item) {
  window.open(`/api/files/download?${new URLSearchParams({ path: item.path })}`, "_blank");
  checkSession().catch(() => {});
}

function downloadSelected() {
  for (const item of selectedRows.value.filter((row) => row.type === "file")) download(item);
}

function preview(item) {
  if (!canPreview(item)) return;
  previewItem.value = item;
  previewOpen.value = true;
}

function closePreview() {
  previewOpen.value = false;
  previewItem.value = null;
}

function showPreviousImage() {
  if (previewImageIndex.value <= 0) return;
  previewItem.value = previewImages.value[previewImageIndex.value - 1] || previewItem.value;
}

function showNextImage() {
  if (previewImageIndex.value < 0 || previewImageIndex.value >= previewImages.value.length - 1) return;
  previewItem.value = previewImages.value[previewImageIndex.value + 1] || previewItem.value;
}

async function promptCreateFolder() {
  try {
    const { value } = await ElMessageBox.prompt(t("files.createFolderPrompt"), t("files.createFolderTitle"), {
      inputValidator: (value) => Boolean(value?.trim()) || t("files.folderNameRequired")
    });
    await api.createFolder({ parent: currentPath.value, name: value.trim() });
    ElMessage.success(t("files.folderCreated"));
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(uiError(err, "files.createFailed"));
  }
}

async function deleteOne(item) {
  await deletePaths([item.path]);
}

async function deleteSelected() {
  await deletePaths(selectedRows.value.map((item) => item.path));
}

async function deletePaths(paths) {
  if (!paths.length) return;
  try {
    await ElMessageBox.confirm(t("files.deleteConfirm", { count: paths.length }), t("files.deleteConfirmTitle"), { type: "warning" });
    await api.deleteFiles({ paths });
    ElMessage.success(t("files.deleted"));
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(uiError(err, "files.deleteFailed"));
  }
}

async function promptRename(item) {
  try {
    const { value } = await ElMessageBox.prompt(t("files.renamePrompt"), t("files.renameTitle"), { inputValue: item.name });
    if (!value) return;
    await api.renameFile({ path: item.path, name: value });
    ElMessage.success(t("files.renamed"));
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(uiError(err, "files.renameFailed"));
  }
}

async function promptMove(item) {
  try {
    const { value } = await ElMessageBox.prompt(t("files.movePrompt"), t("files.moveTitle"), { inputValue: item.path });
    if (!value) return;
    await api.moveFile({ path: item.path, target: value });
    ElMessage.success(t("files.moved"));
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(uiError(err, "files.moveFailed"));
  }
}

async function share(item) {
  try {
    const data = await api.createShare({ path: item.path });
    shareUrl.value = `${location.origin}${data.share.url}`;
    shareDialog.value = true;
  } catch (err) {
    ElMessage.error(uiError(err, "files.shareFailed"));
  }
}

async function copyShareUrl() {
  await navigator.clipboard.writeText(shareUrl.value);
  ElMessage.success(t("files.linkCopied"));
}

function isFileDrag(event) {
  return [...(event.dataTransfer?.types || [])].includes("Files");
}

function handleDragEnter(event) {
  if (!isFileDrag(event)) return;
  dragging.value = true;
}

function handleDragOver(event) {
  if (!isFileDrag(event)) return;
  event.dataTransfer.dropEffect = "copy";
  dragging.value = true;
}

function handleDragLeave(event) {
  if (event.currentTarget?.contains?.(event.relatedTarget)) return;
  dragging.value = false;
}

async function handleDrop(event) {
  dragging.value = false;
  try {
    const { files, folders } = await collectDroppedItems(event.dataTransfer);
    await createDroppedFolders(folders);
    if (files.length) {
      uploadFiles(files);
    } else if (folders.length) {
      ElMessage.success(t("files.folderCreated"));
      loadFiles({ preserveSelection: true, resetScroll: false, silent: true });
    } else {
      ElMessage.warning(t("files.noUploadFiles"));
    }
  } catch (err) {
    ElMessage.error(uiError(err, "files.dropReadFailed"));
  }
}

function handleFileInput(event) {
  const picked = [...(event.target.files || [])];
  event.target.value = "";
  uploadFiles(picked);
}

async function uploadFiles(files) {
  const picked = [...files].map(toUploadItem).filter(Boolean);
  if (!picked.length) return;
  uploadPanelOpen.value = true;
  for (const item of picked) {
    const task = createUploadTask(item);
    tasks.unshift(task);
    uploadTaskFiles.set(task.id, item.file);
    enqueueUploadTask(task);
  }
  runUploadQueue();
}

function toUploadItem(item) {
  if (!item) return null;
  if (item.file) {
    return {
      file: item.file,
      relativePath: normalizeRelativePath(item.relativePath || item.file.webkitRelativePath || item.file.name)
    };
  }
  return {
    file: item,
    relativePath: normalizeRelativePath(item.webkitRelativePath || item.name)
  };
}

function normalizeRelativePath(path) {
  return String(path || "").replace(/\\/g, "/").split("/").filter(Boolean).join("/");
}

function createUploadTask(item) {
  const relative = item.relativePath || item.file.name;
  const parts = relative.split("/").filter(Boolean);
  const name = parts.pop() || item.file.name;
  const directory = parts.length ? `${currentPath.value.replace(/\/$/, "")}/${parts.join("/")}` : currentPath.value;
  const mime = item.file.type || "";
  const kind = fileKind({ name, mime, type: "file" });
  return reactive({
    id: `${Date.now()}-${Math.random()}`,
    directory,
    fileName: name,
    mime,
    kind,
    name: relative,
    size: item.file.size,
    loadedBytes: 0,
    progress: 0,
    speedBps: 0,
    etaSeconds: null,
    uploadedChunks: [],
    totalChunks: 0,
    uploadId: "",
    retryCount: 0,
    errorMessage: "",
    status: "pending",
    abortController: null,
    cancelRequested: false,
    enqueued: false,
    running: false,
    lastMetricAt: 0,
    lastLoadedBytes: 0
  });
}

async function collectDroppedItems(dataTransfer) {
  const transferItems = [...(dataTransfer?.items || [])];
  const entries = transferItems
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);

  if (!entries.length) return { files: [...(dataTransfer?.files || [])], folders: [] };

  const result = { files: [], folders: [] };
  await Promise.all(entries.map((entry) => readEntryFiles(entry, "", result)));
  return result;
}

async function readEntryFiles(entry, parentPath, result) {
  const entryPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    result.files.push({ file, relativePath: entryPath });
    return;
  }
  if (!entry.isDirectory) return;

  result.folders.push(entryPath);
  const children = await readDirectoryEntries(entry);
  await Promise.all(children.map((child) => readEntryFiles(child, entryPath, result)));
}

function readFileEntry(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(entry) {
  const reader = entry.createReader();
  const children = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) break;
    children.push(...batch);
  }
  return children;
}

async function createDroppedFolders(folders) {
  const uniqueFolders = [...new Set(folders.map(normalizeRelativePath).filter(Boolean))].sort((a, b) => {
    const depth = a.split("/").length - b.split("/").length;
    return depth || a.localeCompare(b, "zh-Hans-CN");
  });
  for (const folder of uniqueFolders) {
    const parts = folder.split("/");
    const name = parts.pop();
    const parent = parts.length ? `${currentPath.value.replace(/\/$/, "")}/${parts.join("/")}` : currentPath.value;
    try {
      await api.createFolder({ parent, name });
    } catch (err) {
      if (!/already exists|已存在|path already exists/i.test(err.message || "")) throw err;
    }
  }
}

function enqueueUploadTask(task) {
  if (!task || task.enqueued || task.status !== "pending") return;
  task.enqueued = true;
  uploadQueue.push(task);
}

function removeQueuedTask(task) {
  const index = uploadQueue.findIndex((item) => item.id === task.id);
  if (index >= 0) uploadQueue.splice(index, 1);
  task.enqueued = false;
}

function runUploadQueue() {
  while (activeUploads.value < uploadConcurrency && uploadQueue.length) {
    const task = uploadQueue.shift();
    task.enqueued = false;
    if (task.status !== "pending") continue;

    const file = uploadTaskFiles.get(task.id);
    if (!file) {
      task.status = "error";
      task.errorMessage = t("upload.fileMissing");
      continue;
    }

    activeUploads.value += 1;
    uploadOne(file, task).finally(() => {
      activeUploads.value -= 1;
      runUploadQueue();
    });
  }
}

async function uploadOne(file, task) {
  if (task.status !== "pending") return;
  task.status = "uploading";
  task.errorMessage = "";
  task.cancelRequested = false;
  task.running = true;
  task.abortController = new AbortController();
  task.lastMetricAt = performance.now();
  task.lastLoadedBytes = task.loadedBytes || 0;

  try {
    if (!task.uploadId) {
      const init = await api.initUpload({ directory: task.directory, name: task.fileName, size: file.size, chunkSize: chunkSize.value });
      const uploaded = new Set(init.task.uploadedChunks || []);
      task.uploadId = init.task.uploadId;
      task.totalChunks = init.task.totalChunks;
      task.uploadedChunks = [...uploaded];
      task.loadedBytes = uploadedBytesFromChunks(task, uploaded);
      updateUploadProgress(task);
    }

    const uploaded = new Set(task.uploadedChunks || []);
    await uploadMissingChunks(file, task, uploaded);

    if (task.cancelRequested || task.status === "canceled") return;
    if (task.status === "paused" || task.status === "pausing") {
      task.etaSeconds = null;
      if (task.status === "pausing") task.status = "paused";
      return;
    }

    await api.completeUpload({ uploadId: task.uploadId });
    task.loadedBytes = task.size;
    task.progress = 100;
    task.speedBps = 0;
    task.etaSeconds = 0;
    task.status = "done";
    scheduleUploadRefresh();
  } catch (err) {
    if (task.cancelRequested || task.status === "canceled" || err?.name === "AbortError") {
      task.etaSeconds = null;
      return;
    }

    task.status = "error";
    task.etaSeconds = null;
    task.errorMessage = uiError(err, "files.uploadFailed");
    ElMessage.error(task.errorMessage);
  } finally {
    task.abortController = null;
    task.running = false;
  }
}

async function uploadMissingChunks(file, task, uploaded) {
  const pendingChunks = [];
  for (let index = 0; index < task.totalChunks; index += 1) {
    if (!uploaded.has(index)) pendingChunks.push(index);
  }

  if (!pendingChunks.length) {
    task.loadedBytes = uploadedBytesFromChunks(task, uploaded);
    updateUploadProgress(task);
    return;
  }

  let nextPendingIndex = 0;
  let firstError = null;
  const workerCount = Math.min(uploadChunkConcurrency, pendingChunks.length);
  const takeNextChunk = () => pendingChunks[nextPendingIndex++];

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (firstError) return;
        if (task.cancelRequested || task.status === "canceled") return;
        if (task.status === "paused" || task.status === "pausing") {
          task.etaSeconds = null;
          return;
        }

        const index = takeNextChunk();
        if (index === undefined) return;

        const start = index * chunkSize.value;
        const end = Math.min(file.size, start + chunkSize.value);
        try {
          await uploadChunkWithRetry(task, index, file.slice(start, end));
        } catch (err) {
          if (task.cancelRequested || task.status === "canceled" || err?.name === "AbortError") return;
          firstError = firstError || err;
          task.abortController?.abort();
          return;
        }

        if (task.cancelRequested || task.status === "canceled") return;

        uploaded.add(index);
        task.uploadedChunks = [...uploaded].sort((a, b) => a - b);
        updateUploadMetrics(task, uploadedBytesFromChunks(task, uploaded));
      }
    })
  );

  if (firstError) throw firstError;
}

async function acquireUploadChunkSlot(signal) {
  if (signal?.aborted) throw abortError();
  if (activeUploadChunks < uploadChunkConcurrency) {
    activeUploadChunks += 1;
    return;
  }

  await new Promise((resolve, reject) => {
    const waiter = { resolve, reject, signal, onAbort: null };
    waiter.onAbort = () => {
      const index = uploadChunkWaiters.indexOf(waiter);
      if (index >= 0) uploadChunkWaiters.splice(index, 1);
      reject(abortError());
    };
    signal?.addEventListener("abort", waiter.onAbort, { once: true });
    uploadChunkWaiters.push(waiter);
  });
}

function releaseUploadChunkSlot() {
  while (uploadChunkWaiters.length) {
    const waiter = uploadChunkWaiters.shift();
    waiter.signal?.removeEventListener("abort", waiter.onAbort);
    if (waiter.signal?.aborted) continue;
    waiter.resolve();
    return;
  }
  activeUploadChunks = Math.max(0, activeUploadChunks - 1);
}

async function uploadChunkWithRetry(task, index, blob) {
  let lastError = null;
  for (let attempt = 1; attempt <= uploadChunkMaxAttempts; attempt += 1) {
    if (task.cancelRequested || task.status === "canceled" || task.abortController?.signal.aborted) throw abortError();
    await acquireUploadChunkSlot(task.abortController.signal);
    try {
      if (task.status === "paused" || task.status === "pausing") throw abortError();
      return await api.uploadChunk(task.uploadId, index, blob, { signal: task.abortController.signal });
    } catch (error) {
      lastError = error;
      if (attempt >= uploadChunkMaxAttempts || !isRetryableUploadError(error)) throw error;
    } finally {
      releaseUploadChunkSlot();
    }
    await abortableDelay(uploadChunkRetryBaseDelayMs * 2 ** (attempt - 1), task.abortController.signal);
  }
  throw lastError;
}

function abortableDelay(milliseconds, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}

function uploadedBytesFromChunks(task, uploaded) {
  let bytes = 0;
  for (const index of uploaded) bytes += uploadChunkBytes(task, index);
  return Math.min(task.size, bytes);
}

function uploadChunkBytes(task, index) {
  const start = index * chunkSize.value;
  return Math.max(0, Math.min(task.size, start + chunkSize.value) - start);
}

function updateUploadMetrics(task, loadedBytes) {
  const now = performance.now();
  const previousLoaded = task.lastLoadedBytes || 0;
  const previousAt = task.lastMetricAt || now;
  const seconds = Math.max((now - previousAt) / 1000, 0.001);
  const delta = Math.max(0, loadedBytes - previousLoaded);

  task.loadedBytes = loadedBytes;
  updateUploadProgress(task);

  if (delta > 0) {
    const instantSpeed = delta / seconds;
    task.speedBps = task.speedBps ? task.speedBps * 0.65 + instantSpeed * 0.35 : instantSpeed;
    task.etaSeconds = task.speedBps > 0 ? Math.max(0, (task.size - task.loadedBytes) / task.speedBps) : null;
    task.lastLoadedBytes = loadedBytes;
    task.lastMetricAt = now;
  }
}

function updateUploadProgress(task) {
  if (task.size <= 0) {
    task.progress = task.uploadedChunks?.length ? 96 : 0;
    return;
  }
  task.progress = Math.min(96, (task.loadedBytes / task.size) * 96);
}

function pauseUploadTask(task) {
  if (!canPauseTask(task)) return;
  if (task.status === "pending") {
    removeQueuedTask(task);
    task.status = "paused";
  } else {
    task.status = "pausing";
  }
  task.etaSeconds = null;
  runUploadQueue();
}

function resumeUploadTask(task) {
  if (!canResumeTask(task)) return;
  task.status = "pending";
  task.errorMessage = "";
  enqueueUploadTask(task);
  runUploadQueue();
}

async function cancelUploadTask(task) {
  if (!canCancelTask(task)) return;
  task.cancelRequested = true;
  task.status = "canceled";
  task.etaSeconds = null;
  removeQueuedTask(task);
  task.abortController?.abort();

  if (task.uploadId) {
    try {
      await api.cancelUpload({ uploadId: task.uploadId });
    } catch {
      // The active request may already have ended the task; cancel is best effort here.
    }
  }
  runUploadQueue();
}

function retryUploadTask(task) {
  if (!canRetryTask(task)) return;
  task.retryCount += 1;
  task.status = "pending";
  task.errorMessage = "";
  task.cancelRequested = false;
  task.lastMetricAt = 0;
  task.lastLoadedBytes = task.loadedBytes || 0;
  enqueueUploadTask(task);
  runUploadQueue();
}

function pauseAllUploads() {
  tasks.forEach((task) => {
    if (!canPauseTask(task)) return;
    if (task.status === "pending") {
      removeQueuedTask(task);
      task.status = "paused";
    } else {
      task.status = "pausing";
    }
    task.etaSeconds = null;
  });
  runUploadQueue();
}

function resumeAllUploads() {
  tasks.forEach((task) => resumeUploadTask(task));
}

function retryFailedUploads() {
  tasks.forEach((task) => retryUploadTask(task));
}

function scheduleUploadRefresh() {
  clearTimeout(uploadRefreshTimer);
  uploadRefreshTimer = setTimeout(() => {
    loadFiles({ preserveSelection: true, resetScroll: false, silent: true });
  }, 160);
}

function clearFinishedTasks() {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (["done", "error", "canceled"].includes(tasks[index].status)) {
      uploadTaskFiles.delete(tasks[index].id);
      tasks.splice(index, 1);
    }
  }
  if (!tasks.length) uploadPanelOpen.value = false;
}

function uploadStatusText(task) {
  if (task.status === "pending") return t("upload.pending");
  if (task.status === "done") return t("upload.done");
  if (task.status === "error") return t("upload.error");
  if (task.status === "pausing") return t("upload.pausing");
  if (task.status === "paused") return t("upload.paused");
  if (task.status === "canceled") return t("upload.canceled");
  return t("upload.uploading");
}

function uploadProgressStatus(task) {
  if (task.status === "done") return "success";
  if (task.status === "error") return "exception";
  if (task.status === "pausing" || task.status === "paused" || task.status === "canceled") return "warning";
  return undefined;
}

function uploadTaskProgressText(task) {
  if (task.status === "uploading" || task.status === "pending") return `${Math.round(task.progress)}%`;
  return uploadStatusText(task);
}

function canPauseTask(task) {
  return task.status === "pending" || task.status === "uploading";
}

function canResumeTask(task) {
  return task.status === "paused" && !task.running;
}

function canRetryTask(task) {
  return task.status === "error";
}

function canCancelTask(task) {
  return ["pending", "uploading", "pausing", "paused", "error"].includes(task.status);
}

function uploadEtaText(task) {
  if (task.status === "done") return t("upload.etaDone");
  if (task.status === "pausing") return t("upload.etaPausing");
  if (task.status === "paused") return t("upload.etaPaused");
  if (task.status === "canceled" || task.status === "error") return "-";
  if (Number.isFinite(task.etaSeconds)) return t("upload.eta", { time: formatDuration(task.etaSeconds) });
  return t("upload.etaPending");
}

function formatDuration(seconds) {
  const total = Math.max(1, Math.ceil(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const restSeconds = total % 60;
  if (minutes < 60) return `${minutes}m ${restSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
</script>
