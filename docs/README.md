# WebDrive Documentation

本目录是 WebDrive 的产品、架构、变更规格与运维要求的唯一文档入口。面向使用者的安装说明仍放在仓库根目录的 [README](../README.md)，面向代码代理的约束仍放在 [AGENTS.md](../AGENTS.md)。

## 文档地图

| 类型 | 文档 | 状态 | 用途 |
| --- | --- | --- | --- |
| Product | [PRD-001 产品需求基线](product/requirements.md) | Living | 定义产品目标、当前能力和规划边界 |
| Architecture | [ARCH-001 系统架构](architecture/system-overview.md) | Accepted | 定义信任边界、组件职责和关键数据流 |
| Spec | [SPEC 索引](specs/README.md) | Active | 跟踪有明确范围、方案和验收条件的工程变更 |
| Operations | [OPS-001 安全与生产检查表](operations/security-checklist.md) | Active | 部署前检查和真实环境专项验证 |
| Template | [Spec 模板](templates/spec-template.md) | Template | 创建新工程 spec 时复制使用 |

## 文档类型

- **PRD**：描述用户问题、产品边界和能力状态，不记录具体实现步骤。
- **ARCH**：描述长期有效的系统结构、信任边界、约束和关键数据流。
- **SPEC**：描述一次可交付的工程变更，必须包含范围、设计、验收与发布计划。
- **OPS**：描述部署、运行、监控及真实环境验证要求。

## 状态约定

| 状态 | 含义 |
| --- | --- |
| Draft | 正在讨论，不能作为实现依据 |
| Accepted | 方案已经接受，可以实施 |
| Implementing | 正在实施，验收尚未完成 |
| Implemented | 代码已完成并通过仓库内自动验证 |
| Verified | 已通过目标部署环境或真实 SMB/NAS 验证 |
| Archived | 交付已结束并转为历史记录；未完成的环境验证继续由 OPS 检查表跟踪 |
| Superseded | 已被另一份文档替代，必须链接替代文档 |
| Living / Active | 持续维护的基线或检查表，不以一次性交付结束 |

`Implemented` 不等于 `Verified`。涉及 FRP、反向代理、NAS 固件或真实 SMB 行为的结论，只有完成目标环境验证后才能标记为 `Verified`。

## 编号与命名

- 文件夹和文件名使用小写英文及连字符，方便跨平台链接和自动化处理。
- Spec 使用连续编号：`SPEC-001`、`SPEC-002`。
- Product、Architecture 和 Operations 文档分别使用 `PRD-*`、`ARCH-*`、`OPS-*` 标识。
- 文档标题、正文和用户文案使用简体中文；代码标识、路径和协议名称保留英文。

## 维护规则

1. 新功能或显著行为变更先从 [Spec 模板](templates/spec-template.md)创建文档，再进入实现。
2. Spec 必须写明非目标，避免实施范围隐式扩大。
3. 每条验收标准必须能映射到自动测试或明确的人工验证步骤。
4. 用户可见行为变化同步更新 PRD；边界或数据流变化同步更新 ARCH；部署要求变化同步更新 OPS 和根 README。
5. 完成实现时更新状态和变更记录，不删除仍有历史价值的决策背景。
6. 文档内使用相对链接；提交前检查链接、`npm test` 和相关构建命令。
