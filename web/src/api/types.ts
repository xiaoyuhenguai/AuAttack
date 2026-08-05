/** Shared API payload types (mirrors the Bun.serve backend shapes). */

export interface WorkspaceListItem {
  id: string
  path: string
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

export interface SurfaceNode {
  id: string
  kind: string
  value: string
  source: string
  attributes: Record<string, string | number | boolean | null>
  createdAt: string
}

export interface SurfaceEdge {
  id: string
  from: string
  to: string
  relation: string
  source: string
  createdAt: string
  classification?: 'structural' | 'offensive'
}

export interface Task {
  id: string
  role: string
  title: string
  objective: string
  status: string
  dependsOn: string[]
  assignedAgent?: string
  startedAt?: string
  completedAt?: string
  resultSummary?: string
  error?: string
  attempts?: number
  retestWhen?: string
}

export interface Finding {
  id: string
  taskId: string
  hypothesisId: string
  sourceAgent: string
  title: string
  type: string
  severity: string
  status: string
  targetUrl: string
  description: string
  evidencePaths: string[]
  createdAt: string
  updatedAt: string
  verificationNotes?: string
}

export interface Event {
  id: string
  at: string
  type: string
  actor: string
  detail: string
}

export interface BlackboardNode {
  id: string
  type: 'fact' | 'intent' | 'hint'
  status: 'proposed' | 'in_progress' | 'confirmed' | 'rejected' | 'superseded'
  description: string
  parentIds: string[]
  confidence?: number
  createdBy: string
  createdAt: string
  updatedAt?: string
  sourceTaskId?: string
}

export interface CoverageGap {
  total: number
  tested: number
  waived: number
  blocked: number
  untested: number
  untestedNodes: SurfaceNode[]
  orphanNodes: SurfaceNode[]
  blockedNodes: SurfaceNode[]
}

export type FileKind = 'markdown' | 'text' | 'json' | 'html' | 'docx' | 'pdf' | 'png' | 'bin'

export interface FileEntry {
  name: string
  size: number
  modifiedAt: string
  kind: FileKind
}
