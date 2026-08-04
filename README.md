# AuAttack — Evidence-Driven Web Pentest Runtime

Portable, evidence-driven web penetration-testing runtime with a Bun CLI and a stdio MCP server. The core has no model dependency; `pentest auto` performs deterministic local analysis only, and every active action passes ScopeGuard, approvals, and evidence preservation.

## Highlights

- **Evidence first**: baseline → single-variable mutation → replay → compare → candidate. Reproduced/confirmed findings require independent replay.
- **Coverage closure**: a coverage ledger tracks every route/parameter as tested/waived/untested; `pentest_report` is blocked while untested > 0, and the HTML site map is colored (green tested / yellow waived / red untested).
- **Deterministic correlation**: `pentest correlation` scans confirmed findings against chain rules and emits chain hypotheses for the correlation-agent.
- **Browser-first discovery**: a real browser (via the configured Burp proxy when reachable) crawls the target and its CDP-captured traffic is replayable even without Burp; Burp MCP crawl is an optional augmentation.
- **Active recon escalation**: vendored **dirsearch** (content discovery) and **nmap** (port scan) — hits are re-imported as evidence + surface nodes; open ports become `port` nodes feeding port knowledge records and the CVE pipeline.
- **Client-side verification**: `pentest browser-verify` navigates a headless browser to a marker payload and confirms the marker global was set (reflection ≠ execution).
- **Domain-grouped workspaces**: `workspace/<registrable-domain>/<subdomain>` (e.g. `workspace/navimow.com/account-test`, apex targets land in `workspace/<domain>/root`); re-running `init`/`pentest_workflow` on the same target resumes the existing workspace (`--new` forces a fresh one).

## Quick Start

```powershell
bun install
bun run --filter @auattack/pentest-skill build

# init (resumes existing <hostname> workspace; use --new for a fresh run)
bun run packages/pentest-skill/dist/cli.js init https://target.example
# or via MCP: pentest_workflow { "targetUrl": "https://target.example" }

bun run packages/pentest-skill/dist/cli.js traffic import-har .\workspace\target.example .\capture.har
bun run packages/pentest-skill/dist/cli.js auto .\workspace\target.example

# surface discovery (primary crawl) — inside an active surface-001 task
bun run packages/pentest-skill/dist/cli.js browser discover .\workspace\target.example https://target.example --task surface-001

# knowledge import → match → tasks
bun run packages/pentest-skill/dist/cli.js knowledge import .\workspace\target.example --file packages/pentest-skill/references/knowledge-records/<record>.json
bun run packages/pentest-skill/dist/cli.js knowledge match .\workspace\target.example

# active recon escalation (each requires an approval)
bun run packages/pentest-skill/dist/cli.js approval grant .\workspace\target.example P3 --purpose "content discovery"
bun run packages/pentest-skill/dist/cli.js discover dirsearch .\workspace\target.example https://target.example --approval <id>
bun run packages/pentest-skill/dist/cli.js approval grant .\workspace\target.example P4 --purpose "port scan"
bun run packages/pentest-skill/dist/cli.js nmap .\workspace\target.example target.example --approval <id>

# completion gates
bun run packages/pentest-skill/dist/cli.js coverage .\workspace\target.example
bun run packages/pentest-skill/dist/cli.js correlation .\workspace\target.example
bun run packages/pentest-skill/dist/cli.js browser-verify .\workspace\target.example "<payload-url>" --marker __auv_xss_1
```

## Knowledge Assets

| Asset | Count | Role |
|---|---|---|
| `references/knowledge/` | 13 POC catalogs + `CLASSIFICATION.md` index | "what the vulnerability looks like" — real Nuclei templates from the Vulnify snapshot |
| `references/methodology/` | 20 manuals | "how to test it" — per-class identify + expert WAF-bypass + verify, loaded by `knowledge prepare` per agent role |
| `references/knowledge-records/` | 37 structured rules | "when to test it" — signals → `knowledge match` → auto-generated tasks |
| `references/vulnify/` | v2026.07.25 (441 MB) | precise affected-version CVE matching (`pentest cve`) |

Coverage: injection (SQLi/XSS/SSTI/CMDi/SSRF/XXE/LFI/NoSQL/JNDI/HPP/PP/GraphQL), auth & access control (BOLA/JWT/CORS/401-403/Host-header/cache-deception/type-juggling/CSRF), file & parser (SCM-leak/CSV/dependency-confusion/actuator/debugbar/WebLogic/upload), client-side (open-redirect/WebSocket/email-header/XSS), infra (Redis/Docker/ES/K8s ports), smuggling, business logic (methodology-driven).

## 漏洞数据库（CVE 快照）

本仓库**不随附** Vulnify CVE 快照（`v2026.07.25`，约 421MB 压缩，过大未入库）。

- **数据库来源**：[Vulnify](https://github.com/khulnasoft/vulnify) 开源项目（授权测试的 CVE 知识快照）
- **建议下载到**：`packages/pentest-skill/references/vulnify/v2026.07.25/`（结构：`vulnify.db.zst`）
- **初始化**：首次使用前运行 `pentest cve init`（解压到 `%LOCALAPPDATA%\AuAttack\vulnify`，需 `zstd` 在 PATH）

> 未安装时 `pentest cve`（受影响的 CVE 精确匹配）不可用，其余功能不受影响。

## Agent Workflow

The MCP surface starts with `pentest_workflow`, then `pentest_state/scope/traffic/surface/http/replay/mutate/compare/task/finding/auto/report/knowledge`, with `pentest_command` exposing the remaining CLI (browser, discover, nmap, coverage, correlation, probes, nuclei, OAST, sessions, approvals, flows, POCs, CVE). Repository-level agent rules: `AGENTS.md`.

```json
{
  "mcpServers": {
    "auattack-pentest": {
      "command": "bun",
      "args": ["run", "D:/tools/Packet capture/Burp Suite/ai/AuAttack/packages/pentest-mcp/src/server.ts"],
      "env": { "PENTEST_BURP_PROXY_URL": "http://127.0.0.1:8080" }
    }
  }
}
```

## Vendored Tools

`tools/` ships dirsearch (content discovery) and nmap (port scan) so the whole folder is portable. `PENTEST_DIRSEARCH` / `PENTEST_NMAP` override the paths. Setup on a fresh machine:

```bash
pip install -r tools/dirsearch/requirements.txt
pip install "setuptools<81"   # Python 3.12+ no longer ships pkg_resources
```

## Operational Notes

- **Restart the MCP server after code changes** (it runs from `src`; a restart picks up new ROLE_SOURCES and commands).
- **Approvals**: active recon (`dirsearch` P3, `nmap` P4) and P3/P4 replays require a pre-granted approval (`pentest approval grant`).
- **Residual risk**: content discovery is probabilistic — genuinely unlinked endpoints may remain undiscovered; the coverage gate verifies known surface only.
- **Testing**: `bun test packages/pentest-core/src/__tests__`.
