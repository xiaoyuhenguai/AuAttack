import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { Badge } from '../components/ui'
import type { Finding } from '../api/types'

export function FindingsView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<{ findings: Finding[] }>(`/api/workspaces/${wsId}/findings`, 5000)
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | undefined>()
  const findings = data?.findings ?? []

  const filtered = useMemo(
    () => (statusFilter ? findings.filter(f => f.status === statusFilter) : findings),
    [findings, statusFilter],
  )
  const statuses = useMemo(() => [...new Set(findings.map(f => f.status))], [findings])

  if (findings.length === 0) return <div className="empty">{error ?? '暂无发现。'}</div>

  return (
    <div>
      <div className="toolbar">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="refresh-note">{error ?? '5s 轮询'}</span>
      </div>
      <div className="panel">
        <div className="panel-body">
          <table className="data">
            <thead>
              <tr><th>ID</th><th>严重度</th><th>状态</th><th>标题</th><th>目标</th></tr>
            </thead>
            <tbody>
              {filtered.map(finding => (
                <>
                  <tr key={finding.id} onClick={() => setExpanded(expanded === finding.id ? undefined : finding.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{finding.id}</td>
                    <td><Badge status={finding.severity} /></td>
                    <td><Badge status={finding.status} /></td>
                    <td>{finding.title}</td>
                    <td className="mono">{finding.targetUrl}</td>
                  </tr>
                  {expanded === finding.id ? (
                    <tr key={`${finding.id}-detail`}>
                      <td colSpan={5}>
                        <dl className="detail-rows">
                          <dt>类型</dt><dd>{finding.type}</dd>
                          <dt>描述</dt><dd>{finding.description}</dd>
                          <dt>证据</dt><dd className="mono">{finding.evidencePaths.join(', ') || '—'}</dd>
                          <dt>来源</dt><dd>{finding.sourceAgent} ({finding.taskId})</dd>
                          <dt>验证</dt><dd>{finding.verificationNotes ?? '—'}</dd>
                        </dl>
                      </td>
                    </tr>
                  ) : null}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
