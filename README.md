# WebDrive

WebDrive 是一个以 SMB 共享为存储后端的轻量级 Web 网盘。服务端不会另建一套文件权限：用户使用自己的 SMB 用户名和密码登录，后续浏览、上传、下载和文件管理操作都以该用户身份执行，最终权限由 SMB/NAS 决定。

## 主要功能

- SMB 账号登录，支持通过 `SMB_ROOT` 限制 WebDrive 可见的共享根目录
- 列表/网格视图、面包屑、搜索、排序、多选和响应式移动端界面
- 新建文件夹、重命名、移动、递归删除与临时分享链接
- SMB 流式下载和单段 HTTP Range 请求，适合大文件及视频拖动播放
- 图片连续浏览、视频播放、Markdown 安全渲染、Shiki 浅色代码/文本浏览、PDF 分页预览和缩放
- 文件、文件夹及拖放上传；支持分片并发、暂停、恢复、取消、失败重试、实时带宽和剩余时间估算
- 中英文界面
- Docker / Docker Compose 部署，上传临时目录可持久化

## 技术栈

- Monorepo：npm workspaces
- 前端：Vue 3、Vite、Element Plus、Lucide Vue
- 预览：PDF.js、marked、DOMPurify、highlight.js、Shiki
- 后端：Node.js 原生 HTTP Server、`@marsaud/smb2`
- 部署：Docker、Docker Compose

## 运行要求

- Node.js 20 或更高版本
- npm
- 一个从 WebDrive 运行环境可访问的 SMB 共享
- 具有共享目录访问权限的 SMB 用户账号

## 本地运行

先复制配置文件并填写真实的 SMB 地址：

```bash
cp .env.example .env
npm install
npm run build:web
npm run server
```

Windows PowerShell 可使用：

```powershell
Copy-Item .env.example .env
npm install
npm run build:web
npm run server
```

启动后访问 [http://localhost:10101](http://localhost:10101)，健康检查地址为 [http://localhost:10101/healthz](http://localhost:10101/healthz)。

### 使用 Mock 开发

不连接真实 SMB 时，可分别启动内存 Mock 服务和 Vite：

```bash
# 终端 1：默认监听 12601
npm run dev:mock

# 终端 2：默认将 /api 和 /share 代理到 12601
npm run dev:web
```

打开 Vite 输出的地址，使用任意非空用户名和密码即可登录。Mock 数据只存在于进程内，重启后会恢复初始内容。

如果要让 Vite 连接真实后端，请确保后端监听开发代理目标；默认目标是 `http://127.0.0.1:12601`，也可以在启动 Vite 前设置 `VITE_API_PROXY_TARGET`。

## 配置

主要配置位于根目录 `.env`：

```env
HOST=127.0.0.1
PORT=10101
BASE_URL=/
NODE_OPTIONS=--openssl-legacy-provider
TRUST_PROXY=false
WEB_DRIVE_UID=1000
WEB_DRIVE_GID=1000

SMB_SHARE=//nas.example.com/share
SMB_DOMAIN=WORKGROUP
SMB_ROOT=/

UPLOAD_TEMP_DIR=/data/uploads-temp
UPLOAD_CHUNK_SIZE=8388608
UPLOAD_MAX_BODY_BYTES=16777216
UPLOAD_MAX_FILE_BYTES=107374182400
UPLOAD_MAX_TEMP_BYTES=214748364800
UPLOAD_MAX_TASKS_PER_SESSION=20
UPLOAD_TASK_TTL_SECONDS=604800
HTTP_REQUEST_TIMEOUT_MS=1800000

SHARE_TOKEN_TTL_SECONDS=86400
SHARE_TOKEN_MAX_TTL_SECONDS=604800
SHARE_MAX_ACTIVE_PER_USER=100
AUTH_TOKEN_TTL_SECONDS=604800
AUTH_MAX_SESSIONS=1000
AUTH_MAX_SESSIONS_PER_USER=10
LOGIN_RATE_LIMIT_ATTEMPTS=10
LOGIN_RATE_LIMIT_WINDOW_SECONDS=300
LOGIN_RATE_LIMIT_BLOCK_SECONDS=900
AUTH_TOKEN_SECRET=
```

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | HTTP 服务监听地址；仅在容器或受控网络内改为 `0.0.0.0` |
| `PORT` | `10101` | HTTP 服务端口 |
| `BASE_URL` | `/` | 前端公开的基础路径配置；当前建议保持 `/` |
| `SMB_SHARE` | 无 | 必填，共享地址可写成 `//host/share` 或 `\\host\share` |
| `SMB_DOMAIN` | 空 | SMB 域或工作组；无域环境可留空 |
| `SMB_ROOT` | `/` | 在共享内暴露给 WebDrive 的基础目录 |
| `UPLOAD_TEMP_DIR` | `./uploads-temp` | 服务端保存上传分片及合并文件的位置 |
| `UPLOAD_CHUNK_SIZE` | `8388608` | 默认分片大小，单位为字节 |
| `UPLOAD_MAX_BODY_BYTES` | `16777216` | 单次上传请求允许的最大请求体，必须不小于分片大小 |
| `UPLOAD_MAX_FILE_BYTES` | `107374182400` | 单文件上传上限，默认 100 GiB |
| `UPLOAD_MAX_TEMP_BYTES` | `214748364800` | 整个上传临时目录允许的最大占用，默认 200 GiB |
| `UPLOAD_MAX_TASKS_PER_SESSION` | `20` | 单会话最多活跃上传任务数 |
| `UPLOAD_TASK_TTL_SECONDS` | `604800` | 临时上传目录保留时间，超时后启动时清理 |
| `HTTP_REQUEST_TIMEOUT_MS` | `1800000` | HTTP 请求超时，单位毫秒；低带宽上传建议保留足够余量 |
| `SHARE_TOKEN_TTL_SECONDS` | `86400` | 分享链接有效期，单位为秒 |
| `SHARE_TOKEN_MAX_TTL_SECONDS` | `604800` | 客户端可请求的分享链接最长有效期 |
| `SHARE_MAX_ACTIVE_PER_USER` | `100` | 单用户最多有效分享链接数 |
| `AUTH_TOKEN_TTL_SECONDS` | `604800` | 登录会话有效期，单位为秒，最小 60 秒 |
| `AUTH_TOKEN_SECRET` | 进程内随机值 | 登录 Cookie 的 HMAC 签名密钥；生产环境应设置长随机值 |
| `AUTH_COOKIE_SECURE` | 生产模式为 `true` | 是否给登录 Cookie 添加 `Secure`；生产环境必须保持开启 |
| `AUTH_MAX_SESSIONS` | `1000` | 服务进程最多保留的有效会话数 |
| `AUTH_MAX_SESSIONS_PER_USER` | `10` | 单用户名最多保留的有效会话数 |
| `TRUST_PROXY` | `false` | 是否信任反向代理传入的客户端 IP；仅对受信代理开启 |
| `WEB_DRIVE_UID` / `WEB_DRIVE_GID` | `1000` / `1000` | Docker 容器运行用户；应与 NAS 上传缓存目录的属主匹配 |
| `LOGIN_RATE_LIMIT_*` | 10 次/5 分钟，封禁 15 分钟 | 登录失败限流参数 |

生产环境可使用 `openssl rand -hex 32` 生成 `AUTH_TOKEN_SECRET`。登录会话本身仍保存在内存中，因此服务重启后用户需要重新登录。

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

Compose 默认仅将端口发布到 `127.0.0.1`，并默认启用安全 Cookie，需由同机 HTTPS 反向代理对外提供服务。若只进行回环地址上的临时 HTTP 测试，可在 `.env` 中设置 `AUTH_COOKIE_SECURE=false`；不要在对外环境中关闭。确需修改绑定地址时使用 `PUBLISH_HOST`。

上传临时目录默认映射到仓库的 `data/uploads-temp`。如需映射到 NAS 或其他磁盘，在 `.env` 中设置：

```env
UPLOAD_TEMP_HOST_DIR=/mnt/storage/webdrive-temp
```

Windows 示例：

```env
UPLOAD_TEMP_HOST_DIR=D:/nas/webdrive-temp
```

更新配置后重新执行 compose 启动命令。容器默认以非 root 用户 `1000:1000` 运行；也可通过 `WEB_DRIVE_UID` / `WEB_DRIVE_GID` 匹配 NAS 上传目录的实际属主。服务会在文件系统支持时把缓存权限收紧到 `0700/0600`；NAS ACL 或 bind mount 不允许容器执行 `chmod` 时会跳过权限修改，但仍会通过实际写入探测确认目录可用。若 SMB 服务运行在 Docker 宿主机，可在 `SMB_SHARE` 中使用 `//host.docker.internal/share`；compose 已配置对应的宿主机映射。

常用运维命令：

```bash
npm run docker:up
npm run docker:down
docker compose logs -f web-drive
```

## 上传与预览说明

- 浏览器会同时处理最多 3 个上传任务，并在所有任务之间共享最多 3 个在途分片请求。
- 瞬时网络错误、HTTP 408/425/429 和服务端 5xx 错误会对单个分片进行递增退避重试，最多尝试 3 次。
- 服务端边接收边写入分片临时文件，完整校验后才登记为可恢复分片；完成时按顺序直接串流到 SMB，不生成整文件本地副本。
- 暂停会等待正在发送的分片结束，再保留已完成分片；取消会同时清理服务端临时数据。
- 上传 ID 绑定当前登录会话、目标路径、文件名、大小和分片大小；不同登录会话不能读取、完成或取消彼此的任务。
- 上传任务和浏览器中的原始 `File` 对象不持久化；刷新页面后需要重新选择原文件才能继续。
- Markdown 内容经 DOMPurify 清理后渲染，本地相对图片和文件链接会映射到当前网盘路径。
- 常见代码、配置、日志和纯文本文件使用 Shiki 的浅色主题按需高亮；超长代码会退化为纯文本着色，避免高亮阻塞页面。
- HTML、SVG 等主动内容在预览接口中强制以纯文本返回，避免同源脚本执行。
- PDF.js 的字体、CMap、WASM 和 ICC 资源会在前端构建时复制到 `dist/pdfjs`，不要单独删除该目录。
- 视频能否播放取决于浏览器支持的容器与编码格式；扩展名可识别不代表浏览器一定具备对应解码器。

## 安全与已知限制

- 服务端会在内存中保留当前登录用户的 SMB 凭据，以便代表用户执行 SMB 操作；请只在可信网络中运行，并通过 HTTPS 反向代理对外提供服务。
- API 响应启用 CSP、`nosniff`、禁止跨站嵌入、跨站写请求拦截及敏感响应禁用缓存。
- 登录、会话、分享、上传任务、单文件大小和临时磁盘空间均有可配置上限。
- 登录会话和分享记录均为进程内状态，不支持多实例共享，服务重启后会失效。
- 分享仅支持文件。分享记录会临时保存创建者的 SMB 凭据，直到链接过期或进程退出。
- SMB 权限是最终权限边界；WebDrive 不会绕过 NAS 的访问控制。
- SMB 客户端仍需要 legacy OpenSSL provider，仓库的服务端脚本和示例环境变量已包含相应配置。
- 当前 SMB 客户端不提供 SMB3 加密能力，因此 WebDrive 到 NAS 的网络必须可信或由 VPN/隔离网络保护；替换客户端前需进行真实 NAS 兼容验证。
- 产品、架构、工程 Spec 与生产检查表统一收录在 [docs](docs/README.md)。

## 项目结构

```text
apps/web                 Vue 前端
apps/server              HTTP API、会话、上传与 SMB 适配
apps/mock                无 SMB 依赖的开发 Mock 服务
packages/shared          环境变量、HTTP 和静态资源公共工具
compose.yml              Docker Compose 配置
docs                     产品、架构、Spec 与运维文档
```
