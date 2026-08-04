#!/usr/bin/env bun
/**
 * 资产整理：把扁平子域清单改造成「主域 → 子域」目录树，并策展高价值待测名单
 *
 * 用法:
 *   bun run tools/asset-organize.ts <workspace>
 *
 * 读取 evidence 目录下各证据的 subdomains.json（主机+IP）和 reports/liveness-report.md（存活+端口+HTTP），
 * 生成:
 *   <workspace>/assets/<主域>/<子域>/info.json     每个子域的侦察数据
 *   <workspace>/assets/待测名单.md                  高价值存活主机 + 入选理由
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const workspace = resolve(process.argv[2])
if (!workspace) {
  console.error('usage: bun run tools/asset-organize.ts <workspace>')
  process.exit(1)
}

// ---- 1. 从证据合并所有主机 ----
const hosts = new Map<
  string,
  { host: string; ip: string[]; source: string }
>()
const evidenceDir = resolve(workspace, 'evidence')
if (existsSync(evidenceDir)) {
  for (const entry of readdirSync(evidenceDir)) {
    const file = join(evidenceDir, entry, 'subdomains.json')
    if (!existsSync(file)) continue
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8'))
      for (const sub of parsed.subdomains ?? []) {
        if (typeof sub.host !== 'string') continue
        hosts.set(sub.host, {
          host: sub.host,
          ip: Array.isArray(sub.ip) ? sub.ip : [],
          source: typeof sub.source === 'string' ? sub.source : 'passive',
        })
      }
    } catch {
      // skip malformed evidence
    }
  }
}

// ---- 2. 读取存活结果（liveness-report.md）----
const alive = new Map<string, { ports: number[]; httpStatus: Record<number, number> }>()
const livenessReport = resolve(workspace, 'reports', 'liveness-report.md')
if (existsSync(livenessReport)) {
  for (const line of readFileSync(livenessReport, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\| ([^|]+) \| [^|]* \| ([^|]*) \| ([^|]*) \|$/)
    if (!match) continue
    const host = match[1]!.trim()
    const ports = match[2]!.trim() === '—' ? [] : match[2]!.split(',').map(Number).filter(Boolean)
    const httpStatus: Record<number, number> = {}
    for (const part of match[3]!.trim().split(/\s+/)) {
      const [p, s] = part.split(':')
      if (p && s) httpStatus[Number(p)] = Number(s)
    }
    if (ports.length > 0) alive.set(host, { ports, httpStatus })
  }
}

// ---- 3. 打分选高价值存活主机 ----
const SCORE_TAGS: [RegExp, number, string][] = [
  [/(^|[-.])sso|(^|[-.])login|(^|[-.])auth|(^|[-.])passport|adfs/, 3, '身份认证'],
  [/(^|[-.])oa|(^|[-.])admin|(^|[-.])account|(^|[-.])portal|(^|[-.])vpn|(^|[-.])console/, 3, '管理/账号'],
  [/(^|[-.])jenkins|(^|[-.])jira|(^|[-.])sentry|(^|[-.])gitlab|(^|[-.])grafana|(^|[-.])kibana|(^|[-.])nexus|(^|[-.])sonar|(^|[-.])harbor|(^|[-.])registry/, 3, '开发/运维工具'],
  [/(^|[-.])test|(^|[-.])uat|(^|[-.])dev|(^|[-.])staging|(^|[-.])pre|(^|[-.])qa|(^|[-.])debug|(^|[-.])sandbox/, 2, '非生产环境'],
  [/(^|[-.])api|(^|[-.])gateway|(^|[-.])mqtt|(^|[-.])srm|(^|[-.])erp|(^|[-.])crm/, 2, '后端/业务系统'],
  [/(^|[-.])mx|(^|[-.])mail|(^|[-.])owa|(^|[-.])webmail/, 1, '邮件'],
]
const scored: { host: string; ip: string[]; source: string; ports: number[]; httpStatus: Record<number, number>; score: number; tags: string[] }[] = []
for (const [host, data] of hosts) {
  const liveness = alive.get(host)
  if (!liveness) continue // 只考虑存活主机
  let score = 0
  const tags: string[] = []
  for (const [pattern, points, tag] of SCORE_TAGS) {
    if (pattern.test(host)) {
      score += points
      if (!tags.includes(tag)) tags.push(tag)
    }
  }
  scored.push({
    host,
    ip: data.ip,
    source: data.source,
    ports: liveness.ports,
    httpStatus: liveness.httpStatus,
    score,
    tags,
  })
}
scored.sort((a, b) => b.score - a.score || a.host.localeCompare(b.host))
const candidates = scored.filter(item => item.score >= 3)

// ---- 4. 生成目录树 + info.json ----
const assetsDir = resolve(workspace, 'assets')
for (const item of scored) {
  const rootDomain = item.host.split('.').slice(-2).join('.')
  const dir = join(assetsDir, rootDomain, item.host)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'info.json'),
    `${JSON.stringify(
      {
        host: item.host,
        rootDomain,
        ip: item.ip,
        source: item.source,
        alive: true,
        ports: item.ports,
        httpStatus: item.httpStatus,
        tags: item.tags,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
}

// ---- 5. 待测名单 ----
const lines = [
  '# 待测名单',
  '',
  '> 从存活主机中按价值评分选出（身份认证 / 管理账号 / 开发运维工具 / 非生产环境 / 后端业务 / 邮件）。',
  '> **注意：任何主动测试前须确认对这些主机有授权。**',
  '',
  `- 生成时间: ${new Date().toISOString()}`,
  `- 存活主机: ${scored.length}`,
  `- 高价值候选: ${candidates.length}`,
  '',
  '| 主机 | 端口 | HTTP | 理由 |',
  '| --- | --- | --- | --- |',
  ...candidates.map(item =>
    `| ${item.host} | ${item.ports.join(',')} | ${Object.entries(item.httpStatus).map(([p, s]) => `${p}:${s}`).join(' ')} | ${item.tags.join('、')} |`,
  ),
]
writeFileSync(resolve(assetsDir, '待测名单.md'), `${lines.join('\n')}\n`, 'utf8')

// ---- 6. 机器可读候选清单（agent 确定性解析用）----
writeFileSync(
  resolve(assetsDir, 'candidates.json'),
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      collected: hosts.size,
      alive: scored.length,
      candidates: candidates.map(item => ({
        host: item.host,
        rootDomain: item.host.split('.').slice(-2).join('.'),
        score: item.score,
        tags: item.tags,
        ports: item.ports,
        httpStatus: item.httpStatus,
        ip: item.ip,
      })),
    },
    null,
    2,
  )}\n`,
  'utf8',
)

// ---- 输出 ----
console.log('=== 资产整理完成 ===')
console.log(`主机: ${scored.length} 存活 / ${hosts.size} 收集`)
console.log(`目录树: ${assetsDir}/<主域>/<子域>/info.json`)
console.log(`高价值候选: ${candidates.length}`)
for (const item of candidates) {
  console.log(`  [${item.score}] ${item.host} — ${item.tags.join('、')}`)
}
console.log(`待测名单: ${resolve(assetsDir, '待测名单.md')}`)
console.log(`机器可读: ${resolve(assetsDir, 'candidates.json')}`)
