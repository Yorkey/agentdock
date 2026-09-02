#!/usr/bin/env bash
# 创建专用签名钥匙串：导入 .p12 + G2 + Apple Root，补齐证书链。
set -euo pipefail

P12="${1:?用法: $0 /path/to/cert.p12}"
KEYCHAIN="$HOME/Library/Keychains/agentdock-signing.keychain-db"
KEYCHAIN_PASS="${AGENTDOCK_KEYCHAIN_PASS:-agentdock-kc}"
P12_PASS="${CSC_KEY_PASSWORD:?请先 export CSC_KEY_PASSWORD=你的p12密码}"
G2_URL="https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer"
ROOT_URL="https://www.apple.com/appleca/AppleIncRootCertificate.cer"
G2_TMP="$(mktemp -t g2.XXXXXX.cer)"
ROOT_TMP="$(mktemp -t root.XXXXXX.cer)"

cleanup() { rm -f "$G2_TMP" "$ROOT_TMP"; }
trap cleanup EXIT

echo "→ 下载中间证书与根证书"
curl -fsSL -o "$G2_TMP" "$G2_URL"
curl -fsSL -o "$ROOT_TMP" "$ROOT_URL"

if security list-keychains | grep -q "agentdock-signing.keychain-db"; then
  echo "→ 删除旧钥匙串"
  security delete-keychain "$KEYCHAIN" 2>/dev/null || true
fi

echo "→ 创建钥匙串: $KEYCHAIN"
security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"

echo "→ 导入 .p12"
security import "$P12" -k "$KEYCHAIN" -P "$P12_PASS" \
  -T /usr/bin/codesign -T /usr/bin/productsign -A

echo "→ 导入 G2 中间证书 + Apple Root"
security import "$G2_TMP" -k "$KEYCHAIN" -A
security import "$ROOT_TMP" -k "$KEYCHAIN" -A

echo "→ 允许 codesign 访问私钥"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASS" "$KEYCHAIN"

echo "→ 设置钥匙串搜索路径"
security list-keychains -d user -s \
  "$KEYCHAIN" \
  "$HOME/Library/Keychains/login.keychain-db" \
  /Library/Keychains/System.keychain \
  /System/Library/Keychains/SystemRootCertificates.keychain

echo ""
echo "→ 可用签名身份："
security find-identity -v -p codesigning "$KEYCHAIN"

echo ""
echo "✓ 完成。请执行："
echo "  source apps/desktop/scripts/signing-env.sh"
echo "  # 填入 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD"
echo "  pnpm dist:mac"
