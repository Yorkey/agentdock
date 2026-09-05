# Changelog

All notable changes to AgentDock are documented in this file.

## [1.1.0] - 2026-09-05

### Added

- **Skill 管理工作台**：
  - 支持列出当前所有本地 Skill，提供「按 Agent 分组」与「平铺视图（Agent 作为彩色标签）」双浏览模式
  - 支持将已有 Skill 一键复制安装到其他 Agent（含同名覆盖检测与保护）
  - 支持通过 GitHub 目录链接直接解析并安装 Skill（免全量克隆，弹窗预览 SKILL.md 文档与文件清单，多选目标 Agent）
  - 支持删除 Skill，可指定从单个或多个 Agent 中安全移除
  - 详情面板内置 SKILL.md 文档 Markdown 渲染与目录文件清单
- **本地技能导入（文件夹与 ZIP）**：
  - 支持将本地技能文件夹或 `.zip` 拖入 / 通过系统对话框导入
  - 纯 Node.js 解包：去除顶层包装目录，过滤 `__MACOSX/` / `.DS_Store`，内置 Zip Slip 防御
  - 导入前解析 Frontmatter 预览技能名、描述、作者、版本与体积
  - 支持自定义 Skill ID、多目标 Agent 安装及同名覆盖控制
- **技能本地调试与源码覆写**：
  - 应用内编辑 `SKILL.md` 及辅助脚本，修改即时覆写到对应 Agent
  - 隔离备份（`~/.agentdock/overrides`），支持还原（Revert）与固化（Commit）
  - Monaco 编辑器与 Side-by-Side / Inline Diff
- **插件化架构扩展**：
  - Cordis `SkillRegistry` 与 `SkillAgentAdapter`，内置 Claude Code / Cursor / Codex 适配器
  - 解析 Agent Skill YAML Frontmatter，并支持通用/公共目录扫描

[1.1.0]: https://github.com/Yorkey/agentdock/releases/tag/v1.1.0

## [1.0.2] - 2026-09-03

### Added

- 会话行 hover「复制引用」，生成可供 agent 粘贴的 Markdown 摘要
- 文件预览对常见源码格式做只读 Monaco 语法高亮

### Changed

- 侧栏一级来源去掉彩色圆点，改为文件夹图标着色，滚动时吸顶
- 列表 hover 工具条用不透明底盖住行尾文字
- macOS 安装包走 Developer ID 签名与公证（CI）

[1.0.2]: https://github.com/Yorkey/agentdock/releases/tag/v1.0.2

## [1.0.0] - 2026-09-01

### Added

- 首次公开发布，产品名 **AgentDock**
- 归集 Cursor / Claude Code / Codex 本地对话
- 工作区树形侧栏与会话搜索
- 对话、轨迹、计划、改动四种视图
- Markdown 渲染、代码块复制、文件预览与在 Finder 中显示
- 亮色 / 暗色 / 跟随系统主题
- macOS 与 Windows 安装包（electron-builder）

### Changed

- 自内部代号「对话归集 / chats」更名为 AgentDock
- 本地数据库文件名 `agentdock.sqlite`
- IPC 通道前缀 `agentdock:`

### Known limitations

- macOS / Windows 安装包尚未代码签名
- 无自动更新机制（后续版本计划）

[1.0.0]: https://github.com/Yorkey/agentdock/releases/tag/v1.0.0
