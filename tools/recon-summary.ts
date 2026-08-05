#!/usr/bin/env bun
/**
 * 信息收集阶段汇总生成器 —— recon-002 阶段的闭合交付物
 *
 * 确定性汇总以下内容到 `reports/recon-summary.md`：
 *   0. 阶段总览（目录/API/敏感信息/指纹/测试方向 计数 + 流量来源）
 *   1. 目录清单（由 route 推导 + 403 绕过候选词表交叉引用）
 *   2. API 清单（route + method + parameter，标注 API 特征）
 *   3. 敏感信息（扫描已导入流量响应体：正则 + 关键词频统计）
 *   4. 技术指纹（technology 节点 + CVE/knowledge/POC 命中）
 *   5. 测试方向（route→角色 映射 + CVE/POC 方向，带优先级）
 *
 * 幂等可重跑：中途新发现后重新运行即刷新（recon-reopen）。写入后调用
 * recordReconSummary 记录 integrations.reconSummary，recon-002 完成依赖它。
 *
 * 用法:
 *   bun run tools/recon-summary.ts <workspace> [--out path]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  loadState,
  recordReconSummary,
} from '../packages/pentest-core/src/state.ts'
import { inferCoverageRole } from '../packages/pentest-core/src/coverage.ts'
import { analyzeFingerprints } from '../packages/pentest-core/src/fingerprint.ts'
import type {
  PentestState,
  PentestAgentRole,
  SurfaceNode,
} from '../packages/pentest-core/src/types.ts'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const MAX_SENSITIVE_PER_PATTERN = 5
const MAX_SENSITIVE_TOTAL = 300
const MAX_DIRECTORIES = 60
const MAX_DIRECTION_ENDPOINTS = 6

const WORDLIST_PATHS = {
  '403-bypass': resolve(import.meta.dir, '..', '403list.txt'),
  'jsfind': resolve(import.meta.dir, '..', 'jsfind403list.txt'),
} as const

/** 敏感信息正则（名称 -> 正则；匹配值即线索） */
const SENSITIVE_PATTERNS: Array<{
  name: string
  regex: RegExp
  kind: 'secret' | 'identity' | 'path'
}> = [
  { name: 'AWS_ACCESS_KEY', regex: /\bAKIA[0-9A-Z]{16}\b/g, kind: 'secret' },
  { name: 'GITHUB_TOKEN', regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, kind: 'secret' },
  { name: 'SLACK_TOKEN', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, kind: 'secret' },
  { name: 'GOOGLE_API_KEY', regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, kind: 'secret' },
  { name: 'PRIVATE_KEY', regex: /-----BEGIN(?: [A-Z ]+)?PRIVATE KEY(?: BLOCK)?-----/g, kind: 'secret' },
  { name: 'JWT', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, kind: 'secret' },
  { name: 'BEARER_TOKEN', regex: /\bBearer\s+[A-Za-z0-9._~+\-/]{20,}\b/g, kind: 'secret' },
  { name: 'ASSIGNED_SECRET', regex: /\b(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token)\s*[=:]\s*['"]?([A-Za-z0-9_\-.]{12,})['"]?/gi, kind: 'secret' },
  { name: 'INTERNAL_IP', regex: /\b(?:10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}|192\.168\.\d{1,3})\.\d{1,3}\b/g, kind: 'identity' },
  { name: 'INTERNAL_HOST', regex: /\b(?:[a-z0-9-]+\.)+(?:internal|local|lan|intranet|corp)(?:\.|:|\/|$)/gi, kind: 'identity' },
  { name: 'EMAIL', regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, kind: 'identity' },
  { name: 'CN_MOBILE', regex: /\b1[3-9]\d{9}\b/g, kind: 'identity' },
  { name: 'GIT_EXPOSURE', regex: /(?:\.git\/|\.svn\/|\.env\b|config\.php|backup|dump\.sql|\.sql\.bak)/gi, kind: 'path' },
]

/** 响应体关键词频统计词表 */
const KEYWORD_FREQUENCY = [
  'password', 'passwd', 'secret', 'token', 'apikey', 'api_key', 'access_key',
  'authorization', 'bearer', 'session', 'cookie', 'admin', 'config', 'backup',
  'dump', 'swagger', 'upload', 'export', 'internal', 'localhost', '127.0.0.1',
]

const DIRECTION_PRIORITY = new Map<PentestAgentRole, number>([
  ['poc-agent', 0],
  ['auth-agent', 1],
  ['file-agent', 2],
  ['business-agent', 3],
  ['injection-agent', 4],
])

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function isApiLike(pathname: string): boolean {
  return (
    /^\/(?:api(?:\/|$)|v\d+(?:\/|$))/i.test(pathname) ||
    /\.(json|php|do|action|aspx|ashx)(?:\/|$)/i.test(pathname)
  )
}

function routeInfo(node: SurfaceNode): { method: string; pathname: string } {
  const raw = node.attributes?.url ? String(node.attributes.url) : node.value
  let method = node.attributes?.method ? String(node.attributes.method) : 'GET'
  let pathname = raw
  try {
    const u = new URL(raw)
    return { method, pathname: u.pathname }
  } catch {
    /* not a full URL */
  }
  const match = raw.match(/^([A-Z]+)\s+(.+)$/)
  if (match) {
    method = match[1]
    pathname = match[2]
  }
  const query = pathname.indexOf('?')
  if (query >= 0) pathname = pathname.slice(0, query)
  return { method, pathname }
}

function routeParams(state: PentestState, routeNode: SurfaceNode): string[] {
  const { pathname } = routeInfo(routeNode)
  const result: string[] = []
  for (const node of state.surface.nodes) {
    if (node.kind !== 'parameter') continue
    const attrRoute =
      typeof node.attributes?.route === 'string'
        ? node.attributes.route
        : ''
    const value = node.value
    // 仅当参数显式归属该路由或其一级子路径时关联，避免根路径 `/` 误配所有参数
    if (
      attrRoute &&
      (attrRoute === pathname ||
        pathname.startsWith(attrRoute + '/') ||
        attrRoute.startsWith(pathname + '/'))
    ) {
      result.push(value)
    }
  }
  return [...new Set(result)]
}

/* ------------------------------------------------------------------ */
/* 1. 目录清单                                                          */
/* ------------------------------------------------------------------ */

function directoryInventory(state: PentestState): {
  counts: Map<string, { count: number; samples: string[] }>
  wordlistHits: string[]
} {
  const counts = new Map<string, { count: number; samples: string[] }>()
  for (const node of state.surface.nodes) {
    if (node.kind !== 'route') continue
    const { pathname } = routeInfo(node)
    const segments = pathname.split('/').filter(Boolean)
    const prefixes = new Set<string>()
    for (let depth = 1; depth <= Math.min(2, segments.length); depth++) {
      prefixes.add('/' + segments.slice(0, depth).join('/'))
    }
    for (const prefix of prefixes) {
      const entry = counts.get(prefix) ?? { count: 0, samples: [] }
      entry.count++
      if (entry.samples.length < 3) entry.samples.push(node.value)
      counts.set(prefix, entry)
    }
  }
  const wordlistHits: string[] = []
  const routePaths = new Set(
    state.surface.nodes
      .filter(n => n.kind === 'route')
      .map(n => routeInfo(n).pathname),
  )
  for (const [label, file] of Object.entries(WORDLIST_PATHS)) {
    if (!existsSync(file)) continue
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const entry = raw.trim().replace(/^!/, '')
      if (!entry) continue
      const normalized = entry.startsWith('/') ? entry : `/${entry}`
      // 根路径与过短条目必然存在，无 403 绕过参考价值
      if (normalized === '/' || normalized.length < 3) continue
      const hit = [...routePaths].some(path =>
        path === normalized ||
        path.startsWith(normalized + '/') ||
        path.endsWith(normalized),
      )
      if (hit) wordlistHits.push(`${label}:${normalized}`)
    }
  }
  return { counts, wordlistHits }
}

/* ------------------------------------------------------------------ */
/* 3. 敏感信息                                                          */
/* ------------------------------------------------------------------ */

interface SensitiveHit {
  pattern: string
  value: string
  url: string
}

function isTextish(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false
  if (buffer.length === 0) return true
  let printable = 0
  const limit = Math.min(buffer.length, 64 * 1024)
  for (let i = 0; i < limit; i++) {
    const byte = buffer[i]
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127)) printable++
  }
  return printable / limit > 0.8
}

function responseBody(buffer: Buffer): string {
  const marker = buffer.indexOf('\r\n\r\n')
  const marker2 = marker < 0 ? buffer.indexOf('\n\n') : marker
  return marker2 < 0 ? buffer.toString('utf8') : buffer.toString('utf8', marker2 + (buffer[marker2 + 1] === 10 ? 2 : 4))
}

function scanSensitiveInfo(state: PentestState): {
  hits: SensitiveHit[]
  keywords: Array<[string, number]>
} {
  const hits: SensitiveHit[] = []
  const keywordCounts = new Map<string, number>()
  const seen = new Set<string>()

  for (const record of state.traffic) {
    if (!record.responseRawPath) continue
    const path = resolve(state.run.workspace, record.responseRawPath)
    if (!existsSync(path)) continue
    let buffer: Buffer
    try {
      buffer = readFileSync(path)
    } catch {
      continue
    }
    if (buffer.length === 0 || buffer.length > MAX_RESPONSE_BYTES) continue
    if (!isTextish(buffer)) continue
    const body = responseBody(buffer)
    if (body.length > MAX_RESPONSE_BYTES) continue

    for (const pattern of SENSITIVE_PATTERNS) {
      let perPattern = 0
      for (const match of body.matchAll(pattern.regex)) {
        const value = match[0].slice(0, 200)
        const dedupeKey = `${pattern.name}:${value}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        hits.push({ pattern: pattern.name, value, url: record.url })
        if (++perPattern >= MAX_SENSITIVE_PER_PATTERN) break
        if (hits.length >= MAX_SENSITIVE_TOTAL) break
      }
      if (hits.length >= MAX_SENSITIVE_TOTAL) break
    }
    for (const keyword of KEYWORD_FREQUENCY) {
      const count = (body.toLowerCase().match(new RegExp(`\\b${keyword}\\b`, 'g')) ?? []).length
      if (count > 0) keywordCounts.set(keyword, (keywordCounts.get(keyword) ?? 0) + count)
    }
  }
  const keywords = [...keywordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  return { hits, keywords }
}

/* ------------------------------------------------------------------ */
/* 4. 指纹                                                              */
/* ------------------------------------------------------------------ */

function fingerprintRows(state: PentestState): {
  rows: string[]
  count: number
} {
  const cve = state.integrations.cveAnalysis
  const affected = cve?.affectedCveIds ?? []
  const rows: string[] = []
  for (const node of state.surface.nodes) {
    if (node.kind !== 'technology') continue
    const version =
      typeof node.attributes?.version === 'string' ? node.attributes.version : ''
    const product =
      typeof node.attributes?.product === 'string' ? node.attributes.product : ''
    const techName = product || node.value
    const matched = affected.length > 0 ? affected.join(', ') : ''
    const evidence =
      typeof node.attributes?.fingerprintEvidence === 'string'
        ? node.attributes.fingerprintEvidence.slice(0, 80)
        : ''
    rows.push(
      `| \`${escapeCell(node.value)}\` | ${escapeCell(version)} | ${escapeCell(evidence)} | ${escapeCell(matched)} |`,
    )
  }
  if (rows.length === 0) rows.push('| — | — | — | — |')
  return { rows, count: state.surface.nodes.filter(n => n.kind === 'technology').length }
}

/* ------------------------------------------------------------------ */
/* 5. 测试方向                                                          */
/* ------------------------------------------------------------------ */

function directionRows(state: PentestState): {
  rows: string[]
  byRole: Map<PentestAgentRole, number>
} {
  const byRole = new Map<PentestAgentRole, number>()
  const grouped = new Map<PentestAgentRole, Array<{ node: SurfaceNode; api: boolean; hasParams: boolean }>>()
  for (const node of state.surface.nodes) {
    if (node.kind !== 'route') continue
    const { pathname } = routeInfo(node)
    // 角色推断用净化节点：丢弃 statusCode/trafficId 等属性，避免 "status" 等
    // 噪声词污染正则匹配
    const sanitized: SurfaceNode = {
      id: node.id,
      kind: 'route',
      value: node.value,
      source: node.source,
      attributes:
        typeof node.attributes?.url === 'string'
          ? { method: node.attributes.method ?? 'GET', url: node.attributes.url }
          : {},
      createdAt: node.createdAt,
    }
    const role = inferCoverageRole(sanitized)
    const hasParams = routeParams(state, node).length > 0
    grouped.set(role, [...(grouped.get(role) ?? []), { node, api: isApiLike(pathname), hasParams }])
  }
  const pocCves = state.integrations.cveAnalysis?.affectedCveIds ?? []
  const rows: string[] = []
  for (const [role, items] of grouped) {
    if (items.length === 0) continue
    byRole.set(role, items.length)
    const sorted = [...items].sort((a, b) => {
      const pa = (a.api ? 2 : 0) + (a.hasParams ? 1 : 0)
      const pb = (b.api ? 2 : 0) + (b.hasParams ? 1 : 0)
      return pb - pa
    })
    const top = sorted
      .slice(0, MAX_DIRECTION_ENDPOINTS)
      .map(item => {
        const tags = [item.api ? 'api' : '', item.hasParams ? '有参数' : ''].filter(Boolean).join('/')
        return `\`${escapeCell(item.node.value)}\`${tags ? `(${tags})` : ''}`
      })
      .join(', ')
    rows.push(`| ${role} | ${items.length} | ${top} |`)
  }
  if (pocCves.length > 0) {
    rows.push(`| poc-agent | CVE ${pocCves.join(', ')} | 受影响技术需核对版本与公开 POC |`)
    byRole.set('poc-agent', (byRole.get('poc-agent') ?? 0) + pocCves.length)
  }
  if (rows.length === 0) rows.push('| — | 0 | 无待测端点 |')
  return { rows, byRole }
}

/* ------------------------------------------------------------------ */
/* 主流程                                                              */
/* ------------------------------------------------------------------ */

function buildSummary(state: PentestState): string {
  const { counts: dirs, wordlistHits } = directoryInventory(state)
  const sensitive = scanSensitiveInfo(state)
  const fingerprints = fingerprintRows(state)
  const directions = directionRows(state)

  const sortedDirs = [...dirs.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, MAX_DIRECTORIES)

  const apiNodes = state.surface.nodes.filter(n => {
    if (n.kind !== 'route') return false
    return isApiLike(routeInfo(n).pathname)
  })

  const lines: string[] = []
  lines.push('# 信息收集阶段汇总（Recon Summary）', '')
  lines.push(`> 目标: \`${state.run.targetUrl}\` · 生成时间: ${new Date().toISOString()} · 阶段: 信息收集闭合交付物`, '')
  lines.push('', '## 0. 阶段总览', '', '| 项目 | 数量 |', '| --- | --- |')
  lines.push(`| 目录（前缀，含子目录） | ${sortedDirs.length} |`)
  lines.push(`| API 类路由 | ${apiNodes.length} |`)
  lines.push(`| 敏感信息线索 | ${sensitive.hits.length} |`)
  lines.push(`| 技术指纹 | ${fingerprints.count} |`)
  lines.push(`| 测试方向（按角色） | ${directions.byRole.size} 组 / ${[...directions.byRole.values()].reduce((a, b) => a + b, 0)} 项 |`)
  const sources = new Map<string, number>()
  for (const record of state.traffic) sources.set(record.source, (sources.get(record.source) ?? 0) + 1)
  lines.push(
    `| 导入流量 | ${state.traffic.length}（${[...sources.entries()].map(([k, v]) => `${k}=${v}`).join(', ') || '无'}，untrusted=${state.traffic.filter(r => r.metadata?.trusted !== true).length}） |`,
    '',
  )

  lines.push('## 1. 目录清单', '')
  if (sortedDirs.length === 0) {
    lines.push('未发现路由节点。', '')
  } else {
    lines.push('| 目录前缀 | 命中路由数 | 示例 |', '| --- | --- | --- |')
    for (const [prefix, entry] of sortedDirs) {
      lines.push(`| \`${escapeCell(prefix)}\` | ${entry.count} | ${entry.samples.map(s => `\`${escapeCell(s)}\` `).join('')} |`)
    }
  }
  if (wordlistHits.length > 0) {
    lines.push('', `**403 绕过词表命中（已确认存在）**: ${wordlistHits.map(h => `\`${escapeCell(h)}\``).join(' ')}`)
  }
  lines.push('')

  lines.push('## 2. API 清单', '')
  if (apiNodes.length === 0) {
    lines.push('未发现 API 类路由。', '')
  } else {
    lines.push('| 方法 | 路径 | 参数 | 来源 |', '| --- | --- | --- | --- |')
    for (const node of apiNodes) {
      const { method, pathname } = routeInfo(node)
      const params = routeParams(state, node)
      lines.push(
        `| ${method} | \`${escapeCell(pathname)}\` | ${params.map(p => `\`${escapeCell(p)}\``).join(' ')} | ${escapeCell(node.source)} |`,
      )
    }
  }
  lines.push('')

  lines.push('## 3. 敏感信息', '')
  if (sensitive.hits.length === 0) {
    lines.push('扫描已导入流量响应体未发现匹配线索（或响应体为空/二进制）。', '')
  } else {
    lines.push('| 类型 | 线索(脱敏截断) | 来源 URL |', '| --- | --- | --- |')
    for (const hit of sensitive.hits.slice(0, 80)) {
      lines.push(`| ${hit.pattern} | \`${escapeCell(hit.value)}\` | \`${escapeCell(hit.url)}\` |`)
    }
  }
  if (sensitive.keywords.length > 0) {
    lines.push('', '**响应体关键词频 Top**: ' +
      sensitive.keywords.map(([k, n]) => `${k}=${n}`).join(', '))
  }
  lines.push('')

  lines.push('## 4. 技术指纹', '')
  lines.push('| 技术 | 版本 | 命中证据 | 受影响 CVE（cve-001 命中） |', '| --- | --- | --- | --- |')
  for (const row of fingerprints.rows) lines.push(row)
  const knowTasks = state.tasks.filter(t => t.id.startsWith('knowledge-'))
  const pocTasks = state.tasks.filter(t => t.id.startsWith('poc-') && t.id !== 'poc-001')
  if (knowTasks.length > 0 || pocTasks.length > 0) {
    lines.push('', '**已生成假设/方向任务**:')
    for (const t of knowTasks) lines.push(`- \`${t.id}\` (${t.role}, ${t.status}): ${escapeCell(t.title)}`)
    for (const t of pocTasks) lines.push(`- \`${t.id}\` (${t.role}, ${t.status}): ${escapeCell(t.title)}`)
  }
  lines.push('')

  lines.push('## 5. 测试方向（优先级按角色）', '')
  lines.push('| 角色 | 候选数 | 优先端点 |', '| --- | --- | --- |')
  for (const row of directions.rows) lines.push(row)
  lines.push('')
  lines.push(
    '> 说明: 这是阶段闭合时的确定性建议。测试 agent 按各自方向推进时,' +
    '应结合 reports/site-brief.md 与 evidence 判断;若测试中途发现新路由/参数,' +
    '重新运行本工具(recon-reopen)刷新此汇总。',
    '',
  )
  return lines.join('\n')
}

export interface ReconSummaryResult {
  ok: boolean
  path: string
  directories: number
  wordlistHits: number
  sensitive: number
  fingerprints: number
  directions: string
}

/** 生成 recon-summary 并记录 integrations.reconSummary。幂等可重跑。 */
export function generateReconSummary(
  workspace: string,
  output?: string,
): ReconSummaryResult {
  if (!existsSync(resolve(workspace, 'pentest-state.sqlite'))) {
    throw new Error(`Not a pentest workspace: ${workspace}`)
  }
  const out =
    output ?? resolve(workspace, 'reports', 'recon-summary.md')
  mkdirSync(resolve(workspace, 'reports'), { recursive: true })

  // Fingerprint the full imported traffic once at recon closure (decoupled from
  // JS analysis): scans ALL responses (headers/html/cookies/body + JS globals),
  // so HTML-only fingerprints are covered, and runs exactly once per recon.
  try {
    analyzeFingerprints(workspace, 'pentest-recon')
  } catch {
    /* fingerprint ruleset missing — summary still builds */
  }

  const state = loadState(workspace)
  const { counts: dirs, wordlistHits } = directoryInventory(state)
  const sensitive = scanSensitiveInfo(state)
  const fingerprints = fingerprintRows(state)
  const directions = directionRows(state)
  writeFileSync(out, buildSummary(state), 'utf8')

  recordReconSummary(workspace, {
    generatedAt: new Date().toISOString(),
    path: out,
    directoryCount: dirs.size,
    apiCount: state.surface.nodes.filter(
      n => n.kind === 'route' && isApiLike(routeInfo(n).pathname),
    ).length,
    sensitiveCount: sensitive.hits.length,
    fingerprintCount: fingerprints.count,
    directionCount: [...directions.byRole.values()].reduce((a, b) => a + b, 0),
  })

  return {
    ok: true,
    path: out,
    directories: dirs.size,
    wordlistHits: wordlistHits.length,
    sensitive: sensitive.hits.length,
    fingerprints: fingerprints.count,
    directions: [...directions.byRole.entries()]
      .map(([role, count]) => `${role}=${count}`)
      .join(', '),
  }
}

function main(): number {
  const args = process.argv.slice(2)
  const workspace = args[0]
  if (!workspace) {
    console.error('Usage: bun run tools/recon-summary.ts <workspace> [--out path]')
    return 1
  }
  try {
    const outFlag = args.indexOf('--out')
    const output =
      outFlag >= 0 && args[outFlag + 1] ? resolve(args[outFlag + 1]) : undefined
    console.log(JSON.stringify(generateReconSummary(workspace, output), null, 2))
    return 0
  } catch (error) {
    console.error(String(error))
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = main()
}
