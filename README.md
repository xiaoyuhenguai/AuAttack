# AuAttack — 证据驱动的 AI Web 渗透测试框架

> **Evidence-Driven AI Web Pentest Framework** · 便携 · 可审计 · 中文补天报告一键生成

AuAttack 是一套**证据驱动的 Web 渗透测试运行时**：以 Bun/TypeScript 为核心、通过 MCP 与 CLI 双接口暴露，由 AI（Claude Code / DeepSeek Harness 等）编排多个安全 Agent 协同测试。核心引擎**零模型依赖**（`pentest auto` 仅做确定性本地分析），每一次主动操作都经过 ScopeGuard、审批与证据保留，最终报告可直接生成**补天（Butian）提交格式**。

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

- 🧠 **AI Agent 编排**：surface / cve / recon / plan / 5×domain / completeness / verification / correlation / freeattack 多角色协同，黑板协调（先读黑板、rejected 假设跳过），每一环都有证伪纪律
- 🛡️ **三重防线**：ScopeGuard（越权拦截）+ 审批（P2/P3/P4 分权）+ 证据保留，危险操作不可绕过
- 🔍 **浏览器优先发现**：真实浏览器（走 Burp 代理）抓取 CDP 流量，**Burp 掉线也能重放**；Burp MCP 爬虫为可选增强
- 🧬 **知识层**：POC 目录 + 方法论（含 WAF 绕过/证伪）+ 结构化规则 + **Vulnify CVE 快照**（精确版本匹配，单独下载）
- 🧰 **开箱工具**：vendored dirsearch（内容发现）、nmap（端口扫描）、ddddocr（验证码识别）、Nuclei、OAST、POC
- 🖥️ **Web 控制台**（React + Vite）：总览 / 攻击面图 / 攻击链 / 任务 / 发现 / 覆盖 / 时间线 / 证据 / 报告 / 黑板 / 指纹 / 语义覆盖
- 📄 **补天报告一键生成**：`butian-submission.md` 按官方模板输出，真实请求包脱敏、等级映射、厂商字段待确认清单
- 🔗 **攻击链关联**：`correlation` 确定性扫描 confirmed findings，攻击链落库（`AP-*`）可画图
- 🆓 **自由攻击阶段**：`freeattack` 让全新 Agent 基于资产库 + 攻击链 + 18 个联想模板自由探索，直到资产耗尽
- ✅ **完整性门**：`completeness` 在验证前审计测试覆盖，未测项阻塞流程推进
- 📱 **移动端（App）评估**：APK 静态分析（manifest/导出组件/硬编码密钥/WebView 桥）+ 动态抓包，独立 `-mobile` 工作区
- 🔌 **DSH 插件**：注册为 DeepSeek Harness 插件，MCP 工具原生挂载 + 渗透专家预设

## 工作流阶段

```
surface → cve → (apk-static → apk-dynamic) → recon → plan → domain
       → completeness → verification → correlation → freeattack → report
```

| 阶段 | 任务 | 说明 |
|---|---|---|
| `surface-001` | surface-agent | 浏览器主爬虫 + 内容发现，建立攻击面图（路由/参数/会话/技术指纹） |
| `cve-001` | cve-agent | 基于技术指纹做受影响 CVE 精确匹配 |
| `apk-static-001` / `apk-dynamic-001` | surface-agent | **仅移动端**：APK 静态分析 + 模拟器动态抓包 |
| `recon-002` | recon-agent | 生成 `reports/recon-summary.md`（目录/API/敏感信息/指纹/测试方向） |
| `plan-001` | planner-agent | 生成结构化攻击计划：每个攻击点映射漏洞类别与深度阶梯 |
| `injection/auth/file/business/poc-001` | 5×domain agent | 域测试（注入/认证/文件/业务/POC），受 recon + plan 门控 |
| `completeness-001` | completeness-agent | 完整性门：审计攻击计划每项是否达到终态测试结果 |
| `verification-001` | verification-agent | 独立重放确认 reproduced/confirmed |
| `correlation-001` | correlation-agent | 攻击链关联：确定性扫描可链组合，落库 `AP-*` 路径 |
| `freeattack-001` | free-attack-agent | 自由攻击：全新 Agent 基于资产库 + 攻击链自由探索 |
| `report` | report-agent | 补天提交格式报告 |

## 架构

```
┌──────────────── Claude Code / DSH 会话 ──────────────┐
│   auattack-pentest skill → AGENTS.md + MCP(stdio)    │
│   编排器: surface → cve → recon → plan → 5×domain    │
│           → completeness → verification → correlation│
│           → freeattack → report                      │
└───────────────┬──────────────────────────┬───────────┘
                │ MCP 20 工具                │ CLI (pentest)
┌───────────────▼──────────────────────────▼───────────┐
│        packages/pentest-core (~22.8k 行, 52 模块)      │
│   状态: SQLite(WAL) · 攻击面图 · 覆盖账本 · 黑板       │
│   domain: scope/approvals/http/browser/nuclei/oast    │
│           poc/knowledge/cve/coverage/correlation      │
└───────────────┬──────────────────────────┬───────────┘
                │ Bun.serve :8787           │
┌───────────────▼──────────┐   ┌───────────▼───────────┐
│  Web 控制台 (React+Vite)  │   │ 知识层 (POC/方法论/    │
│  14 标签页只读可视化        │   │  规则/CVE 快照)       │
└──────────────────────────┘   └───────────────────────┘
```

## 环境要求

### 必需运行时

| 运行时 | 版本 | 用途 | 安装 |
|---|---|---|---|
| **Bun** | ≥ 1.3 | 核心运行时（CLI/MCP/Web 控制台） | 官方脚本 `curl -fsSL https://bun.sh/install \| bash`（Windows 用 `powershell -c "irm bun.sh/install.ps1 \| iex"`） |
| **Python** | ≥ 3.10 | `tools/dirsearch`（内容发现） | [python.org](https://www.python.org/downloads/) |

### 可选

| 依赖 | 用途 | 说明 |
|---|---|---|
| **zstd** | 解压 Vulnify CVE 快照（`pentest cve init`） | 未装则 `pentest cve` 不可用；`apt install zstd` / `choco install zstd` |
| **Burp Suite Professional** | Burp 历史导入 / 主动爬虫（BurpMCP-Ultra） | 详见「Burp Suite 集成」；不装则浏览器发现/CDP 流量仍可用 |
| **JDK 17** | 构建 BurpMCP-Ultra 插件 | 仅构建插件时需要；直接下载预编译 jar 则无需 |
| **Android 模拟器 + frida** | 移动端动态分析（`apk-dynamic`） | 仅移动端评估需要；`tools/mobile/setup-emulator.sh` 自动部署 frida-server |

### 安装步骤

```bash
# 1. 安装 Bun、Python（见上表）

# 2. 安装项目依赖
bun install
bun run --filter @auattack/pentest-skill build

# 3. dirsearch 依赖（内容发现）
pip install -r tools/dirsearch/requirements.txt
pip install "setuptools<81"     # Python 3.12+ 不再内置 pkg_resources

# 4.（可选）CVE 快照：解压 Vulnify 到 references/vulnify/v2026.07.25/（见「漏洞数据库」节），确保 zstd 在 PATH

# 5.（可选）Burp MCP 插件：见「Burp Suite 集成」节
```

> vendored 工具已随仓库携带：`tools/nmap`（Windows 二进制 nmap.exe）、`tools/dirsearch`（Python 源码）、`tools/captcha-ocr`（ddddocr 验证码识别）。`PENTEST_DIRSEARCH` / `PENTEST_NMAP` 可覆盖路径。

## 快速开始

```bash
bun install
bun run --filter @auattack/pentest-skill build

# 初始化（同 host 自动续跑，--new 开新 run）
pentest init https://target.example
# 或 MCP: pentest_workflow { "targetUrl": "https://target.example" }

# 导入授权流量（HAR / Burp JSON / raw）
pentest traffic import-har ./workspace/target.example ./capture.har
pentest auto ./workspace/target.example

# 浏览器主爬虫（primary crawl）
pentest browser discover ./workspace/target.example https://target.example --task surface-001

# 知识路由 → 匹配 → 生成测试任务
pentest knowledge import ./workspace/target.example --file <record.json>
pentest knowledge match ./workspace/target.example

# 攻击计划 → 完整性门 → 覆盖闭合 → 关联 → 自由攻击 → 报告
pentest plan generate ./workspace/target.example
pentest completeness status ./workspace/target.example
pentest coverage ./workspace/target.example
pentest correlation ./workspace/target.example
pentest freeattack enable ./workspace/target.example
pentest report ./workspace/target.example
```

> 未构建时也可直接 `bun run packages/pentest-skill/dist/cli.js <cmd>`。

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

## AI Agent 接入（让 Agent 自动干活，而非手动敲 CLI）

AuAttack 的核心使用方式是**让 AI Agent（Claude Code / DSH 等）通过 MCP 直接驱动**，整条渗透流程由 Agent 自动编排，不需要你逐条敲 CLI。

### 1. Claude Code（推荐）

把项目目录作为 Claude Code 的工作目录打开，**配好 `.mcp.json` 后 Agent 即可自动调用**：

```bash
# 一键接入（等价于手写 .mcp.json）
claude mcp add auattack-pentest --type stdio -- \
  bun run /path/to/AuAttack/packages/pentest-mcp/src/server.ts \
  --env PENTEST_BURP_PROXY_URL=http://127.0.0.1:8080
```

接入后，Agent 会自动按流程工作：调用 `pentest_workflow` 建工作区 → 导入流量 → 浏览器发现 → 知识路由 → 攻击计划 → 域测试 → 完整性门 → 证据链 → 覆盖闭合 → 关联 → 自由攻击 → 补天报告。你只需要告诉它目标 URL 和授权说明。

项目还内置 **`auattack-pentest` skill**（`.claude/skills/auattack-pentest/`），Claude 输入 `/auattack-pentest` 即可加载完整工作流约束（AGENTS.md 的操作纪律、证据要求、报告模板），确保 Agent 按规范执行。

### 2. DSH（DeepSeek Harness）插件

`packages/dsh-auattack/` 把 AuAttack 注册为 DSH 插件：MCP 工具原生挂载为 `mcp__auattack__*`（20 个），并附带「AuAttack 模式」渗透专家预设。安装：

```bash
node apps/cli/lib/bin.js plugin --profile web add "D:/path/to/AuAttack/packages/dsh-auattack"
```

### 3. MCP 工具清单（Agent 可调用的 20 个工具）

| 工具 | 作用 |
|---|---|
| `pentest_workflow` | 入口：建工作区/续跑，返回当前阶段与可执行任务 |
| `pentest_state` / `pentest_scope` / `pentest_traffic` | 状态、范围、流量导入 |
| `pentest_surface` / `pentest_task` / `pentest_finding` | 攻击面图、任务认领、发现提交 |
| `pentest_blackboard` | 共享推理黑板：跨 Agent 读/写假设与结论 |
| `pentest_http` / `pentest_replay` / `pentest_mutate` / `pentest_compare` | 证据驱动的请求/变异/对比 |
| `pentest_auto` / `pentest_report` | 确定性分析 / 报告（Markdown/JSON/HTML/DOCX/PDF） |
| `pentest_knowledge` / `pentest_cve` / `pentest_burp_crawl` / `pentest_browser` | 知识路由 / CVE / Burp 爬虫 / 浏览器验证 |
| `pentest_javascript` | JS 攻击面清单（路由/接口/密钥扫描） |
| `pentest_command` | 透传其余 CLI（browser、nuclei、oast、coverage、correlation、plan、freeattack 等） |

### 4. Claude Desktop / 其他 MCP 客户端

Claude Desktop（仅支持 stdio）直接在 `claude_desktop_config.json` 添加：

```json
{
  "mcpServers": {
    "auattack-pentest": {
      "command": "bun",
      "args": ["run", "/绝对路径/AuAttack/packages/pentest-mcp/src/server.ts"],
      "env": { "PENTEST_BURP_PROXY_URL": "http://127.0.0.1:8080" }
    }
  }
}
```

Coder / Cursor 等支持 MCP 的客户端同理，指向同一个 stdio server 即可。启动 MCP server 的命令始终是：

```bash
bun run packages/pentest-mcp/src/server.ts
```

## 移动端（App）评估

移动端评估是**独立流程**（`run.platform === 'mobile'`，工作区以 `-mobile` 结尾），与 Web 流程分离：

```bash
# 创建移动端工作区（目标是 App 的 API 基址）
pentest init <api-base-url> --platform mobile --apk <path-to.apk>
# 或从已连接模拟器拉取
pentest init <api-base-url> --platform mobile --package-name <pkg>

# 静态分析：manifest / 导出组件 / deep link / 硬编码密钥 / WebView 桥 / API 端点 / 证书
pentest apk analyze <workspace> <apk>
pentest apk pull <workspace> <package>

# 动态分析：模拟器抓包（frida + 证书处理），Burp 可达时同步流量
pentest apk sync-mcp <workspace>

# 客户端侧覆盖
pentest apk coverage <workspace>
```

多域名 App 会自动扩展 scope（主 API + SSO + CDN + 三方 SDK），`apk sync-mcp` 会同步所有 in-scope origin 的流量。静态发现需动态确认后才可提交。

## Burp Suite 集成（可选）

AuAttack 的浏览器发现、Burp 历史导入、主动爬虫依赖 Burp MCP 扩展（**BurpMCP-Ultra**）。

### 安装 BurpMCP-Ultra

1. **获取插件**：[Releases 下载预编译 jar](https://github.com/Cy-S3c/BurpMCP-Ultra/releases)，或自行构建：
   ```bash
   git clone https://github.com/Cy-S3c/BurpMCP-Ultra.git
   cd BurpMCP-Ultra
   ./gradlew shadowJar        # Windows: gradlew.bat shadowJar（需 JDK 17）
   ```
2. **Burp Suite 加载**：`Extensions → Add` → 选择 jar（Burp Suite Professional 2025.x+）
3. 加载后出现 **BurpMCP-Ultra** 标签页，状态 "Running" 即就绪

### 端点与配置

| 服务 | 地址 |
|---|---|
| MCP SSE（主，**根路径 `/` 而非 `/sse`**） | `http://127.0.0.1:9876/` |
| SSE（备用） | `http://127.0.0.1:9877/` |
| Web 仪表盘 | `http://127.0.0.1:9878` |

### 代理与 TLS 证书（要不要用户自己配？）

**自动化浏览器：不需要手动导入证书。** AuAttack 的浏览器发现使用隔离的 Chrome，通过 `--ignore-certificate-errors` 自动接受 Burp 的 MITM 证书（`browser-tls` 命令持久化该策略，`--insecure-tls` 选项即时生效）。抓包流量照常记录，无需你导入 Burp CA。

**Burp 代理：只需 Burp 在默认端口监听。** 项目通过环境变量指向代理（默认 `http://127.0.0.1:8080`），Burp 装好后默认即监听该端口，无需额外配置；换端口改 `PENTEST_BURP_PROXY_URL` 即可。

> 仅当你想**手动用浏览器**（非自动化）或自己抓包时，才需要按 Burp 标准流程导入其 CA 证书 —— 这不是 AuAttack 的必需步骤。

AuAttack 通过环境变量连接（无需手动建 burp MCP client）：

```json
{
  "mcpServers": {
    "auattack-pentest": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "packages/pentest-mcp/src/server.ts"],
      "env": {
        "PENTEST_BURP_MCP_URL": "http://127.0.0.1:9876/",
        "PENTEST_BURP_PROXY_URL": "http://127.0.0.1:8080"
      }
    }
  }
}
```

> 若需要 Claude Code 直接驱动 Burp（非 AuAttack 通道），在 `.mcp.json` 单独加 `burp` server（SSE 端点 + Server 标签页的 Bearer Token）：
> ```json
> { "mcpServers": { "burp": { "type": "sse", "url": "http://127.0.0.1:9876/", "headers": { "Authorization": "Bearer <TOKEN>" } } } }
> ```

## 知识资产

| 资产 | 数量 | 作用 |
|---|---|---|
| `references/knowledge/` | 16 POC 目录 | "漏洞长什么样" |
| `references/methodology/` | 27 方法论 | "怎么测"（分类识别 + WAF 绕过 + 验证 + freeattack 联想模板） |
| `references/knowledge-records/` | 48 结构化规则 | "什么时候测"（信号匹配 → 自动任务） |
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
packages/dsh-auattack/      DSH（DeepSeek Harness）插件
web/                        只读 Web 控制台（React+Vite）
tools/                      vendored dirsearch / nmap / 辅助脚本
tools/freeattack/           自由攻击预置验证脚本（mysql/jwt/session/qiniu/aliyun/id/smtp/wechat）
tools/mobile/               移动端工具（apkleaks/apktool/frida/jadx/platform-tools）
tools/recon-summary.ts      recon 汇总生成器（目录/API/指纹/测试方向）
tools/asset-subdomains.ts   资产子域被动收集（crt.sh + CT 日志 + DNS）
tools/asset-organize.ts     资产整理（assets/<root-domain>/<subdomain>/）
workspace/                  域分组工作区（<域名>/<子域>，gitignore 排除）
data/                       CVE 快照等（gitignore 排除，按需下载）
```

## 文档

- `ARCHITECTURE.md` — 架构与启动手册
- `AGENTS.md` — Agent 操作纪律与工作流
- `packages/pentest-skill/references/` — 知识层索引

## 技术栈

Bun · TypeScript · SQLite(WAL) · MCP SDK · React/Vite · Playwright/CDP · ddddocr · Vulnify · DSH · apkleaks/jadx/frida

---

> ⚠️ **合法使用**：仅用于已授权目标的渗透测试。AuAttack 内置 ScopeGuard 与审批，但请遵守当地法律与测试边界。
