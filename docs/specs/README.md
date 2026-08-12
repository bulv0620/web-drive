# Engineering Specs

工程 Spec 用于记录有边界、可验收的变更。编号一经分配不复用；被替代的 Spec 保留并标记 `Superseded`。

## 活动 Spec

| ID | 标题 | 状态 | 自动验证 | 环境验证 |
| --- | --- | --- | --- | --- |
| — | 当前没有活动 Spec | — | — | — |

## 已归档 Spec

| ID | 标题 | 状态 | 结论 |
| --- | --- | --- | --- |
| [SPEC-001](archive/spec-001-upload-reliability.md) | 弱网分片上传可靠性与流式处理 | Archived | FRP 实测未再中断；吞吐仍受链路带宽限制 |

## 工作流

```text
Draft → Accepted → Implementing → Implemented → Verified
                                      ├────────→ Archived
                                      └────────→ Superseded
```

小型修复不一定需要 Spec；但满足任一条件时应创建：

- 改变用户可见行为或公开 API。
- 改变权限、路径、会话或凭据处理。
- 改变上传、下载、预览等大文件数据流。
- 新增环境变量、持久化目录或部署要求。
- 需要跨前端、后端、测试和文档协调。

新文档从 [Spec 模板](../templates/spec-template.md)复制，并在本索引登记。
