#!/usr/bin/env bash
# 仅用于本地/内网演练的自签证书，浏览器会提示不受信任。
# 生产环境必须替换为受信任 CA 签发的证书（或由 certbot / 云负载均衡托管），
# 证书与私钥不得提交到代码仓库。
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/certs"
mkdir -p "$DIR"

openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
  -keyout "$DIR/privkey.pem" \
  -out "$DIR/fullchain.pem" \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

chmod 600 "$DIR/privkey.pem"
echo "已生成自签证书：$DIR/fullchain.pem / $DIR/privkey.pem"
echo "注意：仅供本地演练，生产请替换；certs/ 目录已被 .gitignore 排除。"
