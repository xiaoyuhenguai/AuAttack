#!/usr/bin/env python3
"""
Free-attack 预置模板：七牛云 AK/SK 权限验证（只读）

用法:
    python qiniu-verify.py -u <target-url>

环境变量:
    PENTEST_FA_QINIU_AK        七牛 AccessKey
    PENTEST_FA_QINIU_SK        七牛 SecretKey
    PENTEST_FA_QINIU_BUCKET    可选，指定 bucket

行为:
    - 用 AK/SK 生成七牛管理凭证，GET /v6/buckets 列 bucket
    - 只读验证：不删除、不上传（上传用独立的 upload-token 资产验证）
    - 输出可判定 JSON：bucket 列表可读 = 密钥有效且为管理权限
安全:
    - 仅验证存在性与列表权限，不深入第三方系统操作
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import urllib.request

def sign_access_token(ak: str, sk: str, method: str, url: str, body: bytes = b"") -> str:
    path_query = url.split("://", 1)[1].split("/", 1)
    path_query = "/" + (path_query[1] if len(path_query) > 1 else "")
    data = f"{method} {path_query}\n".encode()
    if body:
        data += f"Content-Type: application/json\n".encode()
        data += hashlib.sha256(body).hexdigest().encode()
    digest = hmac.new(sk.encode(), data, hashlib.sha1).digest()
    sign = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return f"{ak}:{sign}"

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()
    ak = os.environ.get("PENTEST_FA_QINIU_AK", "").strip()
    sk = os.environ.get("PENTEST_FA_QINIU_SK", "").strip()
    if not ak or not sk:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_QINIU_AK/SK env"}, ensure_ascii=False))
        return 2

    api = "https://rs.qiniuapi.com/buckets"
    try:
        token = sign_access_token(ak, sk, "GET", api)
        req = urllib.request.Request(api, headers={"Authorization": f"QBox {token}"})
        with urllib.request.urlopen(req, timeout=15) as response:
            body = response.read().decode()
            buckets = json.loads(body)
            print(json.dumps({
                "ok": True, "authenticated": True,
                "buckets": buckets if isinstance(buckets, list) else [buckets],
            }, ensure_ascii=False))
            return 0
    except urllib.error.HTTPError as error:
        print(json.dumps({
            "ok": False, "authenticated": False,
            "httpStatus": error.code,
            "reason": error.read().decode(errors="replace")[:300],
        }, ensure_ascii=False))
        return 1
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "authenticated": False, "reason": str(error)[:300]}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    sys.exit(main())
