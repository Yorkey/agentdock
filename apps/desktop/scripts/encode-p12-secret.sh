#!/usr/bin/env bash
# 将 .p12 转为 base64，用于 GitHub Secrets 的 CSC_LINK
# 用法: ./scripts/encode-p12-secret.sh ~/Documents/ty-apple-developer.p12
set -euo pipefail
P12="${1:?用法: $0 /path/to/cert.p12}"
base64 -i "$P12" | pbcopy
echo "✓ 已复制到剪贴板。粘贴到 GitHub → Settings → Secrets → CSC_LINK"
