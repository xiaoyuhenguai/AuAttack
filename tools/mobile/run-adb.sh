#!/usr/bin/env bash
# tools/mobile/run-adb.sh — 统一的 adb 调用包装，消灭 Git Bash 路径转换坑
#
# Git Bash 会把 /data 之类转成 Windows 路径(C:/Program Files/Git/data)，而
# adb.exe / curl / openssl 是 Windows 二进制读不懂 /tmp 路径。本包装内置
# MSYS2_ARG_CONV_EXCL + cygpath 转换，所有 mobile 脚本统一用它调 adb。
#
# 用法:
#   run-adb.sh [-s <serial>] <adb args...>       # 透传 adb 参数
#   run-adb.sh win <path>                        # 把 Git Bash 路径转 Windows 路径
#
# 示例:
#   bash tools/mobile/run-adb.sh devices
#   bash tools/mobile/run-adb.sh -s 127.0.0.1:5555 shell "cat /data/data/x"
#   bash tools/mobile/run-adb.sh win /tmp/x.apk  # -> C:\Users\...\Temp\x.apk

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADB="${SCRIPT_DIR}/../platform-tools/adb.exe"

# 禁用 Git Bash 的路径转换（让 /data 保持原样传给 adb）
export MSYS2_ARG_CONV_EXCL='*'

win_path() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

if [ "${1:-}" = "win" ]; then
  [ -n "${2:-}" ] || { echo "usage: run-adb.sh win <path>" >&2; exit 1; }
  win_path "$2"
  exit 0
fi

exec "${ADB}" "$@"
