/**
 * REST handlers for the AuAttack web console.
 *
 * Read-only against workspace state; the single explicit write is
 * POST /recon-summary/regenerate, which re-runs the deterministic
 * recon-summary generator.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildSiteMap,
  loadState,
  renderAuditView,
  summarizeState,
  type SiteMapAnalysis,
} from '../../packages/pentest-core/src/state.ts'
import { coverageGap } from '../../packages/pentest-core/src/coverage.ts'
import { deriveTestingCoverage } from '../../packages/pentest-core/src/testingCoverage.ts'
import { getBlackboardGraph } from '../../packages/pentest-core/src/blackboard.ts'
import { readEvidencePaginated } from '../../packages/pentest-core/src/outputReader.ts'
import { listKnowledgeNotes } from '../../packages/pentest-core/src/knowledge.ts'
import { getAttackPathGraph } from '../../packages/pentest-core/src/attackPath.ts'
import { getTestLedgerSummary, listTestLedger } from '../../packages/pentest-core/src/testLedger.ts'
import { getPentestAutomationStatus } from '../../packages/pentest-core/src/automation.ts'
import { generateReconSummary } from '../../tools/recon-summary.ts'
import {
  discoverWorkspaces,
  resolveWorkspaceId,
} from './discovery.ts'
import { listFiles, readFileEntry, redactSensitive, type FileEntry } from './files.ts'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function notFound(error: string): Response {
  return json({ error }, 404)
}

function badRequest(error: string): Response {
  return json({ error }, 400)
}

function requireWorkspace(workspaceRoot: string, wsId: string): { ok: true; path: string } | { ok: false; response: Response } {
  const path = resolveWorkspaceId(workspaceRoot, wsId)
  if (!path) return { ok: false, response: notFound('workspace not found') }
  return { ok: true, path }
}

function readMarkdownArtifact(path: string) {
  if (!existsSync(path)) return { present: false }
  return { present: true, markdown: readFileSync(path, 'utf8'), path }
}

function serializeSitemap(analysis: SiteMapAnalysis) {
  return {
    targetUrl: analysis.targetUrl,
    roots: analysis.roots,
    unreferenced: analysis.unreferenced,
    endpoints: [...analysis.endpoints.values()].map(endpoint => ({
      key: endpoint.key,
      method: endpoint.method,
      pathname: endpoint.pathname,
      urls: [...endpoint.urls],
      parameters: Object.fromEntries(
        [...endpoint.parameters.entries()].map(([location, names]) => [location, [...names]]),
      ),
      parents: [...endpoint.parents],
      children: [...endpoint.children],
      isApi: endpoint.isApi,
    })),
  }
}

function evidenceList(path: string) {
  const dir = resolve(path, 'evidence')
  if (!existsSync(dir)) return []
  const { readdirSync } = require('node:fs') as typeof import('node:fs')
  const items: Array<{
    evidenceId: string
    directory: string
    files: FileEntry[]
    request?: { method: string; url: string }
    statusCode?: number
  }> = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('E-')) continue
    const evidenceDir = resolve(dir, entry.name)
    const files = listFiles(evidenceDir)
    let request: { method: string; url: string } | undefined
    let statusCode: number | undefined
    const requestJson = resolve(evidenceDir, 'request.json')
    if (existsSync(requestJson)) {
      try {
        const parsed = JSON.parse(readFileSync(requestJson, 'utf8'))
        request = { method: parsed.method ?? 'GET', url: parsed.url ?? '' }
        const resp = resolve(evidenceDir, 'response.json')
        if (existsSync(resp)) {
          statusCode = JSON.parse(readFileSync(resp, 'utf8')).statusCode
        }
      } catch {
        /* partial write */
      }
    } else {
      const raw = resolve(evidenceDir, 'request.raw')
      if (existsSync(raw)) {
        const first = readFileSync(raw, 'utf8').split(/\r?\n/, 1)[0]
        const match = first?.match(/^([A-Z]+)\s+(\S+)/)
        if (match) request = { method: match[1], url: match[2] }
      }
      const rawResp = resolve(evidenceDir, 'response.raw')
      if (existsSync(rawResp)) {
        const status = readFileSync(rawResp, 'utf8').match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)
        if (status) statusCode = Number(status[1])
      }
    }
    items.push({ evidenceId: entry.name, directory: evidenceDir, files, request, statusCode })
  }
  return items.sort((a, b) => b.evidenceId.localeCompare(a.evidenceId))
}

export async function handleApiRequest(opts: {
  workspaceRoot: string
  pathname: string
  searchParams: URLSearchParams
  method: string
}): Promise<Response> {
  const { workspaceRoot, pathname, searchParams, method } = opts

  if (pathname === '/api/health') {
    return json({ ok: true, workspaceRoot, uptimeMs: Date.now() - process.uptime() * 1000 })
  }

  if (pathname === '/api/workspaces') {
    return json({ workspaces: discoverWorkspaces(workspaceRoot) })
  }

  // /api/workspaces/:wsId[/...]
  const match = pathname.match(/^\/api\/workspaces\/([^/]+)(?:\/(.*))?$/)
  if (!match) return notFound('unknown api path')
  const [, rawWsId, restPath = ''] = match
  const ws = requireWorkspace(workspaceRoot, rawWsId)
  if (!ws.ok) return ws.response
  const workspace = ws.path
  const state = loadState(workspace)
  const segments = restPath.split('/').filter(Boolean)

  if (segments.length === 0) {
    return json({
      id: rawWsId,
      path: workspace,
      overview: summarizeState(state),
      run: state.run,
      scope: state.scope,
    })
  }

  const section = segments[0]

  if (section === 'surface') {
    const entries = state.coverage ?? []
    const coverageByNode: Record<string, { status: string; evidenceIds: string[] }> = {}
    for (const entry of entries) {
      coverageByNode[entry.nodeId] = {
        status: entry.blocked
          ? 'blocked'
          : entry.waived
            ? 'waived'
            : entry.testedAt
              ? 'tested'
              : 'untested',
        evidenceIds: entry.evidenceIds,
      }
    }
    return json({ nodes: state.surface.nodes, edges: state.surface.edges, coverageByNode })
  }

  if (section === 'sitemap') {
    // Coverage per endpoint key (node.value -> status), mirroring the report's
    // site-map coloring so the console tree can badge tested/waived/blocked/untested.
    const coverageEntryByNode = new Map((state.coverage ?? []).map(entry => [entry.nodeId, entry]))
    const coverageByKey: Record<string, string> = {}
    for (const node of state.surface.nodes) {
      if (node.kind !== 'route') continue
      const entry = coverageEntryByNode.get(node.id)
      coverageByKey[node.value] = entry?.waived
        ? 'waived'
        : entry?.blocked
          ? 'blocked'
          : entry?.testedAt
            ? 'tested'
            : 'untested'
    }
    return json({ ...serializeSitemap(buildSiteMap(state)), coverageByKey })
  }

  if (section === 'tasks') {
    return json({
      tasks: state.tasks,
      runnable: (await import('../../packages/pentest-core/src/state.ts')).listRunnableTasks(state).map(task => task.id),
      automation: getPentestAutomationStatus(workspace),
    })
  }

  if (section === 'findings') {
    return json({ findings: state.findings })
  }

  if (section === 'coverage') {
    const gap = coverageGap(workspace)
    return json({
      coverage: gap.coverage,
      gap: {
        total: gap.total,
        tested: gap.tested,
        waived: gap.waived,
        blocked: gap.blocked,
        untested: gap.untested,
        untestedNodes: gap.untestedNodes,
        orphanNodes: gap.orphanNodes,
        blockedNodes: gap.blockedNodes,
      },
      testingCoverage: deriveTestingCoverage(state),
      testingSummary: gap.testingSummary,
      ledger: listTestLedger(workspace),
    })
  }

  if (section === 'events') {
    const limit = Math.min(Number(searchParams.get('limit') ?? 200), 1000)
    const offset = Math.max(Number(searchParams.get('offset') ?? 0), 0)
    const all = [...state.events].sort((a, b) => (a.at < b.at ? 1 : -1))
    return json({ events: all.slice(offset, offset + limit), total: all.length })
  }

  if (section === 'traffic') {
    return json({ traffic: state.traffic })
  }

  if (section === 'blackboard') {
    return json(getBlackboardGraph(workspace))
  }

  if (section === 'attack-paths') {
    return json(getAttackPathGraph(workspace))
  }

  if (section === 'test-ledger') {
    return json({ records: listTestLedger(workspace), summary: getTestLedgerSummary(workspace) })
  }

  if (section === 'audit') {
    return json({ text: renderAuditView(workspace) })
  }

  if (section === 'recon-summary') {
    if (method === 'POST') {
      try {
        const result = generateReconSummary(workspace)
        return json(result)
      } catch (error) {
        return json({ error: String(error) }, 500)
      }
    }
    return json(readMarkdownArtifact(resolve(workspace, 'reports', 'recon-summary.md')))
  }

  if (section === 'site-brief') {
    return json(readMarkdownArtifact(resolve(workspace, 'reports', 'site-brief.md')))
  }

  if (section === 'knowledge-notes') {
    return json({ notes: listKnowledgeNotes(workspace, searchParams.get('role') ?? undefined) })
  }

  if (section === 'reports') {
    if (segments.length === 1) {
      return json({ files: listFiles(resolve(workspace, 'reports')) })
    }
    const file = safeFileResponse(workspace, 'reports', segments[1])
    return file
  }

  if (section === 'evidence') {
    if (segments.length === 1) {
      return json({ items: evidenceList(workspace) })
    }
    const [, evidenceId, , file] = segments
    if (evidenceId && file) {
      const startParam = searchParams.get('start')
      const countParam = searchParams.get('count')
      if (startParam !== null) {
        // Paginated text read: { lines: [{lineNumber,text}], totalLines, start, count }
        const start = Math.max(Number(startParam) || 1, 1)
        const count = Math.min(Math.max(Number(countParam) || 200, 1), 1000)
        try {
          return json(readEvidencePaginated(workspace, evidenceId, file, start, count))
        } catch (error) {
          return json({ error: String(error) }, 404)
        }
      }
      const guard = safeFileResponse(workspace, resolve('evidence', evidenceId).replace(/\\/g, '/'), file)
      return guard
    }
    return notFound('unknown evidence path')
  }

  return notFound('unknown api path')
}

function safeFileResponse(root: string, relDir: string, file: string): Response {
  const result = readFileEntry(resolve(root, relDir), file)
  if (!result.ok) return json({ error: result.error }, result.status)
  let body: Blob
  const isText = result.contentType.startsWith('text/') || result.contentType.includes('json')
  if (isText) {
    body = new Blob([redactSensitive(new TextDecoder().decode(result.body))], { type: result.contentType })
  } else {
    body = new Blob([Uint8Array.from(result.body)], { type: result.contentType })
  }
  return new Response(body, {
    headers: {
      'content-type': result.contentType,
      'x-file-name': encodeURIComponent(result.name),
      'cache-control': 'no-store',
    },
  })
}
