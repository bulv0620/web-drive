# WebDrive Agent Guide

## 项目定位

WebDrive 是一个基于 SMB 共享的 Web 网盘。服务端不维护独立文件权限；用户登录后，所有文件操作都使用该用户的 SMB 凭据执行，SMB/NAS 权限是最终访问边界。

修改代码时优先保证以下行为：

- 路径始终限制在 `SMB_ROOT` 下，不能通过用户输入逃逸到共享根目录之外
- 文件传输保持流式，避免将大文件整体读入 Node.js 内存
- 登录用户之间的会话、上传任务和 SMB 凭据不能串用
- 桌面端、移动端及中英文界面保持一致
- 不破坏无真实 SMB 环境下的 Mock 开发流程

## 技术栈

- Monorepo：npm workspaces，Node.js 20+
- Frontend：Vue 3、Vite、Vue Router、Element Plus、Lucide Vue
- Preview：PDF.js、marked、DOMPurify、highlight.js、Shiki
- Backend：Node.js 原生 HTTP Server
- SMB：`@marsaud/smb2`
- Deploy：Docker、Docker Compose

## 目录结构

- `apps/web`：前端应用
  - `src/views/FilesView.vue`：文件浏览和上传任务的主界面
  - `src/components/FilePreviewOverlay.vue`：统一预览层
  - `src/components/{Image,Video,Audio,Markdown,Code,Pdf}Preview.vue`：各类型预览器
  - `src/components/FileIcon.vue`、`src/utils/file-icons.js`：文件类型与图标
  - `src/i18n.js`：中英文文案和 Element Plus locale
  - `vite.config.js`：开发代理及 PDF.js 静态资源复制
- `apps/server`：HTTP API、会话、分享、上传和 SMB 适配
- `apps/mock`：内存文件系统 Mock，默认端口 `12601`
- `packages/shared`：env 加载、HTTP 工具和静态资源托管
- `deploy/docker/compose.yml`：Docker Compose 配置
- `.env.example`：部署配置模板
- `README.md`：面向使用者的运行和部署文档

## 常用命令

```bash
npm install
npm run build:web
npm run server
```

前端开发建议使用两个终端：

```bash
npm run dev:mock
npm run dev:web
```

Vite 默认把 `/api` 和 `/share` 代理到 `http://127.0.0.1:12601`。连接真实后端时，通过 `VITE_API_PROXY_TARGET` 修改目标，或让服务端监听 `12601`。

Docker：

```bash
docker compose --env-file .env -f deploy/docker/compose.yml up -d --build
```

仓库包含服务端安全回归测试。提交前至少执行：

```bash
npm test
npm run build:web
```

涉及 API 或交互时，再用 Mock 启动前后端，检查登录、列表、预览和相关操作。不要把真实 SMB 凭据写入测试、日志或仓库。

## 配置约定

- `PORT`：HTTP 端口，默认 `12600`
- `SMB_SHARE`：SMB 共享地址，例如 `//192.168.1.10/Public`
- `SMB_DOMAIN`：SMB 域或工作组，可为空
- `SMB_ROOT`：WebDrive 暴露的共享内根路径
- `UPLOAD_TEMP_DIR`：分片和合并文件的临时目录
- `UPLOAD_CHUNK_SIZE`：默认分片大小
- `UPLOAD_MAX_BODY_BYTES`：单次上传请求上限，不能小于分片大小
- `UPLOAD_MAX_FILE_BYTES`、`UPLOAD_MAX_TEMP_BYTES`：单文件和临时目录容量上限
- `UPLOAD_MAX_TASKS_PER_SESSION`、`UPLOAD_TASK_TTL_SECONDS`：上传任务数量和保留期限
- `AUTH_TOKEN_TTL_SECONDS`：登录会话有效期
- `AUTH_TOKEN_SECRET`：登录 Cookie 的 HMAC 签名密钥，生产环境必须提供长随机值
- `AUTH_COOKIE_SECURE`、`AUTH_MAX_SESSIONS*`：Cookie 与会话安全限制
- `TRUST_PROXY`、`LOGIN_RATE_LIMIT_*`：可信代理和登录失败限流
- `SHARE_TOKEN_TTL_SECONDS`、`SHARE_TOKEN_MAX_TTL_SECONDS`、`SHARE_MAX_ACTIVE_PER_USER`：分享有效期和数量限制

`.env` 与 `.env.server` 由 `packages/shared/src/env-file.js` 向上查找加载，已经存在的进程环境变量优先。不要提交包含真实地址、账号、密码或密钥的 `.env`。

服务端启动脚本已带 `--openssl-legacy-provider`。这是当前 SMB 客户端兼容要求，不要只从 `.env.example` 删除该约定而不验证真实 SMB 登录和传输。

## 路径与 SMB 实现

路径规则集中在 `apps/server/src/path-utils.js`：

- API 内统一使用以 `/` 开头的 drive path
- `normalizeDrivePath()` 负责折叠分隔符、`.` 和 `..`
- `smbPath()` 才把 drive path 与 `SMB_ROOT` 合并并转换为反斜杠 SMB 路径
- 根路径 `/` 不允许重命名、移动或删除

SMB 适配集中在 `apps/server/src/smb.js`。当前使用 `@marsaud/smb2` 的 Promise API：

- `readdir(path, { stats: true })` 同时获取目录项和元数据
- `stat()` / `stats.isDirectory()` 判断类型
- 每个公开操作创建独立客户端，并在普通操作结束或流关闭后断开
- 文件下载和上传落盘使用 Node.js stream + `pipeline()`
- 文件夹删除为递归操作

不要恢复旧 `smb2` 包、私有 `smb2-forge` 请求或手工解析 `FileAttributes`，除非新方案已经通过真实 SMB 兼容性验证。

### 下载与 Range

`apps/server/src/index.js` 中的 `sendDownload()` 同时服务下载、预览和分享：

- 先用 `statPath()` 确认目标是文件并获得大小
- 支持一个 `bytes` Range，包括起止、开放结尾和 suffix range
- 非法或越界 Range 返回 `416` 和 `Content-Range: bytes */size`
- Range 返回 `206`，普通下载返回 `200`
- 响应已开始后发生流错误时必须销毁响应，不能再写 JSON 错误体

修改这里时要覆盖空文件、首尾字节、开放区间、suffix、越界请求和客户端提前断开。

## 分片上传

后端流程位于 `apps/server/src/uploads.js`：

1. `POST /api/upload/init` 创建或恢复任务
2. `PUT /api/upload/chunk` 写入 `${index}.part`
3. `POST /api/upload/complete` 按顺序合并并校验总大小
4. 通过 SMB write stream 写入目标路径
5. 成功或取消后清理临时目录

上传 ID 由当前会话、目录、文件名、文件大小和分片大小确定。任务 Map 在内存中，同一会话重新 init 相同元数据会重新登记任务并发现持久化的已有分片；服务重启后旧会话失效，遗留分片按 `UPLOAD_TASK_TTL_SECONDS` 清理。因此 `UPLOAD_TEMP_DIR` 的 Docker volume 不能随意移除。

前端队列位于 `FilesView.vue`：

- 最多同时运行 3 个文件任务，每个文件最多并发 3 个分片
- 任务状态包括 `pending`、`uploading`、`pausing`、`paused`、`done`、`error`、`canceled`
- 暂停不强制中断已在途分片；取消会 Abort 请求并调用服务端清理
- 原始浏览器 `File` 对象只在内存 Map 中，刷新页面后需要用户重新选择文件

调整上传状态机时，必须避免同一任务重复入队、重复占用并发槽或在取消后被完成回调改回成功状态。

## 文件预览

预览类型由 `FilesView.vue` 的 `previewKindFor()` 决定，目前只开放：

- 图片：全屏适配、加载/错误状态、同目录前后切换
- 视频：浏览器原生播放器，依赖服务端 Range 和浏览器编解码支持
- 音频：浏览器原生播放器，提供加载、错误及重试状态，同样依赖服务端 Range 和浏览器编解码支持
- Markdown：异步加载解析器、DOMPurify 清理、代码高亮、相对资源路径重写
- 代码/文本：按需加载 Shiki，使用浅色主题和带行号的纸张式浏览区域
- PDF：按需加载组件，PDF.js 分页渲染、可见页懒渲染、缩放和适宽

PDF.js 的 `cmaps`、`standard_fonts`、`wasm`、`iccs` 由 `apps/web/vite.config.js` 在构建时复制到 `dist/pdfjs`。增加或升级 PDF.js 时，同时验证开发中间件、构建产物和 `packages/shared/src/static-web.js` 的 MIME 类型。

Markdown 必须继续在写入 `v-html` 前执行 DOMPurify；不要允许 `script`、`iframe`、表单或其他可执行内容。外部链接需以 `noopener,noreferrer` 打开。

## 前端约定

- 文件类型识别和图标逻辑只维护在 `src/utils/file-icons.js`，视图与上传列表复用 `FileIcon.vue`
- 用户可见文案放入 `src/i18n.js`，新增 key 时同步补齐英文和简体中文
- 日期格式跟随当前 locale；不要在组件中硬编码语言
- 保持键盘操作、焦点、ARIA label、`prefers-reduced-motion` 和移动端布局
- 大型预览依赖使用动态 import，避免无条件增加首屏 bundle
- 延续现有 CSS 变量、间距和卡片视觉，不在局部组件引入另一套设计 token

## 会话、分享与安全限制

- `apps/server/src/session.js` 使用 HttpOnly、SameSite=Strict、HMAC 签名 Cookie；生产模式启用 Secure
- 会话 Map 和 SMB 凭据只在进程内；即使固定 `AUTH_TOKEN_SECRET`，服务重启后仍需重新登录
- `apps/server/src/shares.js` 的分享记录也在内存中，且包含创建者 SMB 凭据
- 分享只允许文件，创建前必须通过 `statPath()` 验证
- 当前架构不适合直接水平扩容；多实例需要外部会话/分享存储和一致的密钥管理
- 对外部署应置于 HTTPS 反向代理之后，并限制日志中的请求体、Cookie 和凭据信息

## 文档同步清单

以下变化需要同时更新 `README.md`、`.env.example` 或本文件：

- 新增/删除环境变量、端口、脚本或部署目录
- 新增用户可见功能、预览格式或上传行为
- 调整 SMB 兼容要求、持久化策略、会话或分享生命周期
- 修改 Docker volume、健康检查或生产启动方式
