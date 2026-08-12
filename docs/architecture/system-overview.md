# ARCH-001：系统架构与信任边界

| 字段 | 值 |
| --- | --- |
| ID | ARCH-001 |
| 状态 | Accepted |
| 负责人 | Maintainers |
| 最后更新 | 2026-08-12 |

## 1. 系统上下文

```text
Browser
  │ HTTPS / HTTP
  ▼
Reverse proxy / FRP（可选，生产环境由部署方管理）
  │
  ▼
WebDrive HTTP Server
  ├── In-memory sessions / upload tasks / shares
  ├── Local upload temporary directory
  └── Per-user SMB client
          │ SMB
          ▼
      NAS / SMB Share
```

WebDrive 是 SMB 的 Web 接入层。NAS 文件系统和 SMB ACL 是最终数据及权限来源；本地磁盘仅保存未完成上传的临时分片。

## 2. 组件职责

| 组件 | 职责 | 不负责 |
| --- | --- | --- |
| `apps/web` | UI、文件选择、分片调度、预览和本地任务状态 | 持久化凭据或绕过 API 访问 SMB |
| `apps/server` | HTTP API、会话、路径约束、上传编排和 SMB 适配 | 独立文件 ACL、多实例一致性 |
| `apps/mock` | 无 SMB 环境下模拟主要 API | 证明真实 NAS 兼容性或性能 |
| `packages/shared` | 环境加载、HTTP 与静态资源公共逻辑 | 保存业务状态 |
| SMB/NAS | 文件存储、账号验证和最终权限决策 | Web UI 与浏览器协议适配 |

## 3. 信任边界

### 3.1 浏览器到 WebDrive

浏览器输入均不可信。服务端必须重新校验路径、文件名、分片索引、大小、任务归属和会话。Cookie 使用 HttpOnly 和 SameSite=Strict；生产环境通过 HTTPS 使用 Secure Cookie。

### 3.2 WebDrive 到 SMB

每个公开 SMB 操作使用当前会话凭据创建独立客户端，操作完成或流关闭后断开。WebDrive 不提升 SMB 权限。SMB 客户端当前需要 OpenSSL legacy provider，且不提供 SMB3 传输加密，因此该链路必须位于可信隔离网络或 VPN。

### 3.3 本地上传临时目录

临时目录包含用户文件内容，属于敏感数据。目录必须限制容量和权限，不能公开提供静态访问。完成或取消后清理；遗留任务按 TTL 在启动时清理。

## 4. 路径模型

- API 内统一使用以 `/` 开头的 drive path。
- `normalizeDrivePath()` 折叠分隔符、`.` 和 `..`。
- 仅 `smbPath()` 将 drive path 与 `SMB_ROOT` 合并并转为 SMB 路径。
- 根路径 `/` 不允许重命名、移动或删除。
- 文件名不得包含斜杠、反斜杠或 NUL。

路径规范的目标是不让任何用户输入逃逸到 `SMB_ROOT` 之外。

## 5. 会话与状态

会话、SMB 凭据、上传任务和分享记录都只存在当前 Node.js 进程中：

- 服务重启后登录会话和分享失效。
- 固定 `AUTH_TOKEN_SECRET` 只能保持 Cookie 签名一致，不能恢复内存会话。
- 上传分片可留在磁盘，但重启后的旧会话不能直接恢复原任务。
- 当前架构不能直接水平扩容；多实例需要外部共享状态和一致密钥管理。

## 6. 上传数据流

```text
init metadata
  → create session-bound task
  → browser acquires global chunk slot
  → PUT chunk stream
  → random .uploading file
  → validate exact byte count
  → atomic rename to {index}.part
  → validate all parts on complete
  → ordered part stream
  → one SMB write stream
  → remove local task directory
```

关键不变量：

- 页面级在途分片总数最多 3。
- 同一任务的同一分片不能同时写入两次。
- 半分片不会以 `.part` 名称出现。
- 临时空间在接收前预留，失败时释放。
- SMB 写入成功前保留本地完整分片，以便重试完成阶段。

远端最终路径目前沿用 SMB 客户端的覆盖写语义。通过远端临时文件与原子重命名避免半成品，需要真实 NAS 专项验证，见已归档的 [SPEC-001](../specs/archive/spec-001-upload-reliability.md)。

## 7. 下载与预览数据流

下载、预览和分享复用 `sendDownload()`：先获取文件大小，再解析一个 `bytes` Range，随后将 SMB read stream 直接连接到响应。响应开始后若流错误，必须销毁响应，不能追加 JSON 错误体。

预览内容由前端按类型动态加载。Markdown 必须经过 DOMPurify；HTML、SVG 等主动内容不得作为可执行页面返回。

## 8. 部署模型

- 推荐单实例 Docker Compose 部署。
- 应用端口默认仅绑定回环地址，由 HTTPS 反向代理对外服务。
- FRP 和反向代理必须允许分片请求持续超过弱网环境下的最大传输时间。
- `UPLOAD_TEMP_DIR` 使用持久化 bind mount，并由容器运行 UID/GID 写入。

具体部署参数见仓库根目录 [README](../../README.md)，安全验收见 [OPS-001](../operations/security-checklist.md)。

## 9. 变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-08-12 | 建立系统架构、信任边界和当前上传数据流基线 |
