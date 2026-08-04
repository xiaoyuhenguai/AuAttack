#!/usr/bin/env bun
/**
 * 独立生成 HTML 网站图谱（站点地图）
 *
 * 读取 AuAttack workspace 状态，从流量记录构建端点图，
 * 按 coverage 状态着色（tested 绿 / waived 黄 / untested 红），
 * 输出自包含的 HTML 文件 —— 无需等待 pentest_report 的任务终结 gate。
 *
 * 用法:
 *   bun run tools/site-map-html.ts <workspace> [--out path]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import {
  buildSiteMap,
  loadState,
  renderSiteMap,
  type CoverageStatus,
} from '../packages/pentest-core/src/state.ts'

const SITE_MAP_CSS = `
  body{font-family:Arial,'Microsoft YaHei',sans-serif;margin:36px;color:#202020;max-width:1440px}
  h1,h2,h3{margin:0 0 12px}
  section{margin:28px 0}
  dl{display:grid;grid-template-columns:180px 1fr;gap:8px}
  dt{font-weight:bold}
  table{border-collapse:collapse;width:100%;font-size:13px}
  th,td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}
  th{background:#f3eee9}
  .site-map{border:1px solid #bbb;padding:18px;background:#fcfcfc}
  .map-summary{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}
  .metric{border:1px solid #bbb;padding:7px 10px;background:#fff;font-size:13px}
  .tree{list-style:none;margin:0;padding-left:0}
  .tree ul{list-style:none;margin:7px 0 0 22px;padding-left:16px;border-left:1px solid #c7c7c7}
  .tree li{position:relative;margin:7px 0}
  .tree ul>li:before{content:"";position:absolute;left:-16px;top:15px;width:16px;border-top:1px solid #c7c7c7}
  .endpoint{display:inline-block;border:1px solid #9a9a9a;background:#fff;padding:7px 9px;max-width:100%;word-break:break-all}
  .endpoint summary{cursor:pointer}
  .method{font-weight:bold;margin-right:7px}
  .method.get{color:#176f3d}
  .method.post{color:#9b5000}
  .badge{display:inline-block;border:1px solid #aaa;background:#f4f4f4;font-size:11px;padding:1px 5px;margin-left:6px}
  .cov-tested{border-color:#2e7d32!important}
  .cov-waived{border-color:#f9a825!important}
  .cov-untested{border-color:#c62828!important}
  .badge.cov-tested{background:#e8f5e9;color:#2e7d32;border-color:#2e7d32}
  .badge.cov-waived{background:#fff8e1;color:#f57f17;border-color:#f9a825}
  .badge.cov-untested{background:#ffebee;color:#c62828;border-color:#c62828}
  .params{margin:8px 0 0;padding-left:18px;font-size:12px}
  .params li{margin:3px 0}
  .unreferenced{margin-top:20px}
  .empty{color:#666;font-style:italic}
`

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
    console.error('用法: bun run tools/site-map-html.ts <workspace> [--out path]')
    return 1
  }
  workspace = resolve(workspace)
  const state = loadState(workspace)

  // coverage 状态着色：按 route 节点 value -> tested/waived/untested
  const coverageEntryByNode = new Map(
    (state.coverage ?? []).map((entry: { nodeId: string }) => [entry.nodeId, entry]),
  )
  const coverageByKey = new Map<string, CoverageStatus>()
  for (const node of state.surface.nodes) {
    if (node.kind !== 'route') continue
    const entry = coverageEntryByNode.get(node.id)
    coverageByKey.set(
      node.value,
      entry?.waived ? 'waived' : entry?.testedAt ? 'tested' : 'untested',
    )
  }

  const siteMap = buildSiteMap(state)
  const siteMapHtml = renderSiteMap(siteMap, coverageByKey)
  const tested = [...coverageByKey.values()].filter(v => v === 'tested').length
  const waived = [...coverageByKey.values()].filter(v => v === 'waived').length
  const untested = [...coverageByKey.values()].filter(v => v === 'untested').length

  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>网站图谱 — ${state.run.targetUrl}</title><style>${SITE_MAP_CSS}</style></head><body>
<h1>网站图谱（Site Map）</h1>
<dl>
  <dt>目标</dt><dd>${state.run.targetUrl}</dd>
  <dt>Run</dt><dd>${state.run.id}</dd>
  <dt>Profile</dt><dd>${state.run.profile}</dd>
  <dt>流量记录</dt><dd>${state.traffic.length}</dd>
  <dt>攻击面节点</dt><dd>${state.surface.nodes.length}</dd>
  <dt>Coverage</dt><dd>tested ${tested} / waived ${waived} / untested ${untested}</dd>
  <dt>生成时间</dt><dd>${new Date().toISOString()}</dd>
</dl>
<section><h2>站点地图与端点分析</h2>${siteMapHtml}</section>
</body></html>\n`

  outPath = outPath || join(workspace, 'reports', 'site-map.html')
  mkdirSync(resolve(outPath).replace(/[\\/][^\\/]*$/, ''), { recursive: true })
  writeFileSync(outPath, html, 'utf8')
  console.log(`[ok] 已生成 HTML 网站图谱: ${outPath}`)
  return 0
}

process.exit(main())
