#!/usr/bin/env python3
"""
Free-attack 预置模板：ID 集合批量枚举（只读、限速）

用法:
    python id-batch-enum.py -u <target-url>

环境变量:
    PENTEST_FA_ENDPOINT    目标接口路径，如 /api/user/get-info
    PENTEST_FA_IDS_CSV     逗号分隔的 ID 列表（openid/userid/ticketid）
    PENTEST_FA_QUERY_PARAM 查询参数名（默认 openid）
    PENTEST_FA_TOKEN       可选 Bearer token
    PENTEST_FA_DELAY_MS    每个请求间隔毫秒（默认 500，避免触发 WAF/限速）
    PENTEST_FA_MAX_REQUESTS 上限（默认 50，防止放大失控）

行为:
    - 对每个 ID 发 GET <base>/<endpoint>?<param>=<id>
    - 记录状态码 + 响应长度 + 前 200 字符，判定"有数据/无数据/拒绝"
    - 只读 GET，限速，上限可控
输出: JSON { total, ok, denied, sample: [...3], statusCodes }
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()
    endpoint = os.environ.get("PENTEST_FA_ENDPOINT", "").strip()
    ids_csv = os.environ.get("PENTEST_FA_IDS_CSV", "").strip()
    param = os.environ.get("PENTEST_FA_QUERY_PARAM", "openid").strip()
    token = os.environ.get("PENTEST_FA_TOKEN", "").strip()
    delay_ms = int(os.environ.get("PENTEST_FA_DELAY_MS", "500"))
    max_requests = int(os.environ.get("PENTEST_FA_MAX_REQUESTS", "50"))
    if not endpoint or not ids_csv:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_ENDPOINT / PENTEST_FA_IDS_CSV env"}, ensure_ascii=False))
        return 2
    ids = [item.strip() for item in ids_csv.split(",") if item.strip()][:max_requests]
    base = args.url.rstrip("/")
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    results = []
    ok = denied = 0
    status_codes = {}
    for index, identifier in enumerate(ids):
        url = f"{base}{endpoint}?{urllib.parse.quote(param)}={urllib.parse.quote(identifier)}"
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as response:
                body = response.read()
                status_codes[response.status] = status_codes.get(response.status, 0) + 1
                if response.status < 400:
                    ok += 1
                else:
                    denied += 1
                if len(results) < 3:
                    results.append({
                        "id": identifier[:40], "status": response.status,
                        "len": len(body), "preview": body[:200].decode(errors="replace"),
                    })
        except urllib.error.HTTPError as error:
            status_codes[error.code] = status_codes.get(error.code, 0) + 1
            denied += 1
            if len(results) < 3:
                results.append({"id": identifier[:40], "status": error.code, "len": 0, "preview": error.read(200).decode(errors="replace")})
        except Exception as error:  # noqa: BLE001
            status_codes["error"] = status_codes.get("error", 0) + 1
            denied += 1
        if index < len(ids) - 1:
            time.sleep(delay_ms / 1000.0)
    print(json.dumps({
        "ok": True, "total": len(ids), "okResponses": ok, "denied": denied,
        "statusCodes": status_codes, "sample": results,
        "conclusion": "mass-access" if ok > len(ids) // 2 else ("partial" if ok > 0 else "denied"),
    }, ensure_ascii=False))
    return 0

if __name__ == "__main__":
    sys.exit(main())
