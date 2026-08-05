# AuAttack 架构与启动手册

> 基于 Bun/TypeScript 的证据驱动 Web 渗透自动化系统。agent 由 Claude Code 编排,状态持久化在
> SQLite,所有可复用逻辑集中在 `packages/pentest-core`,提供 MCP(stdin/out)与 CLI 两个接口,
> 外加一个只读 Web 控制台。

---

## 一、架构全貌

```
┌─────────────────────────── Claude Code 会话 ───────────────────────────┐
│  auattack-pentest skill  →  AGENTS.md  +  MCP(stdio)                   │
│                                                                        │
│   编排器(orchestrator)                                                  │
│   ├─ surface-agent ── cve-001 ── recon-002(信息收集闭合)                │
│   └─ 5 个 domain agent ── verification ── correlation                  │
│        每 agent 注入: ROLE_PROMPTS + REVIEW_GATE(证伪) + 完成标准       │
│                     + 知识菜单(roleKnowledgeIndex) + 上下文投影          │
│        黑板协调: claim 前读黑板,rejected/superseded 跳过               │
└───────────────┬──────────────────────────────────────────────┬─────────┘
                │ MCP 20 工具                                      │ CLI
┌───────────────▼──────────────────────────────────────────────▼─────────┐
│                        packages/pentest-core(~16.6k 行,40 模块)          │
│  状态: PentestState → SQLite(WAL)                                       │
│    run/scope/integrations + 集合: surface(节点/边) traffic tasks         │
│    findings events coverage blackboard attackPaths+steps                │
│   DAG: surface-001→cve-001→recon-002→domain→verification→correlation    │
│   automation: 阶段机 surface→cve→recon→domain→verification→correlation   │
│   domain: scope approvals http traffic browserDiscovery javascript       │
│           nuclei oast poc knowledge cve(vulnify) coverage                │
│           testingCoverage correlation attackPath blackboard              │
│           contextProjection outputReader reconTools(dirsearch/nmap)      │
│           subdomains validation mutation rawReplay comparison flow        │
└───────────────┬──────────────────────────────────────────┬───────────────┘
                │ Bun.serve :8787                            │
┌───────────────▼──────────────┐   ┌────────────────────────▼─────────────┐
│   Web 控制台(React+Vite)      │   │  知识层                               │
│   11 标签页: 总览/信息收集/      │   │  references/knowledge 01-13(POC)     │
│   攻击面图/攻击链/任务/发现/     │   │  references/methodology ×24(含证伪)   │
│   覆盖/时间线/证据/报告/黑板    │   │  knowledge-records(信号匹配)          │
│   只读 + 唯一写: recon 重新生成 │   │  workspace/knowledge-notes(agent笔记) │
└──────────────────────────────┘   └──────────────────────────────────────┘
```

### 数据流(一次评估)

1. 导入流量(HAR/raw/Burp/browser)→ surface 建图(route/parameter/technology/port 节点)→ **fingerprint analyze**(Wappalyzer+FingerprintHub 双源指纹,补技术节点)
2. `cve-001` 分析技术节点 → Vulnify 命中受影响的 CVE
3. `recon-002` 闭合信息收集:生成 `reports/recon-summary.md`(目录/API/敏感/指纹/测试方向),**domain 测试被 gate 住,recon 不闭合不能测**
4. 5 个 domain agent 并行测(injection/auth/file/business/poc,上限 `--max-agents`,默认 3,受 scope.maxAgentConcurrency 约束):黑板记假设与证伪,coverage 记 tested/blocked,**test-ledger 逐参数记"测了什么类、什么技术、什么结果"**
5. `verification` 独立重放确认(candidate→reproduced→confirmed)
6. `correlation` 推导攻击链 → **落库为 attack-path**(可画图)
7. 报告 `pentest-report.*`,被 coverage gate 卡(untested=0 才放行)

### 目录

```
packages/pentest-core/     核心逻辑(状态/DAG/工具/自动化),全部经 index.ts 导出
packages/pentest-mcp/      MCP stdio 服务器(20 个 registerTool)
packages/pentest-skill/    技能包装 + references(知识/方法论/报告模板) + dist CLI
web/                       React+Vite 控制台 + web/server.ts(Bun.serve 后端)
tools/                     独立 bun 脚本: recon-summary / site-brief / site-map-html
                           + vendored: dirsearch / nmap / captcha-ocr
workspace/<host>/<sub>/    每个评估一个工作区: pentest-state.sqlite
                           reports/ evidence/ traffic/ knowledge-notes/
data/vulnify/              内置 CVE 数据库(Vulnify 快照,~2GB,只读)
```

---

## 二、启动方式

### 0. 环境前置

- **Bun**(Windows 用 WinGet 装的 bun 即可)+ Node ≥ 18(控制台前端构建用)
- **Python 3**(dirsearch 需要):`pip install -r tools/dirsearch/requirements.txt && pip install "setuptools<81"`
- 首次 `bun install`(根目录,会同时装 packages/* 和 web/* 依赖)

### 1. 渗透流程(主入口,走 Claude Code)

```bash
cd D:\tools\Packet capture\Burp Suite\ai\AuAttack
claude
```

然后对 Claude 使用 `auattack-pentest` skill(项目根 AGENTS.md 会加载),agent 通过 MCP 驱动全部工具。

> ⚠️ **重启纪律**:改过 `packages/pentest-core` / `packages/pentest-mcp` 的代码后,**必须重启 claude 会话**才会让 MCP 加载新代码。用编译产物 `packages/pentest-skill/dist/cli.js` 的流程需先 `bun run build`。

### 2. CLI(不依赖 Claude 也能用)

```bash
# 本地调用(等价于 MCP 里的 pentest_command)
bun run run-pentest.ts <command> [args]

# 例如
bun run run-pentest.ts status <workspace>          # 看状态
bun run run-pentest.ts coverage <workspace>        # 覆盖缺口
bun run run-pentest.ts blackboard list <workspace> # 黑板
bun run run-pentest.ts attack-path sync <workspace># 落攻击链
```

常用命令速查(完整见 `bun run run-pentest.ts --help`):

| 命令 | 用途 |
|---|---|
| `init <url>` / `run <url>` / `resume <ws>` / `auto <ws>` | 建/跑/续跑工作区;auto=无 AI 的确定性本地自动化;`run/resume` 加 `--max-agents <n>` 调并行度(默认 3) |
| `status <ws>` | 运行状态 |
| `traffic import-raw / import-har / import-burp` | 导入流量 |
| `surface add/list/link` | 维护攻击面图 |
| `http request <ws> <url>` | 发一个受 scope 约束的请求并留证据 |
| `coverage <ws> [mark\|waive\|mark-blocked\|list]` | 覆盖账本 |
| `knowledge prepare/read/note/list-notes` | 知识准备/渐进读取/写笔记 |
| `blackboard <ws> [list\|graph\|add\|update]` | 共享推理黑板 |
| `evidence read <ws> --evidence <id> --file <f>` | 证据输出分页读 |
| `attack-path <ws> [sync\|list\|graph\|status]` | 攻击路径 |
| `test-ledger <ws> [list\|summary\|record]` | 逐参数测试账本(哪个 URL+参数 测了什么类、结果如何) |
| `js analyze <ws>` / `js chase <ws> [--max-files] [--max-depth]` | JS 静态分析;chase=追 JS 引用的其他 JS(域内、去重、有界)并分析 |
| `fingerprint analyze <ws>` / `update [--source]` / `status` | 双源指纹匹配:Wappalyzer 7551 + FingerprintHub 3149(CN 覆盖);update=从 GitHub API 拉最新规则集 |
| `cve init / search / analyze` | CVE 分析(vulnify) |
| `correlation <ws>` | 攻击链扫描 + 落库 |
| `discover dirsearch` / `nmap` / `subdomains` | 主动侦察(需 approval) |
| `task list/claim/complete` | 任务生命周期 |

### 3. Web 控制台(只读监控)

```bash
# 首次或改前端后构建
bun run web:build

# 启动(API + 前端单端口)
bun run web/server.ts
# 浏览器打开 http://127.0.0.1:8787

# 开发模式(改前端热更新)
bun run web/server.ts --dev      # 终端 1:起 API(仅 /api)
bun run web:dev                  # 终端 2:Vite dev server http://localhost:5173(代理 /api)
```

14 个标签页:总览 / 信息收集(recon-summary+site-brief+知识笔记)/ **指纹**(技术/版本/类别/置信度/来源/受影响 CVE/命中证据)/ 攻击面图 / **站点地图**(树形)/ **攻击链** / 任务 / 发现 / 覆盖(含 blocked + **测试范围明细**)/ **语义覆盖**(矩阵:每参数 × 12 漏洞类的账本结果,回答"测过什么")/ 时间线 / 证据(分页读)/ 报告 / 黑板。

> 控制台是**只读监控**,不跑渗透;唯一写动作是"重新生成 recon-summary"。实时性靠轮询(5-15s)。

### 4. 独立工具(脚本)

```bash
bun run tools/recon-summary.ts <workspace>          # 生成信息收集汇总(recon-002 用)
bun run tools/site-brief.ts <workspace>             # 跨线程交接文档
bun run tools/site-map-html.ts <workspace>          # 独立站点地图 HTML
```

### 5. 测试 / 类型检查 / 构建

```bash
bun test packages/pentest-core/src/__tests__        # 全量单测(134 个)
bun run typecheck                                   # 项目 TS 检查
bun run web:typecheck                               # 控制台 TS 检查
bun run web:build                                   # 控制台前端构建
bun run build                                       # 全部包构建(生成 dist)
```

---

## 三、知识层

| 层 | 位置 | 用途 |
|---|---|---|
| POC 知识 | `references/knowledge/01-13` | 每类漏洞的真实 payload/CVE(从 456 个 Nuclei 模板提炼) |
| 方法论 | `references/methodology/`(24 篇,含 `hypothesis-disproof-discipline.md`) | 怎么测、怎么判定、证伪纪律 |
| 结构化规则 | `references/knowledge-records/*.json` | 信号匹配,命中生成假设任务 |
| agent 笔记 | `<workspace>/knowledge-notes/<role>/` | agent 沉淀实战心得(可写) |
| CVE 库 | `data/vulnify` | Vulnify 快照,`cve search` 查询 |

agent 的 prompt 会**内联"可用知识"菜单**(文件名/标题/行数/节数),按需用 `knowledge read` 渐进读取(索引→节树→单节),不一次全量。

---

## 四、操作纪律(重要)

1. **改代码 → 重启会话**:MCP 是常驻进程,改 `packages/*` 后必须重启 claude 会话才生效。
2. **可移植性**:整个 `AuAttack/` 目录可搬走,但要一起带走 `data/vulnify`(~2GB)和 `tools/`(dirsearch/nmap),否则 `cve init` 和主动侦察不可用。
3. **权限/审批**:POST/PUT/DELETE、dirsearch、nmap 都需要 approval(P2-P4),GET/HEAD 在自动预算内。scope 外请求会被 ScopeGuard 拒。
4. **报告 gate**:`pentest-report` 被 coverage gate 卡住,untested>0 不给报告。把节点测完,或用 `coverage waive`(不可达)/ `coverage mark-blocked`(前置缺失)关闭。
5. **黑板证伪**:假设任务完成/跳过会自动落黑板 Fact(confirmed)/Intent(rejected);rejected=死路,其他 agent 跳过。

---

## 五、已知问题(诚实清单)

- **pentest-core 是单体**:`state.ts` 4000+ 行,模块互引含循环依赖(state↔blackboard↔attackPath↔correlation)。运行期安全,但大重构需谨慎。
- **黑板是软约束**:状态机不强制,靠提示词自觉。
- **coverage blocked** 可能被拿来兜 gate:靠 blockReason 必填 + 可视化缓解,注意别滥用。
- **控制台无鉴权**:默认绑 127.0.0.1,只读;要远程访问先补鉴权。
- **agent 推理不落库**:只留黑板 + 笔记 + 证据(证据优先设计,非缺陷)。
