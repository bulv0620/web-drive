# WebDrive

WebDrive 是一个基于 SMB 的轻量级 Web 网盘。应用本身不存储业务文件，登录、浏览、上传、下载和管理操作都会使用当前用户的 SMB 身份执行，目录权限由原 SMB/NAS 系统负责。

## 功能

- SMB 用户名/密码登录
- 文件列表与网格视图、面包屑、搜索、排序、多选
- 新建文件夹、删除、重命名、移动、复制
- 单文件下载、Range 下载、图片预览
- 多文件/文件夹上传、分片上传、断点续传
- 临时下载分享链接
- Docker 部署，上传分片临时目录可映射到持久化磁盘

## 本地运行

```powershell
Copy-Item .env.example .env
npm install
npm run build:web
npm run server
```

然后打开 `http://localhost:12600`。

开发前端时可以单独运行：

```powershell
npm run dev:web
```

## 环境变量

主要配置放在 `.env`：

```env
HOST=0.0.0.0
PORT=12600
BASE_URL=/
SMB_SHARE=//nas.example.com/share
SMB_DOMAIN=WORKGROUP
SMB_ROOT=/
UPLOAD_TEMP_DIR=/data/uploads-temp
UPLOAD_CHUNK_SIZE=8388608
UPLOAD_MAX_BODY_BYTES=16777216
SHARE_TOKEN_TTL_SECONDS=86400
```

`SMB_SHARE` 可写成 `//host/share` 或 `\\host\share`。`SMB_ROOT` 是 WebDrive 暴露给用户的 SMB 基础路径，用户仍然只能看到 SMB 权限允许访问的内容。

## Docker 部署

```powershell
Copy-Item .env.example .env
docker compose --env-file .env -f deploy/docker/compose.yml up -d --build
```

分片上传临时目录默认映射到 `./data/uploads-temp`。如果要映射到 NAS 或其他磁盘位置：

```env
UPLOAD_TEMP_HOST_DIR=D:/nas/webdrive-temp
```

然后重新启动 compose。

## 说明

分享链接是特殊场景：生成链接时会在服务端内存里保存短期 token 和创建者的 SMB 会话凭据，用于未登录下载。服务重启后分享链接会失效。
