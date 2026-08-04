import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { CytoscapeGraph, type CytoscapeElement } from '../components/ui'
import type { SurfaceEdge, SurfaceNode } from '../api/types'

const KIND_COLOR: Record<string, string> = {
  origin: '#4f8cff',
  route: '#3ecf8e',
  parameter: '#f2b54a',
  technology: '#c792ea',
  port: '#f0925a',
  'file-surface': '#7fd1e0',
  'business-action': '#f7bd54',
  session: '#a78bfa',
}

const COVER_BORDER: Record<string, string> = {
  tested: '#3ecf8e',
  waived: '#f2b54a',
  blocked: '#f0925a',
  untested: '#ff6b6b',
}

export function SurfaceView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<{
    nodes: SurfaceNode[]
    edges: SurfaceEdge[]
    coverageByNode: Record<string, { status: string; evidenceIds: string[] }>
  }>(`/api/workspaces/${wsId}/surface`, 8000)
  const [selected, setSelected] = useState<Record<string, unknown> | undefined>()
  const [kindFilter, setKindFilter] = useState('all')

  const kinds = useMemo(() => [...new Set((data?.nodes ?? []).map(n => n.kind))], [data])

  const elements = useMemo<CytoscapeElement[]>(() => {
    if (!data) return []
    const nodeMap = new Map(data.nodes.map(n => [n.id, n]))
    const visibleNodes = (kindFilter === 'all' ? data.nodes : data.nodes.filter(n => n.kind === kindFilter)).slice(0, 1200)
    const nodes: CytoscapeElement[] = visibleNodes.map(node => {
      const cov = data.coverageByNode[node.id]?.status ?? 'untested'
      return {
        data: {
          id: node.id,
          label: node.kind === 'parameter' ? node.value.split(':').pop() ?? node.value : node.value.length > 46 ? node.value.slice(0, 46) + '…' : node.value,
          kind: node.kind,
          value: node.value,
          source: node.source,
          attributes: node.attributes,
          cov,
        },
        classes: `${node.kind} cov-${cov}`,
      }
    })
    const edges: CytoscapeElement[] = data.edges
      .filter(edge => nodeMap.has(edge.from) && nodeMap.has(edge.to))
      .map(edge => ({
        data: {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          label: edge.relation,
          classification: edge.classification ?? 'structural',
        },
        classes: edge.classification === 'offensive' ? 'offensive' : '',
      }))
    return [...nodes, ...edges]
  }, [data, kindFilter])

  const styleSheet = [
    { selector: 'node', style: { label: 'data(label)', 'font-size': 11, 'font-family': 'Menlo, Consolas, monospace', color: '#e6e8ee', 'text-background-color': '#0f1117', 'text-background-opacity': 0.92, 'text-background-padding': 2, 'text-wrap': 'wrap', 'text-max-width': 150, 'text-valign': 'bottom', 'text-margin-y': 6, 'border-width': 3 } },
    { selector: 'node.origin', style: { 'background-color': KIND_COLOR.origin, shape: 'round-rectangle', width: 44, height: 44 } },
    { selector: 'node.route', style: { 'background-color': KIND_COLOR.route, width: 30, height: 30 } },
    { selector: 'node.parameter', style: { 'background-color': KIND_COLOR.parameter, shape: 'triangle', width: 18, height: 18, 'text-font-size': 10 } },
    { selector: 'node.technology', style: { 'background-color': KIND_COLOR.technology, shape: 'diamond', width: 26, height: 26 } },
    { selector: 'node.port', style: { 'background-color': KIND_COLOR.port, shape: 'hexagon', width: 26, height: 26 } },
    { selector: 'node.session', style: { 'background-color': KIND_COLOR.session } },
    { selector: 'node.file-surface', style: { 'background-color': KIND_COLOR['file-surface'] } },
    { selector: 'node.business-action', style: { 'background-color': KIND_COLOR['business-action'] } },
    { selector: 'node.cov-tested', style: { 'border-color': COVER_BORDER.tested } },
    { selector: 'node.cov-waived', style: { 'border-color': COVER_BORDER.waived } },
    { selector: 'node.cov-blocked', style: { 'border-color': COVER_BORDER.blocked } },
    { selector: 'node.cov-untested', style: { 'border-color': COVER_BORDER.untested } },
    { selector: 'node:selected', style: { 'border-width': 5, 'border-color': '#ffffff' } },
    { selector: 'edge', style: { width: 1.5, 'line-color': '#4a5163', 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.7, label: 'data(label)', 'font-size': 8, color: '#9aa3b2', 'text-background-color': '#171a22', 'text-background-opacity': 0.9 } },
    { selector: 'edge.offensive', style: { 'line-color': '#ff6b6b', width: 3, 'line-style': 'dashed' } },
  ]

  return (
    <div className="flex-col">
      <div className="toolbar">
        <select value={kindFilter} onChange={e => setKindFilter(e.target.value)}>
          <option value="all">全部节点 ({data?.nodes.length ?? 0})</option>
          {kinds.map(kind => (
            <option key={kind} value={kind}>{kind} ({(data?.nodes ?? []).filter(n => n.kind === kind).length})</option>
          ))}
        </select>
        <span>节点按 kind 着色,边框按 coverage(tested 绿 / waived 黄 / blocked 橙 / untested 红)。点击节点看详情。</span>
        <span className="refresh-note">{error ?? '8s 轮询'}</span>
      </div>
      <CytoscapeGraph elements={elements} styleSheet={styleSheet} onSelect={setSelected} />
      {selected ? (
        <div className="panel">
          <h3>{String(selected.id)}</h3>
          <div className="panel-body">
            <dl className="detail-rows">
              <dt>值</dt><dd className="mono">{String(selected.value)}</dd>
              <dt>kind</dt><dd>{String(selected.kind)}</dd>
              <dt>来源</dt><dd>{String(selected.source)}</dd>
              <dt>覆盖</dt><dd><span className={`badge ${String(selected.cov)}`}>{String(selected.cov)}</span></dd>
              <dt>属性</dt><dd className="mono">{JSON.stringify(selected.attributes)}</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  )
}
