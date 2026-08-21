/**
 * dsh-auattack — DSH 插件 server 入口。
 *
 * 职责：
 *  1. cordis.patch.yml 把 AuAttack MCP server 挂为 `auattack-mcp` 行
 *     （@deepseek-ai/dsh-mcp-client，stdio），向所有 agent 暴露
 *     `mcp__auattack__*` 工具 —— 由 bundle 层完成，本文件不重复。
 *  2. 本文件（host half）启动时把 bundled `presets/` 树同步到
 *     `~/.dsh/.agent-presets`，让新建会话的预设选择器出现「AuAttack 模式」。
 *  3. 通过 systemPrompt section 向 agent 宣布本插件与 MCP 工具的存在。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

/** Resolve the DSH home directory (DSH_HOME env wins, else ~/.dsh). */
function dshHome() {
  const raw = process.env.DSH_HOME
  if (raw !== undefined && raw.trim() !== '') {
    const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw
    return isAbsolute(expanded) ? expanded : join(process.cwd(), expanded)
  }
  return join(homedir(), '.dsh')
}

/** Absolute path of the bundled preset tree inside this package. */
function bundledPresetsRoot() {
  return fileURLToPath(new URL('../presets/', import.meta.url))
}

const MTIME_TOLERANCE_MS = 1000

function filesUnder(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else out.push(path)
    }
  }
  walk(root)
  return out
}

function sameFile(a, b) {
  const sa = statSync(a)
  const sb = statSync(b)
  if (sa.size !== sb.size) return false
  if (Math.abs(sa.mtimeMs - sb.mtimeMs) > MTIME_TOLERANCE_MS) return false
  return readFileSync(a).equals(readFileSync(b))
}

/** Copy whole tree; per-entry primitives (fs.cpSync crashes on CJK paths in Node 22 on Windows). */
function copyTreeSync(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true })
  for (const entry of readdirSync(sourceDir)) {
    const source = join(sourceDir, entry)
    const target = join(targetDir, entry)
    const stat = statSync(source)
    if (stat.isDirectory()) copyTreeSync(source, target)
    else {
      copyFileSync(source, target)
      utimesSync(target, stat.atime, stat.mtime)
    }
  }
}

function pruneExtras(root, keep) {
  const parents = new Set()
  for (const file of filesUnder(root)) {
    if (!keep.has(relative(root, file))) {
      parents.add(dirname(file))
      rmSync(file, { force: true })
    }
  }
  for (const start of parents) {
    let dir = start
    while (dir !== undefined && relative(root, dir) !== '') {
      if (existsSync(dir) && readdirSync(dir).length === 0) {
        rmSync(dir, { recursive: true, force: true })
        dir = dirname(dir)
      } else dir = undefined
    }
  }
}

/** Copy `sourceRoot/<id>` into `targetRoot/<id>`, idempotently. */
function syncOnePreset(sourceDir, targetDir) {
  const sourceFiles = filesUnder(sourceDir)
  const sourceSet = new Set(sourceFiles.map((f) => relative(sourceDir, f)))
  if (existsSync(targetDir) && !statSync(targetDir).isDirectory()) {
    rmSync(targetDir, { recursive: true, force: true })
  }
  if (!existsSync(targetDir)) {
    copyTreeSync(sourceDir, targetDir)
    pruneExtras(targetDir, sourceSet)
    return 'synced'
  }
  let dirty = false
  for (const file of sourceFiles) {
    const dest = join(targetDir, relative(sourceDir, file))
    if (!existsSync(dest) || !sameFile(file, dest)) { dirty = true; break }
  }
  if (!dirty) {
    for (const file of filesUnder(targetDir)) {
      if (!sourceSet.has(relative(targetDir, file))) { dirty = true; break }
    }
  }
  if (!dirty) return 'current'
  pruneExtras(targetDir, sourceSet)
  copyTreeSync(sourceDir, targetDir)
  pruneExtras(targetDir, sourceSet)
  return 'synced'
}

/** Sync every preset dir under sourceRoot into targetRoot (harness-home .agent-presets). */
function syncPresetTrees(sourceRoot, targetRoot) {
  const result = { synced: [], current: [], failed: [] }
  mkdirSync(targetRoot, { recursive: true })
  if (!existsSync(sourceRoot)) return result
  for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry)
    if (!statSync(source).isDirectory()) continue
    const id = basename(source)
    try {
      const outcome = syncOnePreset(source, join(targetRoot, id))
      if (outcome === 'synced') result.synced.push(id)
      else result.current.push(id)
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}

/** Stable cordis plugin name. */
export const name = 'dsh-auattack'

/** Prompt assembly must exist before the announcement section can register. */
export const inject = ['systemPrompt']

/** Model-facing announcement: plugin presence and the AuAttack tool surface. */
export const AUATTACK_GUIDANCE =
  '本机已安装 dsh-auattack 插件（AuAttack 渗透测试引擎）：通过 @deepseek-ai/dsh-mcp-client 把 AuAttack 的 MCP stdio server 挂载为原生工具 `mcp__auattack__*`（pentest_workflow / pentest_state / pentest_http / pentest_browser / pentest_javascript / pentest_command / pentest_plan / pentest_coverage / pentest_report 等 20 个）。新建会话的预设选择器中可选「AuAttack 模式」（persona + 完整工具面 + 工作流纪律）。开始评估时先调 pentest_workflow 并跟随返回的阶段顺序；只对授权目标操作；提交 candidate 发现需带 workspace 相对证据；收尾前跑 pentest coverage 并记录 knowledge note。用户提到「AuAttack / 渗透测试 / pentest」时即指本插件，请据此协作。'

/** Section order inside the tool-guidance band. */
const SECTION_ORDER = 152

export function apply(ctx, config = {}) {
  const announceToAgent = config.announceToAgent !== false
  const sync = () => {
    const targetRoot = join(dshHome(), '.agent-presets')
    try {
      const result = syncPresetTrees(bundledPresetsRoot(), targetRoot)
      for (const { id, error } of result.failed) ctx.logger?.warn?.(`dsh-auattack: preset ${id} sync failed: ${error}`)
      if (result.synced.length > 0) ctx.logger?.info?.(`dsh-auattack: presets synced into ${targetRoot}: ${result.synced.join(', ')}`)
    } catch (error) {
      ctx.logger?.warn?.(`dsh-auattack: preset sync failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  let disposeSection
  const refresh = () => {
    disposeSection?.()
    disposeSection = undefined
    sync()
    if (announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:dsh-auattack',
        order: SECTION_ORDER,
        text: AUATTACK_GUIDANCE,
      })
    }
  }
  refresh()
  ctx.effect(() => () => {
    disposeSection?.()
    disposeSection = undefined
  }, 'dsh-auattack: announcement')
}
