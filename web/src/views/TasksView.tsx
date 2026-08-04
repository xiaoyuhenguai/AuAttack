import { useMemo, useState } from 'react'
import { usePolling } from '../api/client'
import { Badge } from '../components/ui'
import type { Task } from '../api/types'

export function TasksView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<{ tasks: Task[]; runnable: string[]; automation: { stage: string; action: string } }>(
    `/api/workspaces/${wsId}/tasks`,
    5000,
  )
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | undefined>()
  const tasks = data?.tasks ?? []

  const filtered = useMemo(
    () => (statusFilter ? tasks.filter(t => t.status === statusFilter) : tasks),
    [tasks, statusFilter],
  )
  const statuses = useMemo(() => [...new Set(tasks.map(t => t.status))], [tasks])

  return (
    <div>
      <div className="toolbar">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">全部状态</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="refresh-note">
          stage {data?.automation.stage ?? '?'} · action {data?.automation.action ?? '?'}
          {error ? ` · ${error}` : ''}
        </span>
      </div>
      <div className="panel">
        <div className="panel-body">
          <table className="data">
            <thead>
              <tr><th>ID</th><th>角色</th><th>状态</th><th>标题</th><th>retestWhen</th></tr>
            </thead>
            <tbody>
              {filtered.map(task => (
                <>
                  <tr key={task.id} onClick={() => setExpanded(expanded === task.id ? undefined : task.id)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{task.id}</td>
                    <td>{task.role}</td>
                    <td><Badge status={task.status} /></td>
                    <td>{task.title}</td>
                    <td className="mono">{task.retestWhen ?? ''}</td>
                  </tr>
                  {expanded === task.id ? (
                    <tr key={`${task.id}-detail`}>
                      <td colSpan={5}>
                        <dl className="detail-rows">
                          <dt>objective</dt><dd>{task.objective}</dd>
                          <dt>dependsOn</dt><dd className="mono">{task.dependsOn.join(', ') || '—'}</dd>
                          <dt>resultSummary</dt><dd>{task.resultSummary ?? '—'}</dd>
                          <dt>error</dt><dd>{task.error ?? '—'}</dd>
                          <dt>assignedAgent</dt><dd>{task.assignedAgent ?? '—'}</dd>
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
