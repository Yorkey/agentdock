# Changelog

All notable changes to AgentDock are documented in this file.

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
