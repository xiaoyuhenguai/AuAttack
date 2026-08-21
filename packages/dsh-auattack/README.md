# dsh-auattack

把 **AuAttack 渗透测试引擎** 注册为 DeepSeek Harness (DSH) 的插件，三合一：

1. **MCP 工具** —— 通过官方 `@deepseek-ai/dsh-mcp-client` 把 AuAttack 的 MCP
   stdio server 挂载为 DSH agent 的**原生工具** `mcp__auattack__*`
   （pentest_workflow / pentest_http / pentest_browser / pentest_javascript /
   pentest_command / pentest_plan / pentest_coverage / pentest_report 等
   20 个），任意预设的 agent 都可直接驱动完整渗透工作流。
2. **AuAttack 模式（agent 预设）** —— 新建会话的预设选择器出现
   「AuAttack 模式」：渗透测试专家 persona + 完整标准工具面 + 工作流纪律。
3. **鲸鱼娘渗透阶段文案（复用 dsh-pet）** —— 不再自绘气泡：client 插件监听
   `mcp__auattack__*` 工具调用，把阶段文案经 `dsh-pet:say` 全局事件喂给
   **dsh-pet 宠物插件**，由鲸鱼娘自己的气泡显示（`作战会议 / 正在扫描他的
   环境 / 正在偷看 JS / 正在敲门试探 / 翻阅指纹档案 / 发现了宝藏 / 编写武器
   中 / 查看攻略中 / 整理战利品 / 撰写战报`，每句 2.6 秒后自动消失）。

   > ⚠️ 依赖 dsh-pet 的一个小补丁（其 `lib/client.js` 里加了
   > `window.addEventListener("dsh-pet:say", ...)` 入口，显示气泡走 pet 自身
   > 的 feedback 机制）。补丁位置：
   > `~/.dsh/profiles/web/node_modules/@linxin666/dsh-pet/lib/client.js`
   > （搜 `auattackSay`）。**升级 @linxin666/dsh-web-ui-all 后需重打补丁**。

## 安装

```bash
cd D:\ai\dsh
node apps\cli\lib\bin.js plugin --profile web add "D:/tools/Packet capture/Burp Suite/ai/AuAttack/packages/dsh-auattack"
```

> 若 pnpm 11 的 `minimumReleaseAge` 默认策略拦截（本机 @linxin666 0.2.5
> 系列新发布包），在 `~/.dsh/profiles/web/pnpm-workspace.yaml` 加
> `minimumReleaseAge: 0`；若路径含空格导致 pnpm 拆参，先在无空格路径建
> junction 再 add（如 `C:\Users\<你>\.dsh\plugins\dsh-auattack-link`）。

安装后**重启 dsh web**（`dsh web` 或桌面图标），然后**新建会话**：

- 预设选择器选 **「AuAttack 模式」**（persona + 工具 + 工作流）；
- 任意预设下也可直接用 `mcp__auattack__*` 工具；
- Web GUI 右下角出现鲸鱼娘气泡，跑渗透时实时切换阶段文案。

## 卸载

```bash
node apps\cli\lib\bin.js plugin --profile web remove dsh-auattack
```

## 组件清单

| 组件 | 路径 | 说明 |
|---|---|---|
| MCP 挂载行 | `cordis.patch.yml` | insert `auattack-mcp`（`@deepseek-ai/dsh-mcp-client`，stdio → AuAttack server） |
| 预设 | `presets/auattack/` | `preset.yml` + `agent.cordis.yml`（standard 裁剪 + 渗透 persona） |
| server 端 | `lib/index.js` | 启动时同步 presets 到 `~/.dsh/.agent-presets` + systemPrompt 段 |
| client 端 | `src/client/index.tsx` → `lib/client.js` | 鲸鱼娘气泡（订阅 mux 流监听 `mcp__auattack__*`） |

## 配置覆盖

工具超时等参数在 `~/.dsh/profiles/web/cordis.patch.yml` 覆盖：

```yaml
- id: auattack-mcp
  config:
    toolCallTimeoutMs: 1800000
```

## 重新构建 client bundle

```bash
cd packages\dsh-auattack
node "D:\ai\dsh\node_modules\tsdown\dist\run.mjs" --config tsdown.config.mjs --config-loader tsx
```

## 注意事项

- AuAttack 侧有独立 ScopeGuard 与审批门禁（POST/PUT/DELETE、dirsearch、
  nmap 需 approval），DSH 只负责传输调用。
- 工具名受 DSH 64 字符上限约束，AuAttack 工具名均在限内。
- 依赖 bun（WinGet 安装路径写在 `cordis.patch.yml` 的 `command`），bun 升级
  后需同步更新。
- client 端只注入 cordis 服务 `connection`，不 import 任何 DSH 内部包的值，
  符合 client bundle purity 约束。
