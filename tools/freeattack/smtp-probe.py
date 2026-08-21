#!/usr/bin/env python3
"""
Free-attack 预置模板：SMTP 凭证验证（只读）

用法:
    python smtp-probe.py -u <target-url>

环境变量:
    PENTEST_FA_SMTP_HOST   SMTP 服务器
    PENTEST_FA_SMTP_PORT   默认 25（可选 465/587）
    PENTEST_FA_SMTP_USER   用户名
    PENTEST_FA_SMTP_PASS   密码
    PENTEST_FA_SMTP_TLS    true 时用 SMTP_SSL（465）或 STARTTLS（587）

行为:
    - 连接 + 认证 + 发送 NOOP（不发送实际邮件）
    - 输出可判定 JSON：认证成功 = 凭证可用于伪造钓鱼邮件/滥用
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
    host = os.environ.get("PENTEST_FA_SMTP_HOST", "").strip()
    port = int(os.environ.get("PENTEST_FA_SMTP_PORT", "25"))
    user = os.environ.get("PENTEST_FA_SMTP_USER", "").strip()
    password = os.environ.get("PENTEST_FA_SMTP_PASS", "").strip()
    use_tls = os.environ.get("PENTEST_FA_SMTP_TLS", "false").strip().lower() == "true"
    if not host or not user or not password:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_SMTP_HOST/USER/PASS env"}, ensure_ascii=False))
        return 2
    try:
        import smtplib
        if use_tls and port == 465:
            conn = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            conn = smtplib.SMTP(host, port, timeout=10)
            if use_tls:
                conn.starttls()
        try:
            conn.login(user, password)
            conn.noop()
            print(json.dumps({"ok": True, "authenticated": True, "host": host, "port": port}, ensure_ascii=False))
            return 0
        finally:
            try:
                conn.quit()
            except Exception:  # noqa: BLE001
                pass
    except smtplib.SMTPAuthenticationError as error:
        print(json.dumps({"ok": False, "authenticated": False, "reason": f"auth failed: {error}"}, ensure_ascii=False))
        return 1
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "authenticated": False, "reason": str(error)[:300]}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    sys.exit(main())
