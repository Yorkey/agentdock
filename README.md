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
| macOS | `AgentDock-1.0.0-mac-arm64.dmg` 或 `.zip` |
| Windows | `AgentDock-1.0.0-win-x64-setup.exe` |

### macOS 安装说明

当前版本**尚未做 Apple 代码签名与公证**。从浏览器下载后，macOS 会给文件打上隔离标记，首次打开可能提示 **「已损坏，无法打开」**——这是 Gatekeeper 拦截，不是包真的坏了。

**推荐做法（任选其一）：**

1. **终端移除隔离标记**（最可靠）

   将 AgentDock 拖入「应用程序」文件夹后执行：

   ```bash
   xattr -cr /Applications/AgentDock.app
   ```

   然后正常双击打开。

2. **右键打开**

   在 Finder 中右键 `AgentDock.app` →「打开」→ 在弹窗中再次点「打开」。仅需首次操作一次。

3. **系统设置放行**

   尝试打开后，前往「系统设置 → 隐私与安全性」，在底部找到 AgentDock 并点「仍要打开」。

> 彻底解决需 Apple Developer 账号做 Developer ID 签名 + 公证，详见 [docs/macos-signing.md](./docs/macos-signing.md)。

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
