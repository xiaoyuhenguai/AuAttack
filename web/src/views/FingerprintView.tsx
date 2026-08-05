import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { StatTile } from '../components/ui'

interface FingerprintPayload {
  technologies: Array<{
    id: string
    value: string
    source: string
    product: string
    version: string
    evidence: string
    confidence: number
    categories: string
    affected: boolean
  }>
  affectedCveCount: number
  analyzedAt: string | null
}

export function FingerprintView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<FingerprintPayload>(`/api/workspaces/${wsId}/fingerprints`, 8000)
  const [sourceFilter, setSourceFilter] = useState('all')

  const sources = useMemo(() => {
    const set = new Set<string>()
    for (const tech of data?.technologies ?? []) {
      const source = tech.source.split(':')[0] ?? 'unknown'
      set.add(source)
    }
    return [...set].sort()
  }, [data])

  const rows = useMemo(() => {
    const list = data?.technologies ?? []
    if (sourceFilter === 'all') return list
    return list.filter(tech => (tech.source.split(':')[0] ?? 'unknown') === sourceFilter)
  }, [data, sourceFilter])

  const fpCount = (data?.technologies ?? []).filter(t => t.source.startsWith('fingerprint:')).length

  return (
    <div className="flex-col">
      <div className="tile-grid">
        <StatTile label="技术总数" value={data?.technologies.length ?? 0} />
        <StatTile label="指纹识别得出" value={fpCount} note="fingerprint: 来源" />
        <StatTile label="受影响 CVE" value={data?.affectedCveCount ?? 0} note={data?.analyzedAt ? `cve 分析于 ${new Date(data.analyzedAt).toLocaleString()}` : '未分析'} />
      </div>

      <div className="toolbar">
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="all">全部来源 ({data?.technologies.length ?? 0})</option>
          {sources.map(source => (
            <option key={source} value={source}>{source} ({(data?.technologies ?? []).filter(t => (t.source.split(':')[0] ?? 'unknown') === source).length})</option>
          ))}
        </select>
        <span>Wappalyzer + FingerprintHub 双源指纹(recon 闭合时自动跑);命中证据列 = 判定依据。</span>
        <span className="refresh-note">{error ?? '8s 轮询'}</span>
      </div>

      <div className="panel">
        <h3>技术指纹</h3>
        <div className="panel-body">
          {rows.length === 0 ? (
            <div className="empty">{error ?? '暂无技术节点(流量导入 + recon 闭合后指纹自动分析)'}</div>
          ) : (
            <table className="data">
              <thead>
                <tr><th>技术</th><th>版本</th><th>类别</th><th>置信度</th><th>来源</th><th>CVE</th><th>命中证据</th></tr>
              </thead>
              <tbody>
                {rows.map(tech => (
                  <tr key={tech.id}>
                    <td className="mono">{tech.value}</td>
                    <td>{tech.version || '—'}</td>
                    <td>{tech.categories || '—'}</td>
                    <td>{tech.confidence > 0 ? `${tech.confidence}%` : '—'}</td>
                    <td className="mono">{tech.source.split(':')[0] ?? '—'}</td>
                    <td>{tech.affected ? <span className="badge critical">受影响</span> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td className="mono" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tech.evidence}>{tech.evidence || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
