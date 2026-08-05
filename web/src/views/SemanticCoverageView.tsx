import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { Badge, StatTile } from '../components/ui'

interface SemanticCoveragePayload {
  classes: string[]
  total: number
  rows: Array<{
    nodeId: string
    kind: string
    target: string
    trafficStatus: 'tested' | 'waived' | 'blocked' | 'untested'
    hasTraffic: boolean
    ledger: Record<string, string>
    probeSignatures: { injection: number; xss: number; lfi: number }
    anyLedger: boolean
  }>
  stats: {
    nodesWithLedger: number
    nodesTrafficOnly: number
    nodesNothing: number
    byClass: Record<string, number>
  }
}

type RowFilter = 'all' | 'ledger' | 'traffic-only' | 'nothing'

export function SemanticCoverageView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<SemanticCoveragePayload>(`/api/workspaces/${wsId}/semantic-coverage`, 6000)
  const [filter, setFilter] = useState<RowFilter>('all')

  const rows = useMemo(() => {
    if (!data) return []
    switch (filter) {
      case 'ledger':
        return data.rows.filter(r => r.anyLedger)
      case 'traffic-only':
        return data.rows.filter(r => !r.anyLedger && r.hasTraffic)
      case 'nothing':
        return data.rows.filter(r => !r.anyLedger && !r.hasTraffic)
      default:
        return data.rows
    }
  }, [data, filter])

  if (!data) return <div className="empty">{error ?? '加载中…'}</div>

  return (
    <div className="flex-col">
      <div className="tile-grid">
        <StatTile label="总节点" value={data.total} />
        <StatTile label="有账本记录(测过)" value={data.stats.nodesWithLedger} note="权威:agent 显式记录" />
        <StatTile label="仅流量(未测类)" value={data.stats.nodesTrafficOnly} note="有流量,但没测过任何漏洞类" />
        <StatTile label="无任何数据" value={data.stats.nodesNothing} note="既无流量也无账本" />
      </div>

      <div className="toolbar">
        <select value={filter} onChange={e => setFilter(e.target.value as RowFilter)}>
          <option value="all">全部 ({data.rows.length})</option>
          <option value="ledger">有账本 ({data.stats.nodesWithLedger})</option>
          <option value="traffic-only">仅流量 ({data.stats.nodesTrafficOnly})</option>
          <option value="nothing">无任何 ({data.stats.nodesNothing})</option>
        </select>
        <span>单元格 = 账本结果(positive 绿 / negative 灰 / suspected 黄 / blocked 橙);"·" = 该类未测。横向滚动。</span>
        <span className="refresh-note">{error ?? '6s 轮询'}</span>
      </div>

      <div className="panel">
        <h3>语义覆盖矩阵(流量 + 账本逐类结果)</h3>
        <div className="panel-body" style={{ overflowX: 'auto' }}>
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>目标</th>
                <th>流量</th>
                {data.classes.map(cls => (
                  <th key={cls} title={data.stats.byClass[cls] ? `已测 ${data.stats.byClass[cls]} 个` : undefined}>{cls}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.nodeId}>
                  <td className="mono" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.target}
                  </td>
                  <td><Badge status={row.trafficStatus} /></td>
                  {data.classes.map(cls => {
                    const result = row.ledger[cls]
                    return (
                      <td key={cls} style={{ textAlign: 'center' }}>
                        {result && result !== 'untested' ? (
                          <Badge status={result} />
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>·</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <div className="empty">无匹配行</div> : null}
        </div>
      </div>
    </div>
  )
}
