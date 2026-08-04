import { useState } from 'react'
import { usePolling } from './api/client'
import type { WorkspaceListItem } from './api/types'
import { OverviewView } from './views/OverviewView'
import { ReconView } from './views/ReconView'
import { SurfaceView } from './views/SurfaceView'
import { SiteMapView } from './views/SiteMapView'
import { TasksView } from './views/TasksView'
import { FindingsView } from './views/FindingsView'
import { CoverageView } from './views/CoverageView'
import { TimelineView } from './views/TimelineView'
import { EvidenceView } from './views/EvidenceView'
import { ReportsView } from './views/ReportsView'
import { BlackboardView } from './views/BlackboardView'
import { AttackPathsView } from './views/AttackPathsView'

type TabKey =
  | 'overview'
  | 'recon'
  | 'surface'
  | 'sitemap'
  | 'tasks'
  | 'findings'
  | 'coverage'
  | 'timeline'
  | 'evidence'
  | 'reports'
  | 'blackboard'
  | 'attackpaths'

const TABS: Array<{ key: TabKey; label: string; dot?: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'recon', label: '信息收集' },
  { key: 'surface', label: '攻击面图' },
  { key: 'sitemap', label: '站点地图' },
  { key: 'attackpaths', label: '攻击链', dot: '#ff6b6b' },
  { key: 'tasks', label: '任务' },
  { key: 'findings', label: '发现' },
  { key: 'coverage', label: '覆盖' },
  { key: 'timeline', label: '时间线' },
  { key: 'evidence', label: '证据' },
  { key: 'reports', label: '报告' },
  { key: 'blackboard', label: '黑板', dot: '#c792ea' },
]

function statusDot(status: string): string {
  switch (status) {
    case 'completed':
      return '#3ecf8e'
    case 'running':
      return '#4f8cff'
    case 'failed':
      return '#ff6b6b'
    default:
      return '#f2b54a'
  }
}

export default function App() {
  const { data } = usePolling<{ workspaces: WorkspaceListItem[] }>('/api/workspaces', 10000)
  const [activeWsId, setActiveWsId] = useState<string | undefined>()
  const [tab, setTab] = useState<TabKey>('overview')
  const workspaces = data?.workspaces ?? []
  const active = workspaces.find(w => w.id === activeWsId) ?? workspaces[0]

  return (
    <div className="console">
      <aside className="sidebar">
        <h1>AuAttack 控制台</h1>
        <div className="sub">只读监控 · 轮询展示</div>
        <div className="ws-list">
          {workspaces.length === 0 ? (
            <div className="empty">未发现 workspace</div>
          ) : (
            workspaces.map(ws => (
              <button
                key={ws.id}
                className={`ws-item ${active?.id === ws.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveWsId(ws.id)
                  setTab('overview')
                }}
              >
                <div className="ws-target">{ws.targetUrl}</div>
                <div className="ws-meta">
                  {ws.profile} · {ws.status} · {ws.taskCount} 任务 · {ws.findingCount} 发现
                  {' · '}
                  <span
                    style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: statusDot(ws.status), verticalAlign: 1 }}
                  />
                </div>
              </button>
            ))
          )}
        </div>
      </aside>
      <main className="main">
        <nav className="tabbar">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.dot ? <span className="dot" style={{ background: t.dot }} /> : null}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="content">
          {!active ? (
            <div className="empty">选择左侧 workspace 开始浏览</div>
          ) : (
            <TabContent wsId={active.id} tab={tab} />
          )}
        </div>
      </main>
    </div>
  )
}

function TabContent({ wsId, tab }: { wsId: string; tab: TabKey }) {
  switch (tab) {
    case 'overview':
      return <OverviewView wsId={wsId} />
    case 'recon':
      return <ReconView wsId={wsId} />
    case 'surface':
      return <SurfaceView wsId={wsId} />
    case 'sitemap':
      return <SiteMapView wsId={wsId} />
    case 'tasks':
      return <TasksView wsId={wsId} />
    case 'findings':
      return <FindingsView wsId={wsId} />
    case 'coverage':
      return <CoverageView wsId={wsId} />
    case 'timeline':
      return <TimelineView wsId={wsId} />
    case 'evidence':
      return <EvidenceView wsId={wsId} />
    case 'reports':
      return <ReportsView wsId={wsId} />
    case 'blackboard':
      return <BlackboardView wsId={wsId} />
    case 'attackpaths':
      return <AttackPathsView wsId={wsId} />
    default:
      return null
  }
}
