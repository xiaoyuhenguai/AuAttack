#!/usr/bin/env bash
# tools/mobile/setup-emulator.sh — 连接雷电(LDPlayer)模拟器并部署 frida-server
#
# 用法: bash tools/mobile/setup-emulator.sh [adb_port]
#   默认 adb 端口 5555（雷电单开默认）。多开时雷电会占用递增端口，用参数指定。
#
# 前置: 雷电模拟器已启动; 静态工具(platform-tools/frida)已在 tools/ 下
# 依赖: Git Bash 环境; frida-tools 已 pip 安装(本机验证用)

set -euo pipefail

PORT="${1:-5555}"
ADDR="127.0.0.1:${PORT}"
TOOLS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADB="${TOOLS_DIR}/platform-tools/adb.exe"
FRIDA_SRC="${TOOLS_DIR}/frida/frida-server-x86_64"

# Git Bash 会把 /data 之类转成 Windows 路径(C:/Program Files/Git/data)，禁用该转换
export MSYS2_ARG_CONV_EXCL='*'

# adb.exe 是 Windows 程序，读不懂 Git Bash 路径(/d/...)，统一转成 Windows 路径(D:/...)
win_path() { cygpath -w "$1" 2>/dev/null || echo "$1"; }
FRIDA_SRC_WIN="$(win_path "${FRIDA_SRC}")"

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

step "adb 连接 ${ADDR}"
"${ADB}" connect "${ADDR}"

step "确认设备在线"
"${ADB}" -s "${ADDR}" get-state

step "切换 root (adbd)"
"${ADB}" -s "${ADDR}" root || true
sleep 2

step "push frida-server (${FRIDA_SRC_WIN})"
"${ADB}" -s "${ADDR}" push "${FRIDA_SRC_WIN}" /data/local/tmp/frida-server

step "设置权限并启动 frida-server"
"${ADB}" -s "${ADDR}" shell "chmod 755 /data/local/tmp/frida-server"
# 先杀掉已运行的实例。注意用 -x(精确进程名) 而非 -f(匹配命令行)：
# -f 会误杀 adb shell 的临时进程(其命令行含 frida-server 字符串)
"${ADB}" -s "${ADDR}" shell "pkill -x frida-server 2>/dev/null || true"
# 完全分离会话启动；stdin/stdout/stderr 全部重定向，避免 adb shell 因管道挂起
"${ADB}" -s "${ADDR}" shell "setsid /data/local/tmp/frida-server </dev/null >/dev/null 2>&1 &"
sleep 3

step "验证 frida-server (pgrep 精确匹配 + 本机连接测试)"
"${ADB}" -s "${ADDR}" shell "pgrep -x frida-server && echo 'device: frida-server alive'"
frida-ps -U >/dev/null 2>&1 && echo 'host:  frida 已连上模拟器' || echo 'host:  frida 连接失败'

printf '\n\033[1;32m✅ 完成 — 模拟器 frida 就绪。\033[0m\n'
printf '   hook 目标:  frida -U -f <包名> -l ssl-pinning-bypass.js\n'
printf '   objection:  objection -g <包名> explore\n'
