# macOS 代码签名与公证

AgentDock 使用 `electron-builder` 做 **Developer ID 签名** + **Apple 公证（Notarization）**。配置已写在 `apps/desktop/electron-builder.yml`。

公证通过后，用户从 GitHub 下载的 `.dmg` / `.zip` 可直接双击安装，不再出现「已损坏，无法打开」。

---

## 一、前置准备（一次性）

### 1. 创建 Developer ID Application 证书

1. 打开 [Apple Developer → Certificates](https://developer.apple.com/account/resources/certificates/list)
2. 点 **+** → 选择 **Developer ID Application**
3. 按提示在 Mac 上生成 CSR（可用「钥匙串访问 → 证书助理 → 从证书颁发机构请求证书」）
4. 下载并双击安装证书到**登录**钥匙串

验证：

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

应看到类似：

```text
1) ABCD1234... "Developer ID Application: Your Name (TEAMID)"
```

### 2. 获取 Team ID

在 [Membership Details](https://developer.apple.com/account#MembershipDetailsCard) 查看 **Team ID**（10 位字母数字）。

### 3. 创建 App 专用密码（用于公证）

1. 打开 [appleid.apple.com](https://appleid.apple.com) → 登录与安全
2. **App 专用密码** → 生成新密码（例如命名 `AgentDock Notarize`）
3. 保存生成的密码（只显示一次）

> 推荐长期方案：在 Developer 后台创建 **App Store Connect API Key**（`.p8`），更适合 CI，见文末「方式 B」。

---

## 二、本地打包（方式 A：Apple ID + 专用密码）

在项目根目录，**先设置环境变量再打包**（不要把密码写进仓库）：

```bash
# 签名：从钥匙串自动选取 Developer ID Application（多证书时可指定 CSC_NAME）
export CSC_NAME="Your Name (TEAMID)"

# 公证
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID"
```

然后：

```bash
pnpm dist:mac
```

成功时终端会出现 `notarization successful` 或类似日志。产物在 `apps/desktop/release/`。

### 验证

```bash
APP="apps/desktop/release/mac-arm64/AgentDock.app"

# 签名
codesign -dv --verbose=4 "$APP" 2>&1 | grep Authority

# Gatekeeper
spctl -a -vv "$APP"

# 公证票据（应显示 accepted）
xcrun stapler validate "$APP"
```

---

## 三、方式 B：API Key（推荐 CI / 更安全）

在 [App Store Connect → Users and Access → Keys](https://appstoreconnect.apple.com/access/api) 创建 API Key，下载 `.p8` 文件。

```bash
export CSC_NAME="Your Name (TEAMID)"

export APPLE_API_KEY=/path/to/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

pnpm dist:mac
```

---

## 四、方式 C：导出 .p12 证书（CI 常用）

若 CI 无法访问本机钥匙串，可导出证书：

1. 钥匙串访问 → 找到 **Developer ID Application** → 右键导出为 `.p12`
2. 设置：

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD="p12-password"

export APPLE_ID="..."
export APPLE_APP_SPECIFIC_PASSWORD="..."
export APPLE_TEAM_ID="..."

pnpm dist:mac
```

`CSC_LINK` 也可设为 base64 字符串（GitHub Actions secret 常用）。

---

## 五、发布新版本

```bash
# 1. bump 版本号（apps/desktop/package.json + 根 package.json）
# 2. 打包
pnpm dist:mac

# 3. 提交并打 tag
git add -A && git commit -m "release: AgentDock v1.0.1"
git tag v1.0.1
git push origin main --tags
git push github main --tags

# 4. 创建 GitHub Release
gh release create v1.0.1 --repo Yorkey/agentdock \
  --title "AgentDock v1.0.1" \
  --notes-file CHANGELOG.md \
  apps/desktop/release/AgentDock-1.0.1-mac-arm64.dmg \
  apps/desktop/release/AgentDock-1.0.1-mac-arm64.zip
```

---

## 六、常见问题

| 现象 | 处理 |
| --- | --- |
| `no identity found` | 证书未安装到登录钥匙串，或 `CSC_NAME` 写错 |
| `notarization failed` | 检查 Team ID、专用密码；在 [App Store Connect → Activity](https://appstoreconnect.apple.com/) 查看详细拒绝原因 |
| 本地想跳过签名快速打包 | 临时在 `electron-builder.yml` 的 `mac` 下加 `identity: null` 并设 `notarize: false` |
| 用户仍提示损坏 | 确认 Release 上传的是**公证后**新打的包，不是旧版 |

---

## 七、安全提醒

- **不要**把 `.p12`、专用密码、API Key 提交到 git
- 可用 `apps/desktop/.env.signing` 存本地变量（已 gitignore），打包前 `source` 加载
- GitHub Actions 用 Repository Secrets 存放 `CSC_LINK`、`APPLE_*` 等
