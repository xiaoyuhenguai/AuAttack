/**
 * Workspace discovery for the AuAttack web console.
 *
 * Scans the workspace root for pentest-state.sqlite files at three depths:
 *   <root>/pentest-state.sqlite
 *   <root>/<level>/pentest-state.sqlite
 *   <root>/<level>/<sub>/pentest-state.sqlite
 * Each is loaded with loadState (broken databases are skipped) and surfaced
 * as a WorkspaceListItem with aggregate counts for the console sidebar.
 */
import { existsSync, readdirSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { loadState } from '../../packages/pentest-core/src/state.ts'
import { coverageGap } from '../../packages/pentest-core/src/coverage.ts'

export interface WorkspaceListItem {
  id: string
  path: string
  /** relative path from workspace root, e.g. "yljz.com/account" or "www.yooli.com" */
  rel: string
  name: string
  targetUrl: string
  profile: string
  status: string
  createdAt: string
  updatedAt: string
  nodeCount: number
  taskCount: number
  findingCount: number
  coverage: {
    total: number
    tested: number
    waived: number
    blocked: number
    untested: number
  }
}

export function encodeWorkspaceId(workspaceRoot: string, path: string): string {
  const rel = relative(workspaceRoot, path).replace(/\\/g, '/')
  return Buffer.from(rel, 'utf8').toString('base64url')
}

export function resolveWorkspaceId(
  workspaceRoot: string,
  id: string,
): string | undefined {
  try {
    const rel = Buffer.from(id, 'base64url').toString('utf8')
    const abs = resolve(workspaceRoot, rel)
    if (!existsSync(resolve(abs, 'pentest-state.sqlite'))) return undefined
    return abs
  } catch {
    return undefined
  }
}

export function discoverWorkspaces(workspaceRoot: string): WorkspaceListItem[] {
  const roots = new Set<string>()

  const candidate = resolve(workspaceRoot, 'pentest-state.sqlite')
  if (existsSync(candidate)) roots.add(workspaceRoot)

  if (existsSync(workspaceRoot)) {
    for (const level of readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!level.isDirectory()) continue
      const one = resolve(workspaceRoot, level.name, 'pentest-state.sqlite')
      if (existsSync(one)) {
        roots.add(resolve(workspaceRoot, level.name))
        continue
      }
      const two = resolve(workspaceRoot, level.name)
      if (!existsSync(two)) continue
      for (const sub of readdirSync(two, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue
        const nested = resolve(two, sub.name, 'pentest-state.sqlite')
        if (existsSync(nested)) roots.add(resolve(two, sub.name))
      }
    }
  }

  const items: WorkspaceListItem[] = []
  for (const path of roots) {
    try {
      const state = loadState(path)
      const gap = coverageGap(path)
      items.push({
        id: encodeWorkspaceId(workspaceRoot, path),
        path,
        rel: relative(workspaceRoot, path).replace(/\\/g, '/'),
        name: state.run.name,
        targetUrl: state.run.targetUrl,
        profile: state.run.profile,
        status: state.run.status,
        createdAt: state.run.createdAt,
        updatedAt: state.run.updatedAt,
        nodeCount: state.surface.nodes.length,
        taskCount: state.tasks.length,
        findingCount: state.findings.length,
        coverage: {
          total: gap.total,
          tested: gap.tested,
          waived: gap.waived,
          blocked: gap.blocked,
          untested: gap.untested,
        },
      })
    } catch {
      // skip broken or mid-write workspaces
    }
  }

  return items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}
