#!/usr/bin/env bash
# tools/mobile/setup-proxy.sh — 设置雷电(LDPlayer)模拟器代理指向宿主 Burp + 安装系统证书
#
# 用法: bash tools/mobile/setup-proxy.sh [host_ip] [burp_port]
#   默认 host_ip = 198.18.0.1  (雷电虚拟网卡，模拟器到宿主的路径)
#   默认 burp_port = 8080
#   如果 198.18.0.1 不通，改用物理网卡 IP（ipconfig 里看，或用 --host 指定）。
#
# 前置:
#   1. Burp Suite 已启动，Proxy listener 监听 0.0.0.0:8080（或至少监听模拟器可达的 IP）
#   2. 雷电模拟器已开 root（设置 → 其他设置 → Root 权限）
#   3. 模拟器已 adb 连接（tools/mobile/setup-emulator.sh 或手工）
#
# 证书:
#   从 http://<host_ip>:<burp_port>/cert 下载 Burp CA（端口默认 8080），
#   转 PEM 后装入系统信任区（Android 7.0+ 需要系统证书才能信任 Burp MITM）。

set -euo pipefail

HOST_IP="${1:-198.18.0.1}"
BURP_PORT="${2:-8080}"
PORT="${ADB_PORT:-5555}"
ADDR="127.0.0.1:${PORT}"
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADB="${TOOLS_DIR}/platform-tools/adb.exe"
TMP="$(mktemp -d)"

export MSYS2_ARG_CONV_EXCL='*'
win_path() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

step "连接模拟器 ${ADDR}"
"${ADB}" connect "${ADDR}" >/dev/null 2>&1 || true
"${ADB}" -s "${ADDR}" get-state >/dev/null 2>&1 || die "模拟器不可达，先开雷电并确保 adb 连上（tools/mobile/setup-emulator.sh）"

step "确保 root"
"${ADB}" -s "${ADDR}" root || true
sleep 2

step "测试宿主 Burp 可达 (${HOST_IP}:${BURP_PORT})"
if ! "${ADB}" -s "${ADDR}" shell "ping -c 1 -W 1 ${HOST_IP}" 2>/dev/null | grep -q "1 received"; then
  echo "  警告: ${HOST_IP} ping 不通，尝试物理网卡路径。若失败，用 bash tools/mobile/setup-proxy.sh <你的局域网IP>"
fi

step "设置系统 HTTP 代理 → ${HOST_IP}:${BURP_PORT}"
"${ADB}" -s "${ADDR}" shell "settings put global http_proxy ${HOST_IP}:${BURP_PORT}" 2>&1 | tail -1
echo "  已设置。抓完包可用: settings put global http_proxy :0  恢复无代理"

step "下载 Burp CA 证书（从宿主 loopback，Burp 默认监听 127.0.0.1）"
CERT_DER="${TMP}/burp-ca.der"
# curl is a Windows binary; MSYS2_ARG_CONV_EXCL='*' is set so the /tmp path
# must be converted explicitly to a Windows path curl can write to.
CERT_DER_WIN="$(win_path "${CERT_DER}")"
# curl -f makes HTTP>=400 fail (no partial file); -o writes the DER body.
# No -w to avoid the Windows curl write-error (exit 23) that accompanies it.
if ! curl -fs -m 10 -o "${CERT_DER_WIN}" "http://127.0.0.1:${BURP_PORT}/cert" 2>/dev/null; then
  echo "  ⚠ 未能从宿主 127.0.0.1:${BURP_PORT}/cert 下载 Burp CA。"
  echo "    手动方式：模拟器浏览器访问 http://${HOST_IP}:${BURP_PORT}/cert，下载后改后缀 .cer 安装。"
  echo "    跳过证书安装（代理已生效；无 pinning 且 App 信任 user cert 时仍可抓到部分流量）。"
  exit 0
fi
if [ ! -s "${CERT_DER}" ]; then
  echo "  ⚠ 证书文件为空，跳过安装。"
  exit 0
fi
echo "  证书已下载 ($(wc -c < "${CERT_DER}") bytes)"

step "计算证书 hash + 转 PEM"
HASH="$(openssl x509 -inform DER -in "${CERT_DER_WIN}" -subject_hash_old 2>/dev/null | head -1 || true)"
openssl x509 -inform DER -in "${CERT_DER_WIN}" -out "$(win_path "${TMP}/burp-ca.pem")" 2>/dev/null || true
if [ -z "${HASH}" ]; then
  echo "  ⚠ 无法计算证书 hash（缺 openssl）。手动安装证书。"
  exit 0
fi

step "安装证书（优先系统信任区，失败降级用户信任区）"
export MSYS2_ARG_CONV_EXCL='*'
"${ADB}" -s "${ADDR}" push "$(cygpath -w "${CERT_DER}")" /data/local/tmp/burp-ca.der >/dev/null 2>&1 || true
SYSTEM_TARGET="/system/etc/security/cacerts/${HASH}.0"
USER_TARGET="/data/misc/user/0/cacerts-added/${HASH}.0"
INSTALLED=""
"${ADB}" -s "${ADDR}" shell "mount -o remount,rw /system 2>/dev/null || true; cp /data/local/tmp/burp-ca.der ${SYSTEM_TARGET} 2>/dev/null && chmod 644 ${SYSTEM_TARGET} && echo SYSTEM_OK" | grep -q SYSTEM_OK && INSTALLED="${SYSTEM_TARGET}"
if [ -z "${INSTALLED}" ]; then
  "${ADB}" -s "${ADDR}" shell "mkdir -p /data/misc/user/0/cacerts-added && cp /data/local/tmp/burp-ca.der ${USER_TARGET} && chmod 644 ${USER_TARGET} && echo USER_OK" | grep -q USER_OK && INSTALLED="${USER_TARGET}"
fi
if [ -z "${INSTALLED}" ]; then
  echo "  ⚠ 自动安装失败（/system 只读且用户目录不可写）。手动：模拟器浏览器访问 http://${HOST_IP}:${BURP_PORT}/cert 下载 .cer 安装。"
else
  echo "  已安装证书: ${INSTALLED}"
fi

step "验证代理"
"${ADB}" -s "${ADDR}" shell "settings get global http_proxy" | grep -q "${HOST_IP}:${BURP_PORT}" && echo "  代理生效 ✓" || echo "  代理设置可能未生效，检查 Burp listener 监听地址"

printf '\n\033[1;32m✅ 完成 — 模拟器流量已指向 Burp。\033[0m\n'
printf '  现在在雷电里手动打开 App 走一遍主要功能，Burp 的 HTTP history 会抓到流量。\n'
printf '  抓完导出 HAR/Burp XML → pentest traffic import-har <ws> 进 AuAttack。\n'
