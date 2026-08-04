# AuAttack — 证据驱动的 AI Web 渗透测试框架

> **Evidence-Driven AI Web Pentest Framework** · 便携 · 可审计 · 中文补天报告一键生成

AuAttack 是一套**证据驱动的 Web 渗透测试运行时**：以 Bun/TypeScript 为核心、通过 MCP 与 CLI 双接口暴露，由 AI（Claude Code）编排多个安全 Agent 协同测试。核心引擎**零模型依赖**（`pentest auto` 仅做确定性本地分析），每一次主动操作都经过 ScopeGuard、审批与证据保留，最终报告可直接生成**补天（Butian）提交格式**。

---

## 为什么叫"证据驱动"

传统扫描器输出"可能漏洞"，AuAttack 输出**可复现的证据链**：

```
基线请求 → 单变量变异 → 重放 → 对比 → 候选发现 → 独立重放 → reproduced/confirmed
```

- 每条 finding 必须有 **baseline / variant / comparison** 三份证据工件
- `reproduced/confirmed` 必须由独立重放确认，杜绝"看着像就算"
- 覆盖账本（coverage ledger）逐参数记录"测过什么、怎么测的"，**报告在 untested > 0 时被阻塞**

## 核心特性

- 🧠 **AI Agent 编排**：surface / cve / recon / injection / auth / file / business / poc / verification / correlation 多角色协同，黑板协调（先读黑板、rejected 假设跳过），每一环都有证伪纪律
- 🛡️ **三重防线**：ScopeGuard（越权拦截）+ 审批（P2/P3/P4 分权）+ 证据保留，危险操作不可绕过
- 🔍 **浏览器优先发现**：真实浏览器（走 Burp 代理）抓取 CDP 流量，**Burp 掉线也能重放**；Burp MCP 爬虫为可选增强
- 🧬 **知识层**：POC 目录 + 方法论（含 WAF 绕过/证伪）+ 结构化规则 + **Vulnify CVE 快照**（精确版本匹配，单独下载）
- 🧰 **开箱工具**：vendored dirsearch（内容发现）、nmap（端口扫描）、ddddocr（验证码识别）、Nuclei、OAST、POC
- 🖥️ **Web 控制台**（React + Vite）：总览 / 攻击面图 / 攻击链 / 任务 / 发现 / 覆盖 / 时间线 / 证据 / 报告 / 黑板
- 📄 **补天报告一键生成**：`butian-submission.md` 按官方模板输出，真实请求包脱敏、等级映射、厂商字段待确认清单
- 🔗 **攻击链关联**：`correlation` 确定性扫描 confirmed findings，攻击链落库可画图

## 架构

```
┌──────────────── Claude Code 会话 ─────────────────┐
│   auattack-pentest skill → AGENTS.md + MCP(stdio) │
│   编排器: surface → cve → recon → 5×domain agent  │
│           → verification → correlation            │
└───────────────┬──────────────────────────┬────────┘
                │ MCP 20 工具                │ CLI
┌───────────────▼──────────────────────────▼────────┐
│        packages/pentest-core (~16.6k 行, 40 模块)   │
│   状态: SQLite(WAL) · 攻击面图 · 覆盖账本 · 黑板    │
│   domain: scope/approvals/http/browser/nuclei/oast │
│           poc/knowledge/cve/coverage/correlation   │
└───────────────┬──────────────────────────┬────────┘
                │ Bun.serve :8787           │
┌───────────────▼──────────┐   ┌───────────▼─────────┐
│  Web 控制台 (React+Vite)  │   │ 知识层 (POC/方法论/  │
│  11 标签页只读可视化        │   │  规则/CVE 快照)     │
└──────────────────────────┘   └─────────────────────┘
```

## 快速开始

```bash
bun install
bun run --filter @auattack/pentest-skill build

# 初始化（同 host 自动续跑，--new 开新 run）
bun run packages/pentest-skill/dist/cli.js init https://target.example
# 或 MCP: pentest_workflow { "targetUrl": "https://target.example" }

# 导入授权流量（HAR / Burp JSON / raw）
bun run packages/pentest-skill/dist/cli.js traffic import-har ./workspace/target.example ./capture.har
bun run packages/pentest-skill/dist/cli.js auto ./workspace/target.example

# 浏览器主爬虫（primary crawl）
bun run packages/pentest-skill/dist/cli.js browser discover ./workspace/target.example https://target.example --task surface-001

# 知识路由 → 匹配 → 生成测试任务
bun run packages/pentest-skill/dist/cli.js knowledge import ./workspace/target.example --file <record.json>
bun run packages/pentest-skill/dist/cli.js knowledge match ./workspace/target.example

# 完成门：覆盖闭合 + 关联 + 报告
bun run packages/pentest-skill/dist/cli.js coverage ./workspace/target.example
bun run packages/pentest-skill/dist/cli.js correlation ./workspace/target.example
bun run packages/pentest-skill/dist/cli.js report ./workspace/target.example
```

### MCP 配置

在 Claude Code 中通过 `.mcp.json`（或项目级 MCP 配置）接入（**相对路径**，clone 后从项目根直接可用）：

```json
{
  "mcpServers": {
    "auattack-pentest": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "packages/pentest-mcp/src/server.ts"],
      "env": { "PENTEST_BURP_PROXY_URL": "http://127.0.0.1:8080" }
    }
  }
}
```

> 本地开发时 `.mcp.json` 可配绝对路径（供任意工作目录启动），仓库内示例统一用相对路径。

## 知识资产

| 资产 | 数量 | 作用 |
|---|---|---|
| `references/knowledge/` | 14 POC 目录 | "漏洞长什么样" |
| `references/methodology/` | 24 方法论 | "怎么测"（分类识别 + WAF 绕过 + 验证） |
| `references/knowledge-records/` | 43 结构化规则 | "什么时候测"（信号匹配 → 自动任务） |
| `references/vulnify/` | v2026.07.25（单独下载） | 受影响版本 CVE 精确匹配（`pentest cve`） |

覆盖：injection（SQLi/XSS/SSTI/CMDi/SSRF/XXE/LFI/NoSQL/GraphQL 等）、auth & access control（BOLA/JWT/CORS/CSRF/type-juggling 等）、file & parser、client-side、infra、smuggling、business logic。

### 漏洞数据库（CVE 快照）

本仓库**不随附** Vulnify CVE 快照（`v2026.07.25`，约 421MB 压缩，过大未入库）。

- **数据库来源**：[Vulnify](https://github.com/khulnasoft/vulnify) 开源项目
- **建议下载到**：`packages/pentest-skill/references/vulnify/v2026.07.25/`（结构：`vulnify.db.zst`）
- **初始化**：首次使用前运行 `pentest cve init`（需 `zstd` 在 PATH）

> 未安装时 `pentest cve`（受影响 CVE 精确匹配）不可用，其余功能不受影响。

## 目录

```
packages/pentest-core/      核心逻辑（状态/DAG/工具/自动化）
packages/pentest-mcp/       MCP stdio 服务器（20 工具）
packages/pentest-skill/     Agent 规则 + 知识层 + 技能
web/                        只读 Web 控制台（React+Vite）
tools/                      vendored dirsearch / nmap / 辅助脚本
workspace/                  域分组工作区（<域名>/<子域>，gitignore 排除）
data/                       CVE 快照等（gitignore 排除，按需下载）
```

## 文档

- `ARCHITECTURE.md` — 架构与启动手册
- `AGENTS.md` — Agent 操作纪律与工作流
- `packages/pentest-skill/references/` — 知识层索引

## 技术栈

Bun · TypeScript · SQLite(WAL) · MCP SDK · React/Vite · Playwright/CDP · ddddocr · Vulnify

---

> ⚠️ **合法使用**：仅用于已授权目标的渗透测试。AuAttack 内置 ScopeGuard 与审批，但请遵守当地法律与测试边界。
