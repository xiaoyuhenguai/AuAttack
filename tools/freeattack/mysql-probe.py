#!/usr/bin/env python3
"""
Free-attack 预置模板：MySQL 凭证验证（只读）

用法:
    python mysql-probe.py -u <target-url>

环境变量（凭证）:
    PENTEST_FA_MYSQL_HOST   (默认取 -u 的 host)
    PENTEST_FA_MYSQL_PORT   (默认 3306)
    PENTEST_FA_MYSQL_USER   (如 <user>)
    PENTEST_FA_MYSQL_PASS   (如 <password>)
    PENTEST_FA_MYSQL_DB     (可选)

行为:
    - 只读探测：连接、SELECT VERSION()、SHOW DATABASES 计数
    - 绝不写库、不 DROP、不 UPDATE
    - 输出可判定 JSON 给 orchestrator 作证据
安全:
    - 单目标、显式超时、失败即退
"""
import argparse
import json
import os
import socket
import sys

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()

    host = os.environ.get("PENTEST_FA_MYSQL_HOST", "").strip()
    port = int(os.environ.get("PENTEST_FA_MYSQL_PORT", "3306"))
    user = os.environ.get("PENTEST_FA_MYSQL_USER", "").strip()
    password = os.environ.get("PENTEST_FA_MYSQL_PASS", "").strip()
    database = os.environ.get("PENTEST_FA_MYSQL_DB", "").strip()

    if not host:
        # fall back to URL host
        from urllib.parse import urlparse
        host = urlparse(args.url).hostname or ""
    if not user or not password:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_MYSQL_USER/PASS env"}, ensure_ascii=False))
        return 2

    # 1) TCP reachability first (never attempt auth against an unreachable host)
    try:
        with socket.create_connection((host, port), timeout=8):
            pass
    except OSError as error:
        print(json.dumps({"ok": False, "reachable": False, "reason": f"tcp connect failed: {error}"}, ensure_ascii=False))
        return 1

    # 2) Try MySQL client if available
    try:
        import pymysql  # type: ignore
    except ImportError:
        try:
            import MySQLdb as pymysql  # type: ignore
        except ImportError:
            print(json.dumps({"ok": False, "reachable": True, "reason": "no mysql python client installed"}, ensure_ascii=False))
            return 3

    try:
        conn = pymysql.connect(
            host=host, port=port, user=user, password=password,
            database=database or None, connect_timeout=10, read_timeout=10,
        )
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT VERSION()")
                version = cur.fetchone()[0]
                cur.execute("SHOW DATABASES")
                databases = [row[0] for row in cur.fetchall()]
            print(json.dumps({
                "ok": True, "reachable": True, "authenticated": True,
                "version": str(version), "databases": databases,
            }, ensure_ascii=False))
            return 0
        finally:
            conn.close()
    except Exception as error:  # noqa: BLE001 - auth failure is the finding signal
        # Auth failed OR query denied: report distinctly
        msg = str(error)
        denied = any(k in msg.lower() for k in ("denied", "access", "password", "auth"))
        print(json.dumps({
            "ok": False, "reachable": True, "authenticated": False,
            "credentialValid": not denied, "reason": msg[:300],
        }, ensure_ascii=False))
        return 1 if not denied else 4

if __name__ == "__main__":
    sys.exit(main())
