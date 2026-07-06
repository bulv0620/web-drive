<template>
  <AppShell title="我的网盘" :subtitle="currentPath">
    <section class="panel file-panel" @dragenter.prevent="dragging = true" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="handleDrop">
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
      </div>

      <div class="simple-toolbar">
        <el-input v-model="query" clearable placeholder="搜索" class="search-input" :prefix-icon="Search" @keyup.enter="loadFiles" @clear="loadFiles" />
        <div class="simple-actions">
          <el-button :icon="FolderAdd" @click="folderDialog = true">新建文件夹</el-button>
          <el-button type="primary" :icon="Upload" @click="fileInput?.click()">上传</el-button>
          <el-dropdown trigger="click">
            <el-button :icon="MoreFilled" circle aria-label="更多操作" />
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="folderInput?.click()">上传文件夹</el-dropdown-item>
                <el-dropdown-item @click="loadFiles">刷新</el-dropdown-item>
                <el-dropdown-item @click="toggleView">{{ viewMode === "list" ? "网格视图" : "列表视图" }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <input ref="fileInput" type="file" multiple hidden @change="handleFileInput" />
      <input ref="folderInput" type="file" multiple hidden webkitdirectory directory @change="handleFileInput" />

      <div v-if="dragging" class="drop-hint">松开后上传到当前目录</div>

      <el-alert v-if="selectedRows.length" :title="`已选择 ${selectedRows.length} 项`" type="info" show-icon :closable="false" class="block-gap">
        <div class="toolbar" style="margin-top: 10px;">
          <el-button size="small" :icon="Download" @click="downloadSelected">下载</el-button>
          <el-button size="small" type="danger" :icon="Delete" @click="deleteSelected">删除</el-button>
        </div>
      </el-alert>

      <div v-if="tasks.length" class="inline-tasks block-gap">
        <div v-for="task in tasks" :key="task.id" class="inline-task">
          <span>{{ task.name }}</span>
          <el-progress :percentage="Math.round(task.progress)" :status="task.status === 'error' ? 'exception' : task.status === 'done' ? 'success' : undefined" />
        </div>
      </div>

      <el-table
        v-if="viewMode === 'list'"
        ref="tableRef"
        v-loading="loading"
        class="file-table"
        :data="items"
        row-key="path"
        @selection-change="selectedRows = $event"
        @row-dblclick="openItem"
      >
        <el-table-column type="selection" width="44" />
        <el-table-column label="名称" min-width="300">
          <template #default="{ row }">
            <button class="file-name" type="button" @click="openItem(row)">
              <span class="file-icon" :class="{ folder: row.type === 'folder' }">
                <el-icon><Folder v-if="row.type === 'folder'" /><Document v-else /></el-icon>
              </span>
              <span>{{ row.name }}</span>
            </button>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">{{ row.type === "folder" ? "-" : formatSize(row.size) }}</template>
        </el-table-column>
        <el-table-column label="修改时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.modifiedAt) }}</template>
        </el-table-column>
        <el-table-column label="" width="88" fixed="right">
          <template #default="{ row }">
            <el-dropdown trigger="click">
              <el-button size="small" text>操作</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openItem(row)">打开</el-dropdown-item>
                  <el-dropdown-item v-if="row.type === 'file'" @click="download(row)">下载</el-dropdown-item>
                  <el-dropdown-item v-if="canPreview(row)" @click="preview(row)">预览</el-dropdown-item>
                  <el-dropdown-item @click="promptRename(row)">重命名</el-dropdown-item>
                  <el-dropdown-item @click="promptMove(row)">移动</el-dropdown-item>
                  <el-dropdown-item v-if="row.type === 'file'" @click="promptCopy(row)">复制</el-dropdown-item>
                  <el-dropdown-item v-if="row.type === 'file'" @click="share(row)">分享</el-dropdown-item>
                  <el-dropdown-item divided @click="deleteOne(row)">删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div v-else v-loading="loading" class="file-grid">
        <div v-for="item in items" :key="item.path" class="file-card" :class="{ selected: selectedMap.has(item.path) }" @dblclick="openItem(item)" @click="toggleGridSelection(item)">
          <div class="file-card-head">
            <span class="file-icon" :class="{ folder: item.type === 'folder' }">
              <el-icon><Folder v-if="item.type === 'folder'" /><Document v-else /></el-icon>
            </span>
            <el-checkbox :model-value="selectedMap.has(item.path)" @click.stop @change="toggleGridSelection(item)" />
          </div>
          <div class="file-card-name">{{ item.name }}</div>
          <div class="file-card-meta">{{ item.type === "folder" ? "文件夹" : formatSize(item.size) }}</div>
          <div class="file-card-meta">{{ formatTime(item.modifiedAt) }}</div>
        </div>
      </div>

      <el-empty v-if="!loading && items.length === 0" description="当前目录没有文件" />
    </section>

    <el-dialog v-model="folderDialog" title="新建文件夹">
      <el-form label-position="top" @submit.prevent="createFolder">
        <el-form-item label="文件夹名称">
          <el-input v-model="folderName" autofocus />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderDialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="createFolder">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="shareDialog" title="分享链接">
      <div class="share-box">
        <el-input v-model="shareUrl" readonly />
        <el-button type="primary" @click="copyShareUrl">复制链接</el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="previewDialog" :title="previewItem?.name || '预览'" width="min(900px, calc(100vw - 32px))">
      <img v-if="previewUrl" class="preview-image" :src="previewUrl" :alt="previewItem?.name || 'preview'" />
    </el-dialog>
  </AppShell>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  ArrowLeft,
  Delete,
  Document,
  Download,
  Folder,
  FolderAdd,
  MoreFilled,
  Search,
  Upload
} from "@element-plus/icons-vue";
import { api } from "../api/client.js";
import { state } from "../store.js";
import AppShell from "./AppShell.vue";

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
const folderDialog = ref(false);
const folderName = ref("");
const saving = ref(false);
const shareDialog = ref(false);
const shareUrl = ref("");
const previewDialog = ref(false);
const previewItem = ref(null);
const previewUrl = ref("");
const chunkSize = computed(() => Number(state.config.uploadChunkSize || 8 * 1024 * 1024));

const breadcrumbParts = computed(() => {
  const parts = currentPath.value.split("/").filter(Boolean);
  return parts.map((name, index) => ({ name, path: `/${parts.slice(0, index + 1).join("/")}` }));
});
const selectedMap = computed(() => new Map(selectedRows.value.map((item) => [item.path, item])));

watch(viewMode, (value) => localStorage.setItem("web-drive-view", value));
watch(query, () => {
  clearTimeout(watch.timer);
  watch.timer = setTimeout(loadFiles, 250);
});

onMounted(loadFiles);

async function loadFiles() {
  loading.value = true;
  try {
    const data = await api.files({ path: currentPath.value, q: query.value, sort: sort.value, order: order.value });
    currentPath.value = data.path;
    items.value = data.items;
    state.config = data.config || state.config;
    selectedRows.value = [];
    tableRef.value?.clearSelection?.();
  } catch (err) {
    ElMessage.error(err.message || "读取目录失败");
  } finally {
    loading.value = false;
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

function canPreview(item) {
  return item.type === "file" && /^image\//.test(item.mime || "");
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
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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

async function createFolder() {
  if (!folderName.value.trim()) return;
  saving.value = true;
  try {
    await api.createFolder({ parent: currentPath.value, name: folderName.value.trim() });
    folderDialog.value = false;
    folderName.value = "";
    ElMessage.success("文件夹已创建");
    await loadFiles();
  } catch (err) {
    ElMessage.error(err.message || "创建失败");
  } finally {
    saving.value = false;
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

function handleDrop(event) {
  dragging.value = false;
  uploadFiles([...(event.dataTransfer?.files || [])]);
}

function handleFileInput(event) {
  const picked = [...(event.target.files || [])];
  event.target.value = "";
  uploadFiles(picked);
}

async function uploadFiles(files) {
  for (const file of files) await uploadOne(file);
  await loadFiles();
}

async function uploadOne(file) {
  const relative = file.webkitRelativePath || file.name;
  const parts = relative.split("/").filter(Boolean);
  const name = parts.pop() || file.name;
  const directory = parts.length ? `${currentPath.value.replace(/\/$/, "")}/${parts.join("/")}` : currentPath.value;
  const task = reactive({ id: `${Date.now()}-${Math.random()}`, name: relative, progress: 0, status: "uploading" });
  tasks.unshift(task);
  try {
    const init = await api.initUpload({ directory, name, size: file.size, chunkSize: chunkSize.value });
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
    setTimeout(() => {
      const index = tasks.findIndex((item) => item.id === task.id);
      if (index !== -1) tasks.splice(index, 1);
    }, 1800);
  } catch (err) {
    task.status = "error";
    ElMessage.error(err.message || "上传失败");
  }
}
</script>
