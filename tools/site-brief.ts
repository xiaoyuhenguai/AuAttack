#!/usr/bin/env bun
/**
 * 站点简报生成器 —— 给 AI/人快速了解站点的跨线程交接文件
 *
 * 确定性事实（资产、指纹、端点+coverage、假设、发现、任务、事件）从工作区状态
 * 自动生成，始终与真实状态同步；AI 维护的定性部分（测试结果/失败原因/观察/下一步）
 * 通过 `<!-- AI-OWNED: name -->` 标记块保留，不会被覆盖。
 *
 * 用法:
 *   bun run tools/site-brief.ts <workspace> [--out path]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { loadState } from '../packages/pentest-core/src/state.ts'
import type { PentestState, SurfaceNode } from '../packages/pentest-core/src/types.ts'

/** AI 维护的小节（用标记块包裹，工具只保留不生成内容） */
const AI_OWNED_SECTIONS = [
  '端点测试记录',
  '失败与阻塞原因',
  '观察',
  '下一步',
] as const

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function coverageStatusOf(state: PentestState, nodeId: string): string {
  const entry = (state.coverage ?? []).find(e => e.nodeId === nodeId)
  if (entry?.waived) return 'waived(豁免)'
  if (entry?.testedAt) return 'tested(已测)'
  return 'untested(未测)'
}

function fingerprintRows(state: PentestState): string[] {
  const rows: string[] = []
  for (const node of state.surface.nodes) {
    if (node.kind !== 'technology') continue
    const note = node.attributes?.note ? ` — ${node.attributes.note}` : ''
    rows.push(
      `| ${escapeCell(node.value)} | ${escapeCell(String(node.attributes?.evidence ?? 'surface'))} | ${escapeCell(note)} |`,
    )
  }
  if (rows.length === 0) return ['| — | — | — |']
  return rows
}

function endpointRows(state: PentestState): string[] {
  const rows: string[] = []
  const sorted = state.surface.nodes
    .filter(n => n.kind === 'route')
    .sort((a, b) => a.value.localeCompare(b.value))
  for (const node of sorted) {
    const method = node.attributes?.method ? String(node.attributes.method) : '?'
    const url = node.attributes?.url ? String(node.attributes.url) : node.value
    const trafficId = node.attributes?.trafficId ? String(node.attributes.trafficId) : ''
    rows.push(
      `| \`${escapeCell(url)}\` | ${escapeCell(method)} | ${coverageStatusOf(state, node.id)} | ${trafficId ? '有流量' : '孤儿'} | |`,
    )
  }
  if (rows.length === 0) return ['| — | — | — | — | |']
  return rows
}

function parameterRows(state: PentestState): string[] {
  const rows: string[] = []
  for (const node of state.surface.nodes) {
    if (node.kind !== 'parameter') continue
    rows.push(
      `| \`${escapeCell(node.value)}\` | ${coverageStatusOf(state, node.id)} | |`,
    )
  }
  return rows
}

function hypothesisRows(state: PentestState): string[] {
  const rows: string[] = []
  for (const task of state.tasks) {
    if (!task.id.startsWith('knowledge-') && !task.id.startsWith('cve-candidate-')) continue
    const title = task.title.replace(/^Assess knowledge applicability: /i, '')
    rows.push(
      `| ${escapeCell(task.id)} | ${escapeCell(title)} | ${task.status} | ${escapeCell(task.resultSummary ?? task.error ?? '')} | |`,
    )
  }
  return rows
}

function findingRows(state: PentestState): string[] {
  const rows: string[] = []
  for (const finding of state.findings) {
    rows.push(
      `| ${finding.id} | ${escapeCell(finding.title)} | ${finding.severity} | ${finding.status} | \`${escapeCell(finding.targetUrl)}\` | ${finding.evidencePaths.join(', ')} |`,
    )
  }
  if (rows.length === 0) return ['| — | — | — | — | — | — |']
  return rows
}

function taskSummary(state: PentestState): string {
  const counts = new Map<string, number>()
  for (const task of state.tasks) {
    counts.set(task.status, (counts.get(task.status) ?? 0) + 1)
  }
  return [...counts.entries()].map(([k, v]) => `${k}:${v}`).join('  ') || '无'
}

function eventSummary(state: PentestState): string[] {
  const counts = new Map<string, number>()
  for (const e of state.events) {
    counts.set(e.type, (counts.get(e.type) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- ${k}: ${v}`)
}

/** 从已有文件提取 AI 维护的标记块 */
function extractAiOwned(existing: string): Map<string, string> {
  const blocks = new Map<string, string>()
  for (const name of AI_OWNED_SECTIONS) {
    const open = `<!-- AI-OWNED: ${name} -->`
    const close = `<!-- /AI-OWNED: ${name} -->`
    // 取最后一个开始标记到其后第一个结束标记之间的内容：即使历史生成曾把标记
    // 误写进内容，也只取最内层干净文本，不会层层累积。
    const lastOpen = existing.lastIndexOf(open)
    const firstClose = existing.indexOf(close, lastOpen >= 0 ? lastOpen : 0)
    if (lastOpen >= 0 && firstClose > lastOpen) {
      blocks.set(name, existing.slice(lastOpen + open.length, firstClose).trim())
    }
  }
  return blocks
}

function renderAiBlock(name: string, content?: string): string {
  const body = content
    ? content
    : `> AI 待补充：此小节由测试线程维护，跨线程交接时保留。\n> - 测试了哪些端点/参数，结果如何\n> - 哪里被 WAF/403/超时/认证拦截，原因\n> - 观察到的可疑行为/线索`
  return `<!-- AI-OWNED: ${name} -->\n${body}\n<!-- /AI-OWNED: ${name} -->`
}

function main(): number {
  const args = process.argv.slice(2)
  let workspace = ''
  let outPath = ''
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--out') {
      outPath = args[i + 1]
      i++
    } else if (!workspace) {
      workspace = a
    }
  }
  if (!workspace) {
    console.error('用法: bun run tools/site-brief.ts <workspace> [--out path]')
    return 1
  }
  workspace = resolve(workspace)
  const state = loadState(workspace)
  outPath = outPath || join(workspace, 'reports', 'site-brief.md')
  mkdirSync(resolve(outPath).replace(/[\\/][^\\/]*$/, ''), { recursive: true })

  // 保留上次的 AI 维护块
  const aiOwned = existsSync(outPath)
    ? extractAiOwned(readFileSync(outPath, 'utf8'))
    : new Map<string, string>()

  const params = parameterRows(state)
  const lines: string[] = []
  lines.push(`# 站点简报 — ${state.run.targetUrl}`)
  lines.push('')
  lines.push('> **用途**：给 AI/人快速了解站点的跨线程交接文件。新线程先读此文件，再决定是否重扫。')
  lines.push(`> **确定性部分**由 \`tools/site-brief.ts\` 自动生成并覆盖；**AI 维护部分**（端点测试记录/失败原因/观察/下一步）跨线程保留。`)
  lines.push(`> **最后自动生成**：${new Date().toISOString()}`)
  lines.push('')
  lines.push('## 0. 交接速览')
  lines.push('')
  lines.push(`- 目标：${state.run.targetUrl}`)
  lines.push(`- 工作区：${state.run.workspace}`)
  lines.push(`- Run：${state.run.id}（${state.run.profile}，status=${state.run.status}）`)
  lines.push(`- 已确认/复现发现：${state.findings.filter(f => ['reproduced', 'confirmed'].includes(f.status)).length} 条`)
  lines.push(`- 任务：${taskSummary(state)}`)
  lines.push('')
  lines.push('## 1. 技术指纹（框架/组件/WAF/CDN）')
  lines.push('')
  lines.push('| 组件 | 来源 | 备注 |')
  lines.push('|---|---|---|')
  lines.push(...fingerprintRows(state))
  lines.push('')
  lines.push('## 2. 攻击面与覆盖')
  lines.push('')
  lines.push('### 2.1 路由端点')
  lines.push('')
  lines.push('| 端点 | 方法 | 覆盖 | 流量 | 测试结果/备注(AI维护) |')
  lines.push('|---|---|---|---|---|')
  lines.push(...endpointRows(state))
  lines.push('')
  if (params.length) {
    lines.push('### 2.2 参数')
    lines.push('')
    lines.push('| 参数 | 覆盖 | 测试结果/备注(AI维护) |')
    lines.push('|---|---|---|')
    lines.push(...params)
    lines.push('')
  }
  lines.push('## 3. 假设与知识匹配（hypotheses）')
  lines.push('')
  lines.push('| 假设ID | 内容 | 状态 | 结果摘要 | AI补充 |')
  lines.push('|---|---|---|---|---|')
  lines.push(...hypothesisRows(state))
  lines.push('')
  lines.push('## 4. 发现（findings）')
  lines.push('')
  lines.push('| ID | 标题 | 等级 | 状态 | 端点 | 证据 |')
  lines.push('|---|---|---|---|---|---|')
  lines.push(...findingRows(state))
  lines.push('')
  lines.push('## 5. 事件轨迹摘要')
  lines.push('')
  lines.push(...eventSummary(state))
  lines.push('')
  // AI 维护块
  lines.push(`## 6. 端点测试记录（AI 维护）`)
  lines.push('')
  lines.push(renderAiBlock('端点测试记录', aiOwned.get('端点测试记录')))
  lines.push('')
  lines.push(`## 7. 失败与阻塞原因（AI 维护）`)
  lines.push('')
  lines.push(renderAiBlock('失败与阻塞原因', aiOwned.get('失败与阻塞原因')))
  lines.push('')
  lines.push(`## 8. 观察（AI 维护）`)
  lines.push('')
  lines.push(renderAiBlock('观察', aiOwned.get('观察')))
  lines.push('')
  lines.push(`## 9. 下一步（AI 维护）`)
  lines.push('')
  lines.push(renderAiBlock('下一步', aiOwned.get('下一步')))
  lines.push('')

  writeFileSync(outPath, lines.join('\n'), 'utf8')
  console.log(`[ok] 已生成站点简报: ${outPath}`)
  return 0
}

process.exit(main())
