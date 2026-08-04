import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { Badge, CytoscapeGraph, type CytoscapeElement } from '../components/ui'

interface AttackPathGraphPayload {
  paths: Array<{
    id: string
    chain: string
    status: string
    summary: string
    createdAt: string
    updatedAt: string
    steps: Array<{ id: string; sequence: number; findingId: string; targetUrl: string; findingTitle: string }>
  }>
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: '#ff6b6b',
  high: '#f0925a',
  medium: '#f2b54a',
  low: '#4f8cff',
  info: '#9aa3b2',
}

export function AttackPathsView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<AttackPathGraphPayload>(`/api/workspaces/${wsId}/attack-paths`, 6000)
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const paths = data?.paths ?? []
  const selected = paths.find(path => path.id === selectedId) ?? paths[0]

  const elements = useMemo<CytoscapeElement[]>(() => {
    if (!selected) return []
    const nodes: CytoscapeElement[] = selected.steps.map(step => ({
      data: {
        id: step.findingId,
        label: `${step.sequence}. ${step.findingTitle.length > 40 ? step.findingTitle.slice(0, 40) + '…' : step.findingTitle}`,
        url: step.targetUrl,
      },
      classes: 'finding',
    }))
    const edges: CytoscapeElement[] = []
    for (let i = 0; i < selected.steps.length - 1; i++) {
      edges.push({
        data: {
          id: `${selected.steps[i].findingId}-${selected.steps[i + 1].findingId}`,
          source: selected.steps[i].findingId,
          target: selected.steps[i + 1].findingId,
          label: '→',
        },
      })
    }
    return [...nodes, ...edges]
  }, [selected])

  const styleSheet = [
    { selector: 'node.finding', style: { 'background-color': '#f0925a', 'border-width': 2, 'border-color': '#ff6b6b', width: 34, height: 34, label: 'data(label)', 'font-size': 10, 'font-family': 'Menlo, Consolas, monospace', 'text-background-color': '#0f1117', 'text-background-opacity': 0.92, 'text-background-padding': 2, 'text-wrap': 'wrap', 'text-max-width': 190, 'text-valign': 'bottom', 'text-margin-y': 5, color: '#e6e8ee' } },
    { selector: 'edge', style: { width: 2, 'line-color': '#ff6b6b', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, label: 'data(label)', 'font-size': 10, color: '#9aa3b2' } },
  ]

  return (
    <div className="flex-col">
      <div className="toolbar">
        <span>攻击路径由确认的 findings 推导(correlation 落库)。每条链 = 有序的攻击步骤。</span>
        <span className="refresh-note">{error ?? '6s 轮询'}</span>
      </div>
      {paths.length === 0 ? (
        <div className="empty">{'暂无攻击路径。correlation 阶段运行后(pentest correlation)会从确认的 findings 推导并落库。'}</div>
      ) : (
        <div className="flex-row">
          <div className="panel" style={{ maxWidth: 360 }}>
            <h3>路径列表</h3>
            <div className="panel-body">
              <table className="data">
                <tbody>
                  {paths.map(path => (
                    <tr key={path.id} onClick={() => setSelectedId(path.id)} style={{ cursor: 'pointer', background: selected?.id === path.id ? 'var(--accent-soft)' : undefined }}>
                      <td className="mono">{path.chain}</td>
                      <td><Badge status={path.status} /></td>
                      <td>{path.steps.length} 步</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel grow">
            <h3>{selected?.chain ?? '攻击链'} · <Badge status={selected?.status ?? ''} /></h3>
            <div className="panel-body">
              <p style={{ color: 'var(--text-dim)', margin: '0 0 10px' }}>{selected?.summary}</p>
              <CytoscapeGraph elements={elements} styleSheet={styleSheet} heightClass="graph-small" />
              <table className="data" style={{ marginTop: 12 }}>
                <thead><tr><th>#</th><th>发现</th><th>目标</th></tr></thead>
                <tbody>
                  {(selected?.steps ?? []).map(step => (
                    <tr key={step.id}>
                      <td>{step.sequence}</td>
                      <td className="mono">{step.findingId} · {step.findingTitle}</td>
                      <td className="mono">{step.targetUrl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
