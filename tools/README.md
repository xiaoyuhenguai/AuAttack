# Vendored Recon Tools

Copies of external pentest tools vendored into this project for **portability** —
the whole `AuAttack/` folder can be moved between machines and the recon tools
still work (Python runtime required; Java 11+ required for the mobile static tools).

| Tool | Path | Version | Purpose |
| --- | --- | --- | --- |
| dirsearch | `tools/dirsearch/dirsearch.py` | 0.4.3 (天狐 fork with 403 bypass) | Active content discovery (hidden endpoints) |
| nmap | `tools/nmap/nmap.exe` | 7.97 | Port/service discovery |
| captcha OCR | `tools/captcha-ocr/solve.py` | ddddocr | Solve captcha images so captcha-gated endpoints are testable |
| jadx | `tools/jadx/lib/jadx-1.5.6-all.jar` | 1.5.6 | APK → Java 反编译（静态分析：manifest/密钥/WebView/SCA） |
| apktool | `tools/apktool/apktool.jar` | 3.0.3 | APK 资源/smali 解码（重打包、细粒度审计） |
| adb | `tools/platform-tools/adb.exe` | 37.0.1 | 连接 Android 设备/模拟器（雷电等） |
| frida-server | `tools/frida/frida-server-x86_64` | 17.17.0 | 模拟器端 hook 代理（SSL pinning/root 检测绕过） |
| frida-tools + objection | pip 全局 | frida-tools 14.10.4 / objection 1.12.5 | 本机侧动态测试（frida CLI / objection 一键绕过） |
| apkleaks | `tools/apkleaks/`（规则集 `config/regexes.json`） | dwisiswant0/apkleaks | APK 敏感信息正则库（AWS/GitHub/Google/Slack/Stripe/私钥等） |

## Captcha OCR

```bash
pip install ddddocr      # + onnxruntime (pulled in automatically)
pentest captcha solve <image.png> [--mode ocr|slide] [--target <bg.png>]
# => {"ok": true, "text": "13951", "mode": "ocr"}
```

Agent flow for captcha-gated targets (e.g. forgot-password, message board):
fetch the captcha image with `pentest_http`, save it, `captcha solve`, then retry the
gated request with the code. Slide captchas use `--mode slide --target <target.png>`
and return the gap x-coordinate. For authorized testing only; hard captchas fall back
to `human-gated` queueing.

## Usage

Invoked through AuAttack (which handles scope + approval + evidence import):

```bash
# grant approvals first
pentest approval grant <workspace> P3 --purpose "content discovery"
pentest approval grant <workspace> P4 --purpose "port scan"

# content discovery: hits are re-probed and imported as replayable traffic + surface
pentest discover dirsearch <workspace> <url> --approval <id> [--wordlist <file>] [--threads N]

# port scan: open ports become 'port' surface nodes (feed port knowledge records + CVE pipeline)
pentest nmap <workspace> <host> --approval <id> [--ports P] [--top-ports N]
```

Tool paths resolve to these vendored copies; override with `PENTEST_DIRSEARCH` /
`PENTEST_NMAP` environment variables.

## Setup on a fresh machine

- **Python 3** on `PATH` (dirsearch is a Python tool).
- Install dirsearch dependencies once:
  ```
  pip install -r tools/dirsearch/requirements.txt
  pip install "setuptools<81"     # Python 3.12+ no longer ships pkg_resources
  ```
- nmap runs as a bundled `.exe` — no install needed. `--unprivileged`
  (TCP connect scan) is forced so it works without admin and without raw-socket
  interface requirements.

## Origin & license

- **dirsearch**: GPL-3.0, from the 天狐 penetration toolkit (community edition);
  a modified fork with 403-bypass additions.
- **nmap**: Nmap Public Source License, Windows build 7.97.
- **jadx**: Apache-2.0, `tools/jadx/LICENSE`.
- **apktool**: Apache-2.0, `tools/apktool/apktool.jar` (license bundled in jar).
- **platform-tools (adb)**: Google Android SDK license, `NOTICE.txt` alongside.
- **frida-server / frida-tools / objection**: MIT.
- Vendored for internal authorized testing only; keep `LICENSE` files alongside.

Recon findings are only *candidates* — they enter the workspace as evidence and
still require the normal coverage / knowledge / verification pipeline.

## Mobile (App) tooling

Static + dynamic toolchain for authorized Android app assessment. Depends on
**Java 11+** (jadx/apktool; the project's `JAVA_HOME` may point at an old JDK,
so call the jar directly with `java -jar`, not the `.bat` wrapper).

### Static analysis (Windows host, no device needed)

```bash
# 1. APK → Java 源码（jadx）
#    注意：all jar 的 Main-Class 是 GUI（jadx.gui.JadxGUI），CLI 必须显式指定主类
java -cp tools/jadx/lib/jadx-1.5.6-all.jar jadx.cli.JadxCLI -d out/ app.apk

# 2. 资源/smali 解码（apktool）— manifest/network_security_config/重打包
java -jar tools/apktool/apktool.jar d app.apk -o out/

# 3. 反编译源码 + 全量字符串里的硬编码密钥 / 敏感关键字
grep -rn -E "api[_-]?key|secret|password|client[_-]?secret|aws_|firebase|Bearer " out/
```

**敏感信息扫描**：`pentest apk analyze` 自动把 vendored APKLeaks 规则集
（`tools/apkleaks/config/regexes.json`，约 50 类：AWS/GitHub/Google/Slack/
Stripe/Twilio/私钥/URL 密码等）并入 secret 扫描，直接扫 jadx 反编译的源码，
无需单独跑 apkleaks python（避免二次反编译与 Windows 路径空格问题）。

**导入 App 流量（Burp MCP）**：模拟器代理 + Burp 抓到的 App 流量用
`pentest apk sync-mcp <workspace>` 拉入 workspace（复用 Burp MCP 的
proxy_history/sitemap 同步管线，但**跳过 blocked-path 守卫**——App 真实流量
含 /logout、/payment 等路径是只读记录，不应被 Web 主动测试的防护拦截）。
Web 平台仍用 `pentest burp sync-mcp`（保留 blocked 检查）。

### Dynamic analysis (emulator / real device)

**一键配置代理 + 证书**（需 Burp 先启动监听 8080）：
```bash
bash tools/mobile/setup-proxy.sh            # 设模拟器代理 → 宿主 Burp + 装 CA 证书
bash tools/mobile/setup-emulator.sh         # 部署 frida-server（连设备时）
# 抓完恢复无代理: adb shell settings put global http_proxy :0
```

> **adb 路径坑**：Git Bash 会把 `/data` 转成 `C:/Program Files/Git/data`，
> adb.exe 是 Windows 二进制读不懂 `/tmp`。新写 mobile 脚本统一用
> `tools/mobile/run-adb.sh` 包装（内置 `MSYS2_ARG_CONV_EXCL` + `cygpath`），
> 避免每个脚本重复踩路径转换坑。

1. **雷电模拟器（LDPlayer）**：开启 root（模拟器设置 → 其他设置 → Root 权限）；
   adb 连上模拟器（雷电自带 adb，或本目录 platform-tools 的 adb）：
   ```bash
   ./platform-tools/adb.exe connect 127.0.0.1:5555   # 雷电默认 adb 端口 5555
   ./platform-tools/adb.exe devices                   # 确认 device 在线
   ```
2. **推送并启动 frida-server**（x86_64 版对应雷电/PC 模拟器；arm64 真机需另下）：
   ```bash
   ./platform-tools/adb.exe push tools/frida/frida-server-x86_64 /data/local/tmp/frida-server
   ./platform-tools/adb.exe shell "chmod 755 /data/local/tmp/frida-server"
   ./platform-tools/adb.exe shell "/data/local/tmp/frida-server &"   # 后台运行
   ```
3. **本机侧连接**（frida-tools / objection，已 pip 安装）：
   ```bash
   frida -U -f com.target.app -l ssl-pinning-bypass.js   # 以 spawn 方式注入
   objection -g com.target.app explore                    # 交互式；内一键：
   #   android sslpinning disable   # 禁用 SSL pinning
   #   android root disable         # 绕过 root 检测
   ```
4. **Burp 抓包**：模拟器 Wi-Fi/系统代理指向 Burp `127.0.0.1:8080`，导出 HAR/Burp
   流量后 `pentest traffic import-har` 进 workspace，复用 AuAttack 后端全流程。
   Android 7.0+ 需把 Burp CA 证书装入系统信任区（frida/objection 可辅助）。

### Known caveats

- **`JAVA_HOME` 可能指向旧 JDK**（本项目开发机 `JAVA_HOME=D:\java` 是 Java 8）：
  jadx/apktool 的 `.bat`/wrapper 会因此失败，统一用 `java -jar` 直调 + 确保
  PATH 里的 `java` 是 11+。
- **frida-server 需与设备架构匹配**：雷电等 x86 模拟器用 `x86_64`；ARM 真机
  用 `android-arm64`（从 frida releases 另下）。
- **objection 首启会有 urllib3/chardet 的 requests 依赖警告**，不影响使用。
