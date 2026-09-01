# packages

内部包目录。用 pnpm workspace 协议引用，例如：

```json
{
  "dependencies": {
    "@agentdock/core": "workspace:*"
  }
}
```

约定：

- 包名使用 `@agentdock/<name>`
- 每个包 `"private": true`、`"type": "module"`
- 在对应 `package.json` 写好 `exports` 后再被 `apps/desktop` 或其他包依赖

已实现：`core`、`plugin-store`、`plugin-registry`、`plugin-bridge`、`plugin-workbench`、`module-chats`、`module-skills`、`source-cursor`、`source-claude-code`、`source-codex`。
