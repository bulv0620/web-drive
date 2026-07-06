# WebDrive Agent Guide

## 项目定位

WebDrive 是一个基于 SMB 存储的 Web 网盘。应用本身不维护独立文件权限，用户通过网页登录后，服务端使用该用户的 SMB 凭据访问底层共享目录。

核心目标：

- 提供简洁的网页登录和文件浏览体验
- 复用 SMB/NAS 原有账号和目录权限
- 支持文件/文件夹浏览、上传、下载、重命名、删除、移动、复制、分享
- 支持分片上传，上传临时目录可通过 Docker volume 持久化

## 技术栈

- Monorepo: npm workspaces
- Frontend: Vue 3 + Vite + Element Plus
- Backend: Node.js HTTP server
- SMB: `smb2` npm package
- Deploy: Docker + Docker Compose

## 目录结构

- `apps/web`: 前端应用
- `apps/server`: 后端服务和 SMB 转接逻辑
- `packages/shared`: 公共工具，例如 env 加载、HTTP 工具、静态资源托管
- `deploy/docker/compose.yml`: Docker Compose 配置
- `.env.example`: 部署环境变量示例
- `README.md`: 面向使用者的部署说明

## 常用命令

```powershell
npm install
npm run build:web
npm run server
```

Docker:

```powershell
docker compose --env-file .env -f deploy/docker/compose.yml up -d --build
```

## 关键环境变量

- `PORT`: WebDrive HTTP 端口，默认 `12600`
- `SMB_SHARE`: SMB 共享地址，例如 `//172.17.0.1/share`
- `SMB_DOMAIN`: SMB 域，可为空
- `SMB_ROOT`: WebDrive 暴露的共享根路径
- `UPLOAD_TEMP_DIR`: 容器内分片临时目录
- `UPLOAD_TEMP_HOST_DIR`: 宿主机持久化临时目录
- `NODE_OPTIONS=--openssl-legacy-provider`: 当前 `smb2` 依赖老 NTLM/crypto 逻辑，在 Node 20 下需要此配置

## 重要实现点

### SMB 目录识别

`smb2` 包没有可用的 `stat` API。不要调用 `client.stat()` 判断文件类型。

当前实现位于 `apps/server/src/smb.js`，通过 `query_directory` 返回的 `FileAttributes` 判断目录：

- `0x00000010` 表示目录
- 非目录按文件处理

这修复了目录被错误显示为普通文件的问题。

### 分片上传

上传流程在 `apps/server/src/uploads.js`：

1. `/api/upload/init` 创建上传任务
2. `/api/upload/chunk` 写入分片到临时目录
3. `/api/upload/complete` 合并分片
4. 合并后写入 SMB 目标路径
5. 清理临时目录

临时目录必须可持久化映射，避免容器重启造成上传任务数据丢失。

### 分享链接

分享链接由 `apps/server/src/shares.js` 维护，目前保存在内存中。服务重启后分享链接会失效。

## 前端风格

界面风格参考 `http-tunnel`：

- 浅色背景
- 半透明卡片
- iOS 蓝主色
- Element Plus 基础组件
- 登录页和浏览页都应保持简洁，不暴露 SMB/NAS 等底层概念

当前产品文案偏普通网盘：

- 登录页副标题：`登录后访问你的个人网盘空间`
- 输入框：`用户名`、`密码`
- 浏览页标题：`我的网盘`

## 远程部署记录

当前服务器部署目标路径：

```text
/opt/web-drive
```

当前 WebDrive 端口：

```text
12600
```

远程部署时注意：

- 不要提交或写入明文 SSH 密码到仓库
- 上传包应排除 `node_modules`、`apps/web/dist`、上传临时目录
- 保留远程 `.env` 中的实际运行配置
- 重建容器后只需确认 compose 启动成功即可

## 已知限制

- `smb2` 包较老，需要 Samba 允许兼容 NTLM，并需要 Node legacy OpenSSL provider
- 分享链接存在内存里，不适合多实例或服务重启后继续使用
- 前端 bundle 目前较大，Element Plus 全量引入会触发 Vite chunk 警告，但不影响运行
