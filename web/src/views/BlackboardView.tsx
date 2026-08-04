import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { CytoscapeGraph, type CytoscapeElement } from '../components/ui'
import type { BlackboardNode } from '../api/types'

const TYPE_COLOR: Record<string, string> = {
  fact: '#3ecf8e',
  intent: '#4f8cff',
  hint: '#f2b54a',
}
const STATUS_BORDER: Record<string, string> = {
  confirmed: '#3ecf8e',
  proposed: '#9aa3b2',
  in_progress: '#4f8cff',
  rejected: '#ff6b6b',
  superseded: '#6b7280',
}

export function BlackboardView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<{ nodes: BlackboardNode[]; edges: Array<{ from: string; to: string }> }>(
    `/api/workspaces/${wsId}/blackboard`,
    5000,
  )
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState<BlackboardNode | undefined>()
  const nodes = data?.nodes ?? []

  const visible = statusFilter ? nodes.filter(n => n.status === statusFilter) : nodes
  const statuses = [...new Set(nodes.map(n => n.status))]

  const elements = useMemo<CytoscapeElement[]>(() => {
    const idSet = new Set(visible.map(n => n.id))
    const nodeElements: CytoscapeElement[] = visible.map(node => ({
      data: {
        id: node.id,
        label: node.description.length > 60 ? node.description.slice(0, 60) + '…' : node.description,
        type: node.type,
        status: node.status,
        description: node.description,
        createdBy: node.createdBy,
        sourceTaskId: node.sourceTaskId,
        confidence: node.confidence,
      },
      classes: `type-${node.type} status-${node.status}`,
    }))
    const edgeElements: CytoscapeElement[] = (data?.edges ?? [])
      .filter(edge => idSet.has(edge.from) && idSet.has(edge.to))
      .map(edge => ({ data: { id: `${edge.from}-${edge.to}`, source: edge.from, target: edge.to, label: 'parent' } }))
    return [...nodeElements, ...edgeElements]
  }, [visible, data])

  const styleSheet = [
    { selector: 'node', style: { label: 'data(label)', 'font-size': 10, 'font-family': 'Menlo, Consolas, monospace', color: '#e6e8ee', 'text-background-color': '#0f1117', 'text-background-opacity': 0.92, 'text-background-padding': 2, width: 30, height: 30, 'border-width': 3, 'text-wrap': 'wrap', 'text-max-width': 170, 'text-valign': 'bottom', 'text-margin-y': 5 } },
    { selector: 'node.type-fact', style: { 'background-color': TYPE_COLOR.fact, shape: 'round-rectangle' } },
    { selector: 'node.type-intent', style: { 'background-color': TYPE_COLOR.intent } },
    { selector: 'node.type-hint', style: { 'background-color': TYPE_COLOR.hint, shape: 'diamond' } },
    { selector: 'node.status-confirmed', style: { 'border-color': STATUS_BORDER.confirmed } },
    { selector: 'node.status-proposed', style: { 'border-color': STATUS_BORDER.proposed } },
    { selector: 'node.status-in_progress', style: { 'border-color': STATUS_BORDER.in_progress } },
    { selector: 'node.status-rejected', style: { 'border-color': STATUS_BORDER.rejected, opacity: 0.55 } },
    { selector: 'node.status-superseded', style: { 'border-color': STATUS_BORDER.superseded, opacity: 0.4 } },
    { selector: 'edge', style: { width: 1.5, 'line-color': '#4a5163', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.6, label: 'data(label)', 'font-size': 7, 'text-background-color': '#171a22', 'text-background-opacity': 0.9 } },
  ]

  return (
    <div className="flex-col">
      <div className="toolbar">
        <span>Fact(绿)/Intent(蓝)/Hint(黄);边框=状态,rejected/superseded 半透明(死路不重试)。</span>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="refresh-note">{error ?? '5s 轮询'}</span>
      </div>
      {nodes.length === 0 ? (
        <div className="empty">黑板为空。hypothesis 任务(knowledge-*/cve-*/coverage-*)完成或跳过时会自动落 Fact/Intent 节点。</div>
      ) : (
        <CytoscapeGraph
          elements={elements}
          styleSheet={styleSheet}
          heightClass="graph"
          onSelect={data => {
            if ('description' in data) setSelected(data as unknown as BlackboardNode)
          }}
        />
      )}
      {selected ? (
        <div className="panel">
          <h3>{selected.id}</h3>
          <div className="panel-body">
            <dl className="detail-rows">
              <dt>类型</dt><dd>{selected.type}</dd>
              <dt>状态</dt><dd>{selected.status}</dd>
              <dt>描述</dt><dd>{selected.description}</dd>
              <dt>来源任务</dt><dd className="mono">{selected.sourceTaskId ?? '—'}</dd>
              <dt>创建者</dt><dd>{selected.createdBy}</dd>
              <dt>置信度</dt><dd>{selected.confidence ?? '—'}</dd>
              <dt>父节点</dt><dd className="mono">{selected.parentIds.join(', ') || '—'}</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  )
}
