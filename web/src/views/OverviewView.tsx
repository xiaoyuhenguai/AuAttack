import { usePolling, type PollingState } from '../api/client'
import { Badge, CoverageBar, StatTile } from '../components/ui'

interface Overview {
  overview: {
    run: { status: string; targetUrl: string; profile: string; updatedAt: string }
    surface: { nodes: number; edges: number; nodeKinds: Record<string, number> }
    traffic: { total: number; sources: Record<string, number>; untrusted: number }
    tasks: Record<string, number>
    findings: Record<string, number>
    coverage: { total: number; tested: number; waived: number; blocked: number; untested: number }
    events: { total: number; types: Record<string, number> }
    runnableTasks: string[]
  }
  run: { status: string }
}

export function OverviewView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<Overview>(`/api/workspaces/${wsId}`)
  const overview = data?.overview
  if (!overview) return <div className="empty">{error ?? '加载中…'}</div>
  const nodeKinds = Object.entries(overview.surface.nodeKinds)
  const taskEntries = Object.entries(overview.tasks)
  const findingEntries = Object.entries(overview.findings)
  const cov = overview.coverage

  return (
    <div>
      <div className="tile-grid">
        <StatTile label="Run 状态" value={<Badge status={overview.run.status} />} note={overview.run.profile} />
        <StatTile label="表面节点" value={overview.surface.nodes} note={`${overview.surface.edges} 边`} />
        <StatTile label="导入流量" value={overview.traffic.total} note={`untrusted ${overview.traffic.untrusted}`} />
        <StatTile label="任务" value={taskEntries.reduce((a, [, v]) => a + v, 0)} note={taskEntries.map(([k, v]) => `${k}:${v}`).join(' ')} />
        <StatTile label="发现" value={findingEntries.reduce((a, [, v]) => a + v, 0)} note={findingEntries.map(([k, v]) => `${k}:${v}`).join(' ')} />
        <StatTile label="事件" value={overview.events.total} />
      </div>

      <div className="panel">
        <h3>覆盖</h3>
        <div className="panel-body">
          <CoverageBar tested={cov.tested} waived={cov.waived} blocked={cov.blocked} untested={cov.untested} />
          <p style={{ color: 'var(--text-dim)' }}>tested {cov.tested} · waived {cov.waived} · blocked {cov.blocked} · untested {cov.untested} / {cov.total}</p>
        </div>
      </div>

      <div className="flex-row">
        <div className="panel grow">
          <h3>表面类型</h3>
          <div className="panel-body">
            <table className="data">
              <tbody>
                {nodeKinds.map(([kind, count]) => (
                  <tr key={kind}><td>{kind}</td><td>{count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel grow">
          <h3>可运行任务</h3>
          <div className="panel-body">
            {overview.runnableTasks.length === 0 ? (
              <div className="empty">无(recon 阶段未闭合或全部终结)</div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {overview.runnableTasks.map(id => <li key={id}>{id}</li>)}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
