<template>
  <AppShell title="我的网盘" :subtitle="currentPath">
    <section class="panel file-panel">
      <div class="breadcrumb-row">
        <el-button :icon="ArrowLeft" :disabled="currentPath === '/'" circle @click="goUp" aria-label="返回上级" />
        <el-breadcrumb separator="/">
          <el-breadcrumb-item>
            <a href="#" @click.prevent="openPath('/')">全部文件</a>
          </el-breadcrumb-item>
          <el-breadcrumb-item v-for="part in breadcrumbParts" :key="part.path">
            <a href="#" @click.prevent="openPath(part.path)">{{ part.name }}</a>
          </el-breadcrumb-item>
        </el-breadcrumb>
        <div class="breadcrumb-actions">
          <el-button :icon="FolderPlus" @click="promptCreateFolder">新建文件夹</el-button>
          <el-button type="primary" :icon="Upload" @click="fileInput?.click()">上传</el-button>
          <el-dropdown trigger="click" :show-arrow="false" popper-class="drive-dropdown-popper">
            <el-button :icon="MoreHorizontal" circle aria-label="更多操作" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="FolderUp" @click="folderInput?.click()">上传文件夹</el-dropdown-item>
                <el-dropdown-item :icon="RefreshCw" @click="loadFiles">刷新</el-dropdown-item>
                <el-dropdown-item :icon="viewMode === 'list' ? LayoutGrid : LayoutList" @click="toggleView">{{ viewMode === "list" ? "网格视图" : "列表视图" }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-dropdown trigger="click" class="breadcrumb-user-menu" :show-arrow="false" popper-class="drive-dropdown-popper">
            <button class="account-trigger" type="button" :aria-label="`${accountName} 菜单`">
              <span class="account-name">{{ accountName }}</span>
              <span class="avatar" aria-hidden="true">{{ initial }}</span>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item :icon="LogOut" :disabled="loggingOut" @click="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <div class="simple-toolbar">
        <el-input v-model="query" clearable placeholder="搜索" class="search-input" :prefix-icon="Search" @keyup.enter="loadFiles" @clear="loadFiles" />
      </div>

      <input ref="fileInput" type="file" multiple hidden @change="handleFileInput" />
      <input ref="folderInput" type="file" multiple hidden webkitdirectory directory @change="handleFileInput" />

      <Transition name="selection-bar-slide">
        <div v-if="selectedRows.length" class="selection-bar">
          <span class="selection-count">已选择 {{ selectedRows.length }} 项</span>
          <div class="selection-actions">
            <el-button text type="primary" @click="downloadSelected">下载</el-button>
            <el-button text type="danger" @click="deleteSelected">删除</el-button>
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
              <div class="empty-state-title">当前目录为空</div>
            </div>
          </template>
        </el-auto-resizer>

        <el-scrollbar v-else v-loading="loading" class="file-grid-scrollbar">
          <div class="file-grid" :class="{ empty: !items.length }">
            <div v-if="!loading && items.length === 0" class="empty-state">
              <FolderOpen class="empty-state-icon" aria-hidden="true" />
              <div class="empty-state-title">当前目录为空</div>
            </div>
            <div v-for="item in items" :key="item.path" class="file-card" :class="{ selected: selectedMap.has(item.path) }" @dblclick="openItem(item)" @click="toggleGridSelection(item)">
              <div class="file-card-head">
                <span class="file-icon" :class="item.kind">
                  <el-icon><component :is="item.icon" /></el-icon>
                </span>
                <el-checkbox :model-value="selectedMap.has(item.path)" @click.stop @change="toggleGridSelection(item)" />
              </div>
              <div class="file-card-name">{{ item.name }}</div>
              <div class="file-card-meta">{{ item.sizeLabel }}</div>
              <div class="file-card-meta">{{ item.modifiedAtLabel }}</div>
            </div>
          </div>
        </el-scrollbar>

        <Transition name="file-drop-overlay-fade">
          <div v-if="dragging" class="file-drop-overlay" aria-hidden="true">
            <div class="file-drop-message">
              <el-icon><Upload /></el-icon>
              <span>释放上传</span>
            </div>
          </div>
        </Transition>
      </div>

      <Transition name="upload-widget-fade">
        <div v-if="tasks.length" class="upload-widget" :class="{ open: uploadPanelOpen }">
          <Transition name="upload-panel-pop">
            <div v-if="uploadPanelOpen" class="upload-panel">
              <div class="upload-panel-head">
                <div>
                  <div class="upload-panel-title">上传任务</div>
                  <div class="upload-panel-subtitle">{{ uploadSummary }}</div>
                </div>
                <el-button v-if="hasFinishedTasks" text size="small" @click="clearFinishedTasks">清理完成</el-button>
              </div>

              <el-scrollbar class="upload-task-scrollbar" max-height="min(270px, calc(100dvh - 280px))">
                <div class="upload-task-list">
                  <div v-for="task in tasks" :key="task.id" class="upload-task" :class="`is-${task.status}`">
                    <div class="upload-task-row">
                      <span class="upload-task-name">{{ task.name }}</span>
                      <span class="upload-task-status">{{ uploadStatusText(task) }}</span>
                    </div>
                    <el-progress
                      :percentage="Math.round(task.progress)"
                      :status="uploadProgressStatus(task)"
                      :stroke-width="6"
                      :show-text="false"
                    />
                  </div>
                </div>
              </el-scrollbar>
            </div>
          </Transition>

          <button
            class="upload-orb"
            type="button"
            :aria-expanded="uploadPanelOpen"
            aria-label="上传任务"
            :style="{ '--upload-progress': `${overallUploadProgress * 3.6}deg` }"
            @click="uploadPanelOpen = !uploadPanelOpen"
          >
            <el-icon><Upload /></el-icon>
            <span v-if="uploadOrbBadge" class="upload-orb-badge">{{ uploadOrbBadge }}</span>
          </button>
        </div>
      </Transition>

    </section>

    <el-dialog v-model="shareDialog" title="分享链接" width="min(460px, calc(100vw - 32px))">
      <div class="share-box">
        <el-input v-model="shareUrl" readonly />
        <el-button type="primary" @click="copyShareUrl">复制链接</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="previewDialog" :title="previewItem?.name || '预览'" width="min(900px, calc(100vw - 32px))">
      <img v-if="previewUrl" class="preview-image" :src="previewUrl" :alt="previewItem?.name || 'preview'" />
    </el-dialog>

    <Teleport to="body">
      <div v-if="contextMenu.visible" class="context-menu-layer" @mousedown="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div
          class="drive-dropdown-popper drive-context-menu el-popper"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          role="menu"
          @mousedown.stop
          @contextmenu.prevent.stop
        >
          <div class="el-dropdown-menu">
            <button class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('open')">
              <el-icon><FolderOpen /></el-icon><span>打开</span>
            </button>
            <button v-if="contextMenu.item?.type === 'file'" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('download')">
              <el-icon><Download /></el-icon><span>下载</span>
            </button>
            <button v-if="contextMenu.item && canPreview(contextMenu.item)" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('preview')">
              <el-icon><Eye /></el-icon><span>预览</span>
            </button>
            <button class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('rename')">
              <el-icon><Pencil /></el-icon><span>重命名</span>
            </button>
            <button class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('move')">
              <el-icon><Move /></el-icon><span>移动</span>
            </button>
            <button v-if="contextMenu.item?.type === 'file'" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('copy')">
              <el-icon><Copy /></el-icon><span>复制</span>
            </button>
            <button v-if="contextMenu.item?.type === 'file'" class="el-dropdown-menu__item context-menu-item" type="button" role="menuitem" @click="runContextAction('share')">
              <el-icon><Share2 /></el-icon><span>分享</span>
            </button>
            <button class="el-dropdown-menu__item el-dropdown-menu__item--divided context-menu-item dropdown-danger" type="button" role="menuitem" @click="runContextAction('delete')">
              <el-icon><Trash2 /></el-icon><span>删除</span>
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </AppShell>
</template>

<script setup>
import { computed, h, markRaw, onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElCheckbox, ElIcon, ElMessage, ElMessageBox } from "element-plus";
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  FileArchive,
  FileAudio,
  FileCode,
  FileText,
  FileImage,
  FileQuestion,
  FileSpreadsheet,
  FileType,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  LayoutList,
  LogOut,
  MoreHorizontal,
  Move,
  Pencil,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Upload
} from "@lucide/vue";
import { api } from "../api/client.js";
import { applyAuth, state } from "../store.js";
import AppShell from "./AppShell.vue";

const router = useRouter();
const currentPath = ref("/");
const items = ref([]);
const loading = ref(false);
const query = ref("");
const sort = ref("name");
const order = ref("asc");
const viewMode = ref(localStorage.getItem("web-drive-view") || "list");
const selectedRows = ref([]);
const tableRef = ref(null);
const fileInput = ref(null);
const folderInput = ref(null);
const dragging = ref(false);
const tasks = reactive([]);
const uploadPanelOpen = ref(false);
const activeUploads = ref(0);
const shareDialog = ref(false);
const shareUrl = ref("");
const previewDialog = ref(false);
const previewItem = ref(null);
const previewUrl = ref("");
const loggingOut = ref(false);
const contextMenu = reactive({ visible: false, x: 0, y: 0, item: null });
const chunkSize = computed(() => Number(state.config.uploadChunkSize || 8 * 1024 * 1024));
const accountName = computed(() => state.user?.username || "用户");
const initial = computed(() => accountName.value.slice(0, 1).toUpperCase());
const uploadConcurrency = 3;
const uploadQueue = [];
const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" });
let uploadRefreshTimer = null;

const breadcrumbParts = computed(() => {
  const parts = currentPath.value.split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join("/")}` }));
});
const selectedMap = computed(() => new Map(selectedRows.value.map((item) => [item.path, item])));
const allListSelected = computed(() => items.value.length > 0 && items.value.every((item) => selectedMap.value.has(item.path)));
const someListSelected = computed(() => selectedRows.value.length > 0 && !allListSelected.value);
const tableSortBy = computed(() => ({ key: sort.value, order: order.value }));
const uploadActiveCount = computed(() => tasks.filter((task) => task.status === "uploading" || task.status === "pending").length);
const uploadDoneCount = computed(() => tasks.filter((task) => task.status === "done").length);
const uploadErrorCount = computed(() => tasks.filter((task) => task.status === "error").length);
const hasFinishedTasks = computed(() => tasks.some((task) => task.status === "done" || task.status === "error"));
const overallUploadProgress = computed(() => {
  if (!tasks.length) return 0;
  return tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length;
});
const uploadOrbBadge = computed(() => uploadActiveCount.value);
const uploadSummary = computed(() => {
  const parts = [];
  if (uploadActiveCount.value) parts.push(`${uploadActiveCount.value} 个进行中`);
  if (uploadDoneCount.value) parts.push(`${uploadDoneCount.value} 个完成`);
  if (uploadErrorCount.value) parts.push(`${uploadErrorCount.value} 个失败`);
  return parts.join(" · ") || "暂无任务";
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
    title: "名称",
    width: 460,
    flexGrow: 1,
    sortable: true,
    cellRenderer: ({ rowData }) => renderFileNameCell(rowData)
  },
  {
    key: "size",
    dataKey: "size",
    title: "大小",
    width: 120,
    sortable: true,
    cellRenderer: ({ rowData }) => (rowData.type === "folder" ? "-" : rowData.sizeLabel)
  },
  {
    key: "modifiedAt",
    dataKey: "modifiedAt",
    title: "修改时间",
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
watch(query, () => {
  clearTimeout(watch.timer);
  watch.timer = setTimeout(loadFiles, 250);
});

onMounted(() => {
  loadFiles();
});

async function loadFiles(options = {}) {
  const { preserveSelection = false, resetScroll = true, silent = false } = options;
  if (!silent) loading.value = true;
  try {
    const data = await api.files({ path: currentPath.value, q: query.value, sort: sort.value, order: order.value });
    currentPath.value = data.path;
    items.value = (data.items || []).map(normalizeFileItem);
    state.config = data.config || state.config;
    if (!preserveSelection) selectedRows.value = [];
    if (resetScroll) tableRef.value?.scrollToTop?.(0);
  } catch (err) {
    ElMessage.error(err.message || "读取目录失败");
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
    ElMessage.error(err.message || "退出失败");
  } finally {
    loggingOut.value = false;
  }
}

function openPath(path) {
  currentPath.value = path || "/";
  loadFiles();
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
      h("span", { class: ["file-icon", row.kind || fileKind(row)] }, [h(ElIcon, null, { default: () => h(fileIconFor(row)) })]),
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
      "aria-label": `${row.name} 操作`,
      onClick: (event) => openRowContextMenu(row, null, event, { anchor: "button" })
    },
    [h("span", null, "操作")]
  );
}

function openRowContextMenu(row, column, event, options = {}) {
  event.preventDefault();
  event.stopPropagation?.();
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

function closeContextMenu() {
  contextMenu.visible = false;
  contextMenu.item = null;
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
  if (action === "copy") return promptCopy(item);
  if (action === "share") return share(item);
  if (action === "delete") return deleteOne(item);
}

function canPreview(item) {
  return item.type === "file" && /^image\//.test(item.mime || "");
}

function fileKind(item) {
  if (item.type === "folder") return "folder";
  const mime = String(item.mime || "").toLowerCase();
  const ext = item.name.includes(".") ? item.name.split(".").pop().toLowerCase() : "";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) return "image";
  if (mime.startsWith("video/") || ["mp4", "webm", "mov", "mkv", "avi", "m4v"].includes(ext)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"].includes(ext)) return "archive";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (["xls", "xlsx", "csv", "ods", "numbers"].includes(ext)) return "spreadsheet";
  if (["js", "ts", "jsx", "tsx", "vue", "html", "css", "scss", "json", "xml", "yml", "yaml", "md", "py", "go", "rs", "java", "c", "cpp", "cs", "php", "sh", "ps1"].includes(ext)) return "code";
  if (mime.startsWith("text/") || ["txt", "log", "rtf"].includes(ext)) return "text";
  return "unknown";
}

function fileIconFor(item) {
  return fileIcons[item.kind || fileKind(item)] || FileQuestion;
}

const fileIcons = {
  folder: markRaw(Folder),
  image: markRaw(FileImage),
  video: markRaw(FileVideo),
  audio: markRaw(FileAudio),
  archive: markRaw(FileArchive),
  pdf: markRaw(FileType),
  spreadsheet: markRaw(FileSpreadsheet),
  code: markRaw(FileCode),
  text: markRaw(FileText),
  unknown: markRaw(FileQuestion)
};

function normalizeFileItem(item) {
  const kind = fileKind(item);
  return {
    ...item,
    kind,
    icon: fileIcons[kind] || FileQuestion,
    sizeLabel: item.type === "folder" ? "文件夹" : formatSize(item.size),
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
  return dateTimeFormatter.format(new Date(value));
}

function download(item) {
  window.open(`/api/files/download?${new URLSearchParams({ path: item.path })}`, "_blank");
}

function downloadSelected() {
  for (const item of selectedRows.value.filter((row) => row.type === "file")) download(item);
}

function preview(item) {
  previewItem.value = item;
  previewUrl.value = `/api/files/preview?${new URLSearchParams({ path: item.path })}`;
  previewDialog.value = true;
}

async function promptCreateFolder() {
  try {
    const { value } = await ElMessageBox.prompt("输入文件夹名称", "新建文件夹", {
      inputValidator: (value) => Boolean(value?.trim()) || "文件夹名称不能为空"
    });
    await api.createFolder({ parent: currentPath.value, name: value.trim() });
    ElMessage.success("文件夹已创建");
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(err.message || "创建失败");
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
    await ElMessageBox.confirm(`确认删除 ${paths.length} 项？`, "删除确认", { type: "warning" });
    await api.deleteFiles({ paths });
    ElMessage.success("已删除");
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(err.message || "删除失败");
  }
}

async function promptRename(item) {
  try {
    const { value } = await ElMessageBox.prompt("输入新的名称", "重命名", { inputValue: item.name });
    if (!value) return;
    await api.renameFile({ path: item.path, name: value });
    ElMessage.success("已重命名");
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(err.message || "重命名失败");
  }
}

async function promptMove(item) {
  try {
    const { value } = await ElMessageBox.prompt("输入目标完整路径", "移动", { inputValue: item.path });
    if (!value) return;
    await api.moveFile({ path: item.path, target: value });
    ElMessage.success("已移动");
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(err.message || "移动失败");
  }
}

async function promptCopy(item) {
  try {
    const { value } = await ElMessageBox.prompt("输入复制后的完整路径", "复制", { inputValue: item.path });
    if (!value) return;
    await api.copyFile({ path: item.path, target: value });
    ElMessage.success("已复制");
    await loadFiles();
  } catch (err) {
    if (err !== "cancel") ElMessage.error(err.message || "复制失败");
  }
}

async function share(item) {
  try {
    const data = await api.createShare({ path: item.path });
    shareUrl.value = `${location.origin}${data.share.url}`;
    shareDialog.value = true;
  } catch (err) {
    ElMessage.error(err.message || "创建分享失败");
  }
}

async function copyShareUrl() {
  await navigator.clipboard.writeText(shareUrl.value);
  ElMessage.success("分享链接已复制");
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
      ElMessage.success("文件夹已创建");
      loadFiles({ preserveSelection: true, resetScroll: false, silent: true });
    } else {
      ElMessage.warning("没有可上传的文件");
    }
  } catch (err) {
    ElMessage.error(err.message || "读取拖拽文件夹失败");
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
    uploadQueue.push({ file: item.file, task });
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
  return reactive({
    id: `${Date.now()}-${Math.random()}`,
    directory,
    fileName: name,
    name: relative,
    progress: 0,
    status: "pending"
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

function runUploadQueue() {
  while (activeUploads.value < uploadConcurrency && uploadQueue.length) {
    const next = uploadQueue.shift();
    activeUploads.value += 1;
    uploadOne(next.file, next.task).finally(() => {
      activeUploads.value -= 1;
      runUploadQueue();
    });
  }
}

async function uploadOne(file, task) {
  task.status = "uploading";
  try {
    const init = await api.initUpload({ directory: task.directory, name: task.fileName, size: file.size, chunkSize: chunkSize.value });
    const uploadId = init.task.uploadId;
    const uploaded = new Set(init.task.uploadedChunks || []);
    const totalChunks = init.task.totalChunks;
    for (let index = 0; index < totalChunks; index += 1) {
      if (!uploaded.has(index)) {
        const start = index * chunkSize.value;
        const end = Math.min(file.size, start + chunkSize.value);
        await api.uploadChunk(uploadId, index, file.slice(start, end));
      }
      task.progress = ((index + 1) / totalChunks) * 96;
    }
    await api.completeUpload({ uploadId });
    task.progress = 100;
    task.status = "done";
    scheduleUploadRefresh();
  } catch (err) {
    task.status = "error";
    ElMessage.error(err.message || "上传失败");
  }
}

function scheduleUploadRefresh() {
  clearTimeout(uploadRefreshTimer);
  uploadRefreshTimer = setTimeout(() => {
    loadFiles({ preserveSelection: true, resetScroll: false, silent: true });
  }, 160);
}

function clearFinishedTasks() {
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    if (tasks[index].status === "done" || tasks[index].status === "error") tasks.splice(index, 1);
  }
  if (!tasks.length) uploadPanelOpen.value = false;
}

function uploadStatusText(task) {
  if (task.status === "pending") return "等待中";
  if (task.status === "done") return "已完成";
  if (task.status === "error") return "失败";
  return "上传中";
}

function uploadProgressStatus(task) {
  if (task.status === "done") return "success";
  if (task.status === "error") return "exception";
  return undefined;
}
</script>
