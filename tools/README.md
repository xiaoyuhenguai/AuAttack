# Vendored Recon Tools

Copies of external pentest tools vendored into this project for **portability** —
the whole `AuAttack/` folder can be moved between machines and the recon tools
still work (only a Python runtime is required).

| Tool | Path | Version | Purpose |
| --- | --- | --- | --- |
| dirsearch | `tools/dirsearch/dirsearch.py` | 0.4.3 (天狐 fork with 403 bypass) | Active content discovery (hidden endpoints) |
| nmap | `tools/nmap/nmap.exe` | 7.97 | Port/service discovery |
| captcha OCR | `tools/captcha-ocr/solve.py` | ddddocr | Solve captcha images so captcha-gated endpoints are testable |

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
- Vendored for internal authorized testing only; keep `LICENSE` files alongside.

Recon findings are only *candidates* — they enter the workspace as evidence and
still require the normal coverage / knowledge / verification pipeline.
