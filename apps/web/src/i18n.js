import { computed, ref, watch } from "vue";
import en from "element-plus/es/locale/lang/en";
import zhCn from "element-plus/es/locale/lang/zh-cn";

const STORAGE_KEY = "web-drive-locale";
const DEFAULT_LOCALE = "en";

const messages = {
  en: {
    "app.title": "My Drive",
    "app.user": "User",
    "app.language": "Language",
    "app.english": "English",
    "app.chinese": "Chinese",
    "login.subtitle": "Sign in to access your cloud drive",
    "login.username": "Username",
    "login.password": "Password",
    "login.signIn": "Sign in",
    "login.error": "Sign-in failed",
    "files.back": "Back to parent folder",
    "files.allFiles": "All files",
    "files.newFolder": "New folder",
    "files.upload": "Upload",
    "files.moreActions": "More actions",
    "files.uploadFolder": "Upload folder",
    "files.refresh": "Refresh",
    "files.gridView": "Grid view",
    "files.listView": "List view",
    "files.accountMenu": "{name} menu",
    "files.logout": "Log out",
    "files.search": "Search",
    "files.selectionCount": "Selected {count} item(s)",
    "files.download": "Download",
    "files.delete": "Delete",
    "files.empty": "This folder is empty",
    "files.dropToUpload": "Drop to upload",
    "files.uploadTasks": "Upload tasks",
    "files.clearFinished": "Clear finished",
    "files.shareDialogTitle": "Share link",
    "files.copyLink": "Copy link",
    "files.preview": "Preview",
    "files.open": "Open",
    "files.rename": "Rename",
    "files.move": "Move",
    "files.copy": "Copy",
    "files.share": "Share",
    "files.actions": "Actions",
    "files.rowActions": "{name} actions",
    "files.name": "Name",
    "files.size": "Size",
    "files.modifiedAt": "Modified",
    "files.folder": "Folder",
    "files.noTasks": "No tasks",
    "files.uploadActive": "{count} active",
    "files.uploadDone": "{count} completed",
    "files.uploadError": "{count} failed",
    "files.readFailed": "Failed to load folder",
    "files.logoutFailed": "Failed to log out",
    "files.createFolderPrompt": "Enter folder name",
    "files.createFolderTitle": "New folder",
    "files.folderNameRequired": "Folder name is required",
    "files.folderCreated": "Folder created",
    "files.createFailed": "Failed to create",
    "files.deleteConfirm": "Delete {count} item(s)?",
    "files.deleteConfirmTitle": "Confirm delete",
    "files.deleted": "Deleted",
    "files.deleteFailed": "Failed to delete",
    "files.renamePrompt": "Enter a new name",
    "files.renameTitle": "Rename",
    "files.renamed": "Renamed",
    "files.renameFailed": "Failed to rename",
    "files.movePrompt": "Enter the full target path",
    "files.moveTitle": "Move",
    "files.moved": "Moved",
    "files.moveFailed": "Failed to move",
    "files.copyPrompt": "Enter the full copy target path",
    "files.copyTitle": "Copy",
    "files.copied": "Copied",
    "files.copyFailed": "Failed to copy",
    "files.shareFailed": "Failed to create share",
    "files.linkCopied": "Share link copied",
    "files.noUploadFiles": "No uploadable files found",
    "files.dropReadFailed": "Failed to read dropped folder",
    "files.uploadFailed": "Upload failed",
    "upload.pending": "Waiting",
    "upload.done": "Completed",
    "upload.error": "Failed",
    "upload.uploading": "Uploading"
  },
  "zh-CN": {
    "app.title": "我的网盘",
    "app.user": "用户",
    "app.language": "语言",
    "app.english": "英语",
    "app.chinese": "中文",
    "login.subtitle": "登录后访问你的个人网盘空间",
    "login.username": "用户名",
    "login.password": "密码",
    "login.signIn": "登录",
    "login.error": "登录失败",
    "files.back": "返回上级",
    "files.allFiles": "全部文件",
    "files.newFolder": "新建文件夹",
    "files.upload": "上传",
    "files.moreActions": "更多操作",
    "files.uploadFolder": "上传文件夹",
    "files.refresh": "刷新",
    "files.gridView": "网格视图",
    "files.listView": "列表视图",
    "files.accountMenu": "{name} 菜单",
    "files.logout": "退出登录",
    "files.search": "搜索",
    "files.selectionCount": "已选择 {count} 项",
    "files.download": "下载",
    "files.delete": "删除",
    "files.empty": "当前目录为空",
    "files.dropToUpload": "释放上传",
    "files.uploadTasks": "上传任务",
    "files.clearFinished": "清理完成",
    "files.shareDialogTitle": "分享链接",
    "files.copyLink": "复制链接",
    "files.preview": "预览",
    "files.open": "打开",
    "files.rename": "重命名",
    "files.move": "移动",
    "files.copy": "复制",
    "files.share": "分享",
    "files.actions": "操作",
    "files.rowActions": "{name} 操作",
    "files.name": "名称",
    "files.size": "大小",
    "files.modifiedAt": "修改时间",
    "files.folder": "文件夹",
    "files.noTasks": "暂无任务",
    "files.uploadActive": "{count} 个进行中",
    "files.uploadDone": "{count} 个完成",
    "files.uploadError": "{count} 个失败",
    "files.readFailed": "读取目录失败",
    "files.logoutFailed": "退出失败",
    "files.createFolderPrompt": "输入文件夹名称",
    "files.createFolderTitle": "新建文件夹",
    "files.folderNameRequired": "文件夹名称不能为空",
    "files.folderCreated": "文件夹已创建",
    "files.createFailed": "创建失败",
    "files.deleteConfirm": "确认删除 {count} 项？",
    "files.deleteConfirmTitle": "删除确认",
    "files.deleted": "已删除",
    "files.deleteFailed": "删除失败",
    "files.renamePrompt": "输入新的名称",
    "files.renameTitle": "重命名",
    "files.renamed": "已重命名",
    "files.renameFailed": "重命名失败",
    "files.movePrompt": "输入目标完整路径",
    "files.moveTitle": "移动",
    "files.moved": "已移动",
    "files.moveFailed": "移动失败",
    "files.copyPrompt": "输入复制后的完整路径",
    "files.copyTitle": "复制",
    "files.copied": "已复制",
    "files.copyFailed": "复制失败",
    "files.shareFailed": "创建分享失败",
    "files.linkCopied": "分享链接已复制",
    "files.noUploadFiles": "没有可上传的文件",
    "files.dropReadFailed": "读取拖拽文件夹失败",
    "files.uploadFailed": "上传失败",
    "upload.pending": "等待中",
    "upload.done": "已完成",
    "upload.error": "失败",
    "upload.uploading": "上传中"
  }
};

function initialLocale() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved && messages[saved] ? saved : DEFAULT_LOCALE;
}

export const locale = ref(initialLocale());
export const elementLocale = computed(() => (locale.value === "zh-CN" ? zhCn : en));
export const dateLocale = computed(() => (locale.value === "zh-CN" ? "zh-CN" : "en-US"));
export const localeToggleLabel = computed(() => (locale.value === "zh-CN" ? "English" : "中文"));

export function setLocale(value) {
  locale.value = messages[value] ? value : DEFAULT_LOCALE;
}

export function toggleLocale() {
  setLocale(locale.value === "zh-CN" ? "en" : "zh-CN");
}

export function t(key, params = {}) {
  const template = messages[locale.value]?.[key] || messages[DEFAULT_LOCALE][key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export function uiError(err, key) {
  if (locale.value === DEFAULT_LOCALE) return t(key);
  return err?.message || t(key);
}

watch(
  locale,
  (value) => {
    const nextLocale = messages[value] ? value : DEFAULT_LOCALE;
    if (nextLocale !== value) {
      locale.value = nextLocale;
      return;
    }
    localStorage.setItem(STORAGE_KEY, nextLocale);
    document.documentElement.lang = nextLocale;
    document.title = "WebDrive";
  },
  { immediate: true }
);
