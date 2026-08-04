#!/usr/bin/env bun
/**
 * 资产收集：子域名枚举 —— 对一个域名清单跑被动子域收集并聚合
 *
 * 用法:
 *   bun run tools/asset-subdomains.ts <workspace> <domain1> <domain2> ...
 *   bun run tools/asset-subdomains.ts <workspace> --file domains.txt
 *
 * 全被动（crt.sh/certspotter CT 日志 + DNS），零目标交互、无需批准。
 * 结果写入 <workspace>/reports/subdomains-assets.md 并打印聚合摘要。
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  addScopeOrigin,
  createPentestRun,
  hasPentestState,
} from '../packages/pentest-core/src/state.ts'
import {
  collectSubdomains,
  probeHostLiveness,
} from '../packages/pentest-core/src/subdomains.ts'

const args = process.argv.slice(2)
const workspaceArg = args[0]
if (!workspaceArg) {
  console.error('usage: bun run tools/asset-subdomains.ts <workspace> [--file domains.txt] <domain...>')
  process.exit(1)
}
const fileIndex = args.indexOf('--file')
const fromFile =
  fileIndex >= 0 && args[fileIndex + 1]
    ? readFileSync(args[fileIndex + 1]!, 'utf8')
        .split(/\r?\n/)
        .map(line => line.trim().replace(/^\*\./, ''))
        .filter(Boolean)
    : []
const fromArgs = args
  .slice(fileIndex >= 0 ? fileIndex + 2 : 1)
  .filter(arg => !arg.startsWith('--'))
const domains = [...new Set([...fromFile, ...fromArgs.map(d => d.replace(/^\*\./, ''))])]
if (domains.length === 0) {
  console.error('no domains provided')
  process.exit(1)
}

const workspace = resolve(workspaceArg)
const doLiveness = args.includes('--liveness')
const probeOnly = args.includes('--probe-only')
if (!hasPentestState(workspace)) {
  createPentestRun({
    targetUrl: `https://${domains[0]}/`,
    profile: 'deep',
    workspace,
    commandPrefix: 'ccb pentest',
  })
}
for (const domain of domains) {
  addScopeOrigin(workspace, `https://${domain}/`, true, 'pentest-cli')
}
if (doLiveness) {
  console.error('注意: --liveness 是主动探测（TCP 80/443 + HTTP），会向发现的子域发连接请求 — 请确认你对这些资产有测试授权。')
}
if (probeOnly) {
  await runProbeOnly(workspace, doLiveness)
  process.exit(0)
}

const all = new Map<string, { host: string; resolved: boolean; ip: string[]; source: string; inScope: boolean }>()
const perDomain: { domain: string; total: number; resolved: number }[] = []

for (const domain of domains) {
  process.stdout.write(`collecting ${domain} ... `)
  try {
    const result = await collectSubdomains({
      workspace,
      domain,
      actor: 'pentest-cli',
      timeoutMs: 20_000,
      liveness: doLiveness,
    })
    perDomain.push({ domain, total: result.total, resolved: result.resolved })
    for (const sub of result.subdomains) {
      all.set(sub.host, sub)
    }
    console.log(`${result.total} collected, ${result.resolved} resolved`)
  } catch (error) {
    console.log(`ERROR ${error instanceof Error ? error.message : String(error)}`)
    perDomain.push({ domain, total: 0, resolved: 0 })
  }
}

const resolved = [...all.values()].filter(item => item.resolved)
const unresolved = [...all.values()].filter(item => !item.resolved)
resolved.sort((a, b) => a.host.localeCompare(b.host))
unresolved.sort((a, b) => a.host.localeCompare(b.host))
const alive = resolved.filter(item => item.alive)

const reportDir = resolve(workspace, 'reports')
mkdirSync(reportDir, { recursive: true })
const lines = [
  '# 资产收集：子域名',
  '',
  `- 时间: ${new Date().toISOString()}`,
  `- 根域: ${domains.length}`,
  `- 唯一子域: ${all.size}`,
  `- 已解析: ${resolved.length}`,
  `- 存活(仅当 --liveness): ${doLiveness ? alive.length : '未探测'}`,
  `- 未解析(CT 有记录但无 DNS): ${unresolved.length}`,
  '',
  '## 按根域',
  '',
  '| 根域 | 收集 | 已解析 |',
  '| --- | --- | --- |',
  ...perDomain.map(item => `| ${item.domain} | ${item.total} | ${item.resolved} |`),
  '',
  '## 已解析子域',
  '',
  `| 子域 | IP | 来源 | 存活 | 端口 | HTTP |`,
  '| --- | --- | --- | --- | --- | --- |',
  ...resolved.map(
    item =>
      `| ${item.host} | ${item.ip.join(', ')} | ${item.source} | ${item.alive === undefined ? '—' : item.alive ? '✓' : '✗'} | ${item.ports?.join(',') ?? '—'} | ${Object.entries(item.httpStatus ?? {}).map(([p, s]) => `${p}:${s}`).join(' ') || '—'} |`,
  ),
  '',
  '## 未解析子域（CT 有记录）',
  '',
  ...unresolved.map(item => `- ${item.host}`),
]
writeFileSync(resolve(reportDir, 'subdomains-assets.md'), `${lines.join('\n')}\n`, 'utf8')

console.log('')
console.log('=== 聚合摘要 ===')
console.log(`根域 ${domains.length} | 唯一子域 ${all.size} | 已解析 ${resolved.length}`)
for (const item of perDomain) {
  console.log(`  ${item.domain}: ${item.total} collected, ${item.resolved} resolved`)
}
console.log(`报告: ${resolve(reportDir, 'subdomains-assets.md')}`)

/**
 * --probe-only: 不重新收集，从已有证据（evidence 目录下每个证据的 subdomains.json）
 * 合并主机，对已解析主机做 liveness 探测。避开外部源限流，复用历史收集数据。
 */
async function runProbeOnly(ws: string, liveness: boolean): Promise<void> {
  if (!liveness) {
    console.error('--probe-only 需要配合 --liveness 使用')
    return
  }
  const evidenceDir = resolve(ws, 'evidence')
  const hosts = new Map<string, string[]>()
  for (const entry of readdirSync(evidenceDir)) {
    const file = join(evidenceDir, entry, 'subdomains.json')
    if (!readFileSync(file, 'utf8').includes('subdomains')) continue
    let parsed: { subdomains: { host: string; ip: string[]; resolved: boolean }[] }
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    for (const sub of parsed.subdomains ?? []) {
      if (sub.resolved && sub.ip.length > 0) hosts.set(sub.host, sub.ip)
    }
  }
  const list = [...hosts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  console.log(`\n从证据合并 ${list.length} 个已解析主机，开始存活探测...`)
  const alive: { host: string; ip: string[]; ports: number[]; httpStatus: Record<number, number> }[] = []
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const [host, ip] = list[next++]!
      const probe = await probeHostLiveness(host)
      if (probe.alive) alive.push({ host, ip, ports: probe.ports, httpStatus: probe.httpStatus })
    }
  }
  await Promise.all(Array.from({ length: 10 }, () => worker()))
  const reportDir = resolve(ws, 'reports')
  mkdirSync(reportDir, { recursive: true })
  const lines = [
    '# 存活探测报告',
    '',
    `- 时间: ${new Date().toISOString()}`,
    `- 探测主机: ${list.length}`,
    `- 存活: ${alive.length}`,
    '',
    '| 主机 | IP | 端口 | HTTP 状态 |',
    '| --- | --- | --- | --- |',
    ...alive.map(item =>
      `| ${item.host} | ${item.ip.join(', ')} | ${item.ports.join(',')} | ${Object.entries(item.httpStatus).map(([p, s]) => `${p}:${s}`).join(' ')} |`,
    ),
  ]
  writeFileSync(resolve(reportDir, 'liveness-report.md'), `${lines.join('\n')}\n`, 'utf8')
  console.log(`存活: ${alive.length}/${list.length}`)
  for (const item of alive) {
    console.log(`  ✓ ${item.host} ${item.ports.join(',')} ${Object.entries(item.httpStatus).map(([p, s]) => `${p}:${s}`).join(' ')}`)
  }
  console.log(`报告: ${resolve(reportDir, 'liveness-report.md')}`)
}
