/**
 * dsh-auattack browser half — 鲸鱼娘渗透阶段文案（桥接 dsh-pet）。
 *
 * 订阅 dsh 的 mux 事件流（ctx.connection.api.events.mux），监听
 * `mcp__auattack__*` 工具调用（tool/call / tool/result），把渗透阶段
 * 的「感情丰富」台词通过 `window.dispatchEvent(new CustomEvent('dsh-pet:say'))`
 * 喂给 dsh-pet 插件（其 lib/client.js 含对应补丁），由鲸鱼娘气泡显示。
 *
 * 台词设计：每个阶段一个台词池，随机抽取且避免连续重复；工具失败
 * （tool/result isError）时切换「翻车」台词池。
 */

/** Cordis client services required by this plugin. */
export const inject = ['connection']

/** 台词池：阶段 → 候选句（随机抽取）。 */
const LINE_POOLS: Array<[RegExp, string[]]> = [
  // 作战会议 / 初始化
  [/pentest_workflow|pentest_command["'\s\[]*["']?(init|run|resume)["']?/, [
    '作战会议开始！让鲸鱼娘看看今天要从哪下手～',
    '目标已锁定！先摸摸它的脾气再说',
    '开工开工！鲸鱼娘已经摩拳擦掌啦',
    '任务收到！今天也要满载而归～',
  ]],
  // 扫描环境 / 目录 / 表面发现
  [/pentest_browser|browser["'\s\[]*discover|pentest_command["'\s\[]*["']discover/, [
    '正在扫描他的环境…嘿嘿，门在哪呢？',
    '把每个角落都翻一遍，藏再深也能找出来',
    '侦察中！鲸鱼娘的眼睛可是很尖的',
    '东看看西看看，这家装修不错嘛…',
  ]],
  // 子域名
  [/subdomain/, [
    '去翻翻子域名，看看有没有旁门左道…',
    '旁敲侧击找入口，总有一条路是通的',
  ]],
  // 端口扫描
  [/\bnmap\b|port["'\s\[]*scan/, [
    '端口扫描中…哪个门开着呢？',
    '挨个敲门试锁，总有粗心大意的一扇',
  ]],
  // JS 分析
  [/pentest_javascript|pentest_command["'\s\[]*["']js["']|\bjs (analyze|chase)\b/, [
    '正在偷看 JS…让我康康你藏了什么小秘密',
    '哇，这前端代码写得…有点意思啊',
    'JS 里翻翻找找，说不定有惊喜',
    '在脚本堆里淘宝，接口密钥统统交出来！',
  ]],
  // Nuclei
  [/\bnuclei\b/, [
    'Nuclei 模板轰一遍，看看谁先顶不住',
    '拿起模板库扫射…中一个是一个！',
  ]],
  // HTTP / 试探
  [/pentest_http|pentest_replay|pentest_command["'\s\[]*["']http["']|\breplay|\bprobe\b/, [
    '敲敲门～有人在家吗？不出来我可就进去了哦',
    '试探一下反应，看看它会不会害羞',
    '发个小请求试试水，愿者上钩',
    '轻轻戳一下，看看哪里会疼',
  ]],
  // 指纹 / CVE
  [/fingerprint|\bcve\b/, [
    '翻翻指纹档案，看看你是什么来头',
    '哦～原来是这个框架，老熟人了',
    '比对 CVE 中…你的版本好像有点危险哦',
    '指纹对上号了，这下好办多了',
  ]],
  // 发现宝藏
  [/submit_finding|submitfinding|candidate|confirmed|reproduced/, [
    '发现了宝藏！✨ 这波不亏！',
    '有戏有戏！这个洞够深，能钻',
    '抓到小尾巴了！让我顺着摸下去',
    '哟呵，这漏洞长得真标致',
  ]],
  // 武器 / POC / 验证
  [/pentest_command["'\s\[]*["']poc["']|\bpoc\b|\bvalidation\b|\bmutate\b|\bcompare\b/, [
    '编写武器中…给这个洞量身定制一发',
    '打磨 exploit…手感不错',
    '装填弹药！准备验证一下',
    '给漏洞穿上新衣裳，换个姿势再来',
  ]],
  // 知识 / 计划 / 攻略
  [/knowledge["'\s\[]*read|pentest_command["'\s\[]*["']knowledge["']|\bplan\b/, [
    '查看攻略中…知己知彼百战不殆',
    '翻翻方法论，别踩前人踩过的坑',
    '研究一下这个漏洞的正确打开方式',
    '前辈们留下的经验，鲸鱼娘要好好学',
  ]],
  // 覆盖 / 关联 / 战利品
  [/coverage|correlation|completeness|matrix/, [
    '整理战利品…数数今天收获了几个洞',
    '清点战果中，一个都不能漏',
    '把发现串成攻击链，看看能不能连招',
  ]],
  // 报告
  [/pentest_report|pentest_command["'\s\[]*["']report["']/, [
    '撰写战报…让甲方看得懂的高大上文案',
    '把战果写成报告，附上证据链',
    '收工写报告！这个客户下回还找我',
  ]],
  // 移动端
  [/mobile|\bapk\b/, [
    '拆卸移动端…让我看看 App 里藏了什么',
    '反编译中…这不就是说明书嘛',
    'App 的小秘密，鲸鱼娘都要扒出来',
  ]],
  // 验证码
  [/\bcaptcha\b/, [
    '验证码？让鲸鱼娘用 ddddocr 秒破一个',
    '区区验证码，挡不住鲸鱼娘的',
  ]],
]

/** 翻车台词池（工具失败时）。 */
const OOPS_POOL: string[] = [
  '诶？翻车了…换个姿势再来一次',
  '被拦住了！哼，这点小障碍难不倒鲸鱼娘',
  'WAF 挡路？看来要动点脑筋了',
  '这波没成…但思路是对的，继续磨',
  '服务器说「不行」…那我就偏要试试',
]

/** 分析台词池（渗透活跃期，agent 纯思考/输出时偶尔插话）。 */
const ANALYSIS_POOL: string[] = [
  '分析数据中…让我捋捋思路',
  '思考中…这目标有点门道',
  '推算攻击路径中…',
  '整理线索…马上就有头绪了',
  '嗯…这里有点意思，先记下来',
  '翻翻刚才的结果…好像有戏',
  '在脑子里过一遍攻防…嗯，可行',
  '这响应有点怪…让我品一品',
]

/** 潜行台词池（其他 AuAttack 工具）。 */
const SNEAK_POOL: string[] = [
  '潜行中…别出声',
  '到处溜达溜达，看看有没有漏网的',
  '屏住呼吸，慢慢摸过去…',
  '这目标有点意思，鲸鱼娘要好好玩',
]

/** 上次说过的台词（避免连续重复）。 */
let lastLine = ''

/** 从池里随机取一句，避免与上一句相同。 */
function pickLine(pool: string[]): string {
  const candidates = pool.length > 1 ? pool.filter((line) => line !== lastLine) : pool
  const line = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]
  lastLine = line
  return line
}

/** 把 AuAttack 工具名/参数映射成阶段台词池。 */
export function poolFor(tool: string, argsText: string): string[] {
  const hay = `${tool} ${argsText}`.toLowerCase()
  for (const [re, pool] of LINE_POOLS) {
    if (re.test(hay)) return pool
  }
  return SNEAK_POOL
}

/** 取一句阶段台词（随机、去重）。 */
export function stageFor(tool: string, argsText: string): string {
  return pickLine(poolFor(tool, argsText))
}

/** 让鲸鱼娘说一句话（经 dsh-pet 的补丁事件入口）。 */
function petSay(text: string): void {
  try {
    window.dispatchEvent(new CustomEvent('dsh-pet:say', { detail: text }))
  } catch {
    /* pet 未装或未启用时静默 */
  }
}

/** 订阅 mux 事件流，把 AuAttack 工具调用转成鲸鱼娘气泡。 */
async function pumpMux(mux: (...args: unknown[]) => unknown, signal: AbortSignal): Promise<void> {
  // ── 多会话「最近活跃优先」策略 ──────────────────────────────────────────
  // 同一时刻只播报最近活跃的那个渗透会话：其他会话的 AuAttack 调用在
  // 活跃窗口内被压住，避免两个任务来回抢话。活跃窗口 3 秒，超时后由
  // 最新调用的会话接管。
  let activeSessionId: string | undefined
  let activeUntil = 0
  const ACTIVE_WINDOW_MS = 3_000
  // 每个会话最近一次 AuAttack 活动时间（判断「渗透活跃期」用）。
  const lastAuattackBySession = new Map<string, number>()
  // 有未结算 AuAttack tool/call 的会话（翻车吐槽归属）。
  const pendingBySession = new Set<string>()
  // 节流：分析台词与上一条台词的最小间隔。
  let lastSayAt = 0
  let lastAnalysisAt = 0
  const now = () => Date.now()
  const say = (text: string): void => {
    petSay(text)
    lastSayAt = now()
  }
  // 渗透活跃期内、模型纯输出（分析/回复）时，偶尔插一句分析台词。
  // 只给当前活跃会话插话，且该会话最近确有 AuAttack 活动。
  const maybeAnalysisLine = (sessionId: string): void => {
    const t = now()
    const sessionActive = sessionId === activeSessionId
    const inActivePentest = (lastAuattackBySession.get(sessionId) ?? 0) + 90_000 > t
    const analysisCooldown = t - lastAnalysisAt > 30_000
    const sayGap = t - lastSayAt > 8_000
    if (sessionActive && inActivePentest && analysisCooldown && sayGap) {
      lastAnalysisAt = t
      say(pickLine(ANALYSIS_POOL))
    }
  }
  // 「最近活跃优先」裁决：只有当前活跃会话（或空闲后最新调用者）可播报。
  const isActiveSpeaker = (sessionId: string, t: number): boolean => {
    if (activeSessionId === undefined) return true
    if (sessionId === activeSessionId) return true
    if (t >= activeUntil) return true // 活跃窗口过期，允许接管
    return false
  }
  try {
    // @ts-expect-error — RpcRequest envelope shape
    const stream = mux({ rpcId: `auattack-pet-${Math.random().toString(36).slice(2)}`, payload: {} }, signal)
    if (stream === undefined || typeof stream[Symbol.asyncIterator] !== 'function') return
    for await (const envelope of stream as AsyncIterable<{
      payload?: {
        type?: string
        sessionId?: string
        event?: {
          type?: string
          data?: {
            name?: unknown
            arguments?: unknown
            message?: { content?: Array<{ isError?: boolean }> }
          }
        }
      }
    }>) {
      if (signal.aborted) break
      const frame = envelope?.payload
      if (frame?.type !== 'session/event') continue
      const sessionId = String(frame.sessionId ?? '')
      const event = frame.event
      if (event?.type === 'tool/call') {
        const name = String(event.data?.name ?? '')
        const isAuattack = name.startsWith('mcp__auattack__')
        if (isAuattack) pendingBySession.add(sessionId)
        else pendingBySession.delete(sessionId)
        if (!isAuattack) continue
        const t = now()
        lastAuattackBySession.set(sessionId, t)
        if (!isActiveSpeaker(sessionId, t)) continue // 另一个会话在活跃窗口内，压住
        activeSessionId = sessionId
        activeUntil = t + ACTIVE_WINDOW_MS
        const args = typeof event.data?.arguments === 'string' ? event.data.arguments : JSON.stringify(event.data?.arguments ?? {})
        say(stageFor(name, args))
      } else if (event?.type === 'tool/result' && pendingBySession.delete(sessionId)) {
        // 翻车吐槽只属于活跃会话；被压住的会话静默结算。
        const t = now()
        if (sessionId === activeSessionId && t < activeUntil) {
          const isError = event.data?.message?.content?.[0]?.isError === true
          if (isError) say(pickLine(OOPS_POOL))
        }
        // 成功时不说「搞定」——阶段台词已展示，避免抢话。
      } else if (event?.type === 'assistant/message') {
        // 模型开始输出（分析/思考/回复）——仅活跃会话偶尔插一句。
        maybeAnalysisLine(sessionId)
      }
    }
  } catch (error) {
    if (!signal.aborted) console.warn('[dsh-auattack] mux stream error:', error)
  }
}

/**
 * 挂载鲸鱼娘文案桥。
 * @param ctx - client root context（含注入的 connection 服务）。
 */
export function apply(ctx: { connection?: unknown; effect?: (fn: () => () => void, name?: string) => void }): void {
  try {
    const connection = ctx.connection as { api?: { events?: { mux?: unknown } } } | undefined
    const mux = connection?.api?.events?.mux
    if (typeof mux !== 'function') {
      console.warn('[dsh-auattack] connection api unavailable; pet say bridge idle')
      return
    }
    const abort = new AbortController()
    void pumpMux(mux, abort.signal)
    // 开机自检：等 pet 挂载后主动说一句，用户刷新页面即可立刻确认链路。
    const bootSay = window.setTimeout(() => petSay('🐳 待命中…有需要渗透的目标吗？'), 3000)
    ctx.effect?.(() => () => {
      window.clearTimeout(bootSay)
      abort.abort()
    }, 'dsh-auattack: pet say bridge')
    console.info('[dsh-auattack] 鲸鱼娘文案桥已就绪，监听 mcp__auattack__* 工具调用 → dsh-pet:say')
  } catch (error) {
    console.warn('[dsh-auattack] pet say bridge mount failed:', error)
  }
}
