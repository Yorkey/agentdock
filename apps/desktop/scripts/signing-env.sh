# source apps/desktop/scripts/signing-env.sh
# 先运行 setup-signing-keychain.sh 创建钥匙串

export CSC_KEYCHAIN="$HOME/Library/Keychains/agentdock-signing.keychain-db"
export CSC_KEYCHAIN_PASSWORD="${AGENTDOCK_KEYCHAIN_PASS:-agentdock-kc}"
export CSC_NAME="Yam Tong (4LL4228GFV)"

# 公证
# export APPLE_ID="your@email.com"
# export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="4LL4228GFV"

unset CSC_LINK
