#!/usr/bin/env python3
"""
Free-attack 预置模板：阿里云 AK/SK 权限验证（只读）

用法:
    python aliyun-verify.py -u <target-url>

环境变量:
    PENTEST_FA_ALIYUN_AK   阿里云 AccessKey
    PENTEST_FA_ALIYUN_SK   阿里云 SecretKey

行为:
    - 调用 ECS DescribeRegions（只读 API）验证 AK 有效性
    - 不创建/删除/修改任何资源
    - 输出可判定 JSON：API 成功 = 密钥有效且具备云控制权限
"""
import argparse
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

def sign_request(params: dict, secret: str) -> str:
    query = "&".join(f"{urllib.parse.quote(str(k), safe='')}={urllib.parse.quote(str(v), safe='')}" for k, v in sorted(params.items()))
    string_to_sign = f"GET&%2F&{urllib.parse.quote(query, safe='')}"
    digest = hmac.new(f"{secret}&".encode(), string_to_sign.encode(), hashlib.sha1).digest()
    import base64
    return base64.b64encode(digest).decode()

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()
    ak = os.environ.get("PENTEST_FA_ALIYUN_AK", "").strip()
    sk = os.environ.get("PENTEST_FA_ALIYUN_SK", "").strip()
    if not ak or not sk:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_ALIYUN_AK/SK env"}, ensure_ascii=False))
        return 2
    params = {
        "Format": "JSON", "Version": "2014-05-26", "AccessKeyId": ak,
        "SignatureMethod": "HMAC-SHA1", "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "SignatureVersion": "1.0", "SignatureNonce": str(int(time.time() * 1000)),
        "Action": "DescribeRegions",
    }
    params["Signature"] = sign_request(params, sk)
    url = "https://ecs.aliyuncs.com/?" + urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as response:
            body = json.loads(response.read().decode())
            regions = body.get("Regions", {}).get("Region", [])
            print(json.dumps({
                "ok": True, "authenticated": True,
                "regions": [r.get("RegionId") for r in regions][:10],
            }, ensure_ascii=False))
            return 0
    except urllib.error.HTTPError as error:
        reason = error.read().decode(errors="replace")[:300]
        print(json.dumps({"ok": False, "authenticated": False, "httpStatus": error.code, "reason": reason}, ensure_ascii=False))
        return 1
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "authenticated": False, "reason": str(error)[:300]}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    sys.exit(main())
