# AgentDock

只读归集 Cursor、Claude Code、Codex 本地对话的桌面应用。

## 功能

- 扫描并索引本地 AI 工具对话记录
- 按工作区 / 来源浏览会话
- 对话、轨迹、计划、改动多视图
- Markdown 渲染、代码复制、文件预览
- 亮色 / 暗色 / 跟随系统主题

## 系统要求

- **macOS**：Apple Silicon 或 Intel（macOS 12+）
- **Windows**：x64（Windows 10+）

## 安装

从 [Releases](https://github.com/Yorkey/agentdock/releases) 下载对应平台的安装包：

| 平台 | 文件 |
| --- | --- |
| macOS | `AgentDock-1.0.2-mac-arm64.dmg` 或 `.zip` |
| Windows | `AgentDock-1.0.2-win-x64-setup.exe` |

### macOS 安装说明

v1.0.2 起，GitHub Release 上的 macOS 包由 CI 做 Developer ID 签名与公证。若仍被 Gatekeeper 拦截，可右键「打开」，或执行：

```bash
xattr -cr /Applications/AgentDock.app
```

## 开发

```bash
pnpm install
pnpm dev          # 启动开发模式
pnpm typecheck    # 类型检查
pnpm verify       # 运行验证脚本
pnpm dist:mac     # 打包 macOS
pnpm dist:win     # 打包 Windows
```

要求 Node.js ≥ 24.15、pnpm ≥ 10.12。

## 数据来源与隐私

AgentDock **只读取本机** AI 工具的对话文件，数据存储在应用数据目录的 `agentdock.sqlite` 中，**不上传、不联网**。

读取的典型路径包括：

- Cursor：`~/.cursor/...`
- Claude Code：`~/.claude/...`
- Codex：各工具配置的本地会话目录

## 许可证

MIT — 见 [LICENSE](./LICENSE)
