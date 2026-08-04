import { usePolling } from '../api/client'
import { Badge, CoverageBar } from '../components/ui'
import type { CoverageGap, SurfaceNode } from '../api/types'

interface CoveragePayload {
  gap: CoverageGap
  testingSummary: Array<{ class: string; probed: number; trafficOnly: number; uncovered: number }>
  testingCoverage: Array<{
    nodeId: string
    kind: string
    value: string
    tested: boolean
    injection: string[]
    xss: string[]
    lfi: string[]
    evidenceCount: number
    injectionEvidenceCount: number
  }>
  ledger?: Array<{
    id: string
    nodeId: string
    target: string
    testClass: string
    technique?: string
    payload?: string
    result: string
    evidenceId?: string
    testedBy: string
    testedAt: string
  }>
}

const CLASS_FIELDS = [
  { key: 'injection', label: 'injection (注入)' },
  { key: 'xss', label: 'xss' },
  { key: 'lfi', label: 'lfi (路径)' },
] as const

export function CoverageView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<CoveragePayload>(`/api/workspaces/${wsId}/coverage`, 6000)
  const gap = data?.gap
  if (!gap) return <div className="empty">{error ?? '加载中…'}</div>

  return (
    <div>
      <div className="panel">
        <h3>覆盖总览</h3>
        <div className="panel-body">
          <CoverageBar tested={gap.tested} waived={gap.waived} blocked={gap.blocked} untested={gap.untested} />
          <p style={{ color: 'var(--text-dim)' }}>
            total {gap.total} · tested {gap.tested} · waived {gap.waived} · blocked {gap.blocked} · untested {gap.untested}
          </p>
        </div>
      </div>

      <div className="flex-row">
        <div className="panel grow">
          <h3>未测 ({gap.untestedNodes.length})</h3>
          <div className="panel-body">
            {gap.untestedNodes.length === 0 ? (
              <div className="empty">无</div>
            ) : (
              <table className="data">
                <tbody>
                  {gap.untestedNodes.slice(0, 60).map(node => (
                    <tr key={node.id}><td className="mono">{node.value}</td><td><Badge status={node.kind} /></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel grow">
          <h3>孤儿 / 无流量 ({gap.orphanNodes.length})</h3>
          <div className="panel-body">
            {gap.orphanNodes.length === 0 ? (
              <div className="empty">无</div>
            ) : (
              <table className="data">
                <tbody>
                  {gap.orphanNodes.slice(0, 60).map(node => (
                    <tr key={node.id}><td className="mono">{node.value}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="panel grow">
          <h3>被阻塞 ({gap.blockedNodes.length})</h3>
          <div className="panel-body">
            {gap.blockedNodes.length === 0 ? (
              <div className="empty">无</div>
            ) : (
              <table className="data">
                <tbody>
                  {gap.blockedNodes.slice(0, 60).map(node => (
                    <tr key={node.id}><td className="mono">{node.value}</td><td><Badge status="blocked" /></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>漏洞类探测覆盖(测试方向真实性)</h3>
        <div className="panel-body">
          <table className="data">
            <thead>
              <tr><th>漏洞类</th><th>有探测签名</th><th>仅流量(未验证)</th><th>未覆盖</th></tr>
            </thead>
            <tbody>
              {(data?.testingSummary ?? []).map(item => (
                <tr key={item.class}>
                  <td>{item.class}</td>
                  <td>{item.probed}</td>
                  <td>{item.trafficOnly}</td>
                  <td>{item.uncovered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h3>测试范围明细(每参数/路由 × 探测签名)</h3>
        <div className="panel-body">
          {(data?.testingCoverage ?? []).length === 0 ? (
            <div className="empty">无探测签名证据(仅流量 ≠ 已测)</div>
          ) : (
            CLASS_FIELDS.map(field => {
              const items = (data?.testingCoverage ?? []).filter(item => item[field.key].length > 0)
              if (items.length === 0) return null
              return (
                <div key={field.key} style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px' }}>{field.label} — 命中 {items.length} 项</h4>
                  <table className="data">
                    <thead>
                      <tr><th>参数/路由</th><th>探测签名</th><th>证据数 (含探测)</th></tr>
                    </thead>
                    <tbody>
                      {items.slice(0, 60).map(item => (
                        <tr key={item.nodeId}>
                          <td className="mono">{item.value}</td>
                          <td className="mono">{item[field.key].join(', ')}</td>
                          <td>{item.evidenceCount} ({item.injectionEvidenceCount})</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="panel">
        <h3>测试账本(哪个 URL+参数 测了什么、结果如何)</h3>
        <div className="panel-body">
          {(data?.ledger ?? []).length === 0 ? (
            <div className="empty">暂无记录。agent 测完一个参数后会用 test-ledger record 写入,这才是"测没测过"的权威答案。</div>
          ) : (
            <table className="data">
              <thead>
                <tr><th>目标</th><th>漏洞类</th><th>技术</th><th>结果</th><th>payload(截断)</th><th>测试者</th><th>时间</th></tr>
              </thead>
              <tbody>
                {(data?.ledger ?? []).slice().sort((a, b) => b.testedAt.localeCompare(a.testedAt)).slice(0, 100).map(record => (
                  <tr key={record.id}>
                    <td className="mono">{record.target}</td>
                    <td><Badge status={record.testClass} /></td>
                    <td>{record.technique ?? '—'}</td>
                    <td><Badge status={record.result} /></td>
                    <td className="mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.payload ?? '—'}</td>
                    <td>{record.testedBy}</td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{new Date(record.testedAt).toLocaleString()}</td>
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
