import { useMemo } from 'react'
import { usePolling } from '../api/client'
import { Badge } from '../components/ui'

interface SitemapEndpoint {
  key: string
  method: string
  pathname: string
  urls: string[]
  parameters: Record<string, string[]>
  parents: string[]
  children: string[]
  isApi: boolean
}

interface SitemapPayload {
  targetUrl: string
  roots: string[]
  unreferenced: string[]
  coverageByKey: Record<string, string>
  endpoints: SitemapEndpoint[]
}

const METHOD_COLOR: Record<string, string> = {
  GET: '#3ecf8e',
  POST: '#f2b54a',
  PUT: '#4f8cff',
  PATCH: '#c792ea',
  DELETE: '#ff6b6b',
  HEAD: '#9aa3b2',
  OPTIONS: '#9aa3b2',
}

export function SiteMapView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<SitemapPayload>(`/api/workspaces/${wsId}/sitemap`, 10000)

  const byKey = useMemo(() => new Map((data?.endpoints ?? []).map(e => [e.key, e])), [data])

  function renderEndpoint(key: string, depth: number) {
    const endpoint = byKey.get(key)
    if (!endpoint) return null
    const cov = data?.coverageByKey?.[endpoint.key] ?? 'untested'
    return (
      <li key={key} style={{ margin: '3px 0' }}>
        <details open={depth < 1}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 6px', borderRadius: 6, background: depth % 2 === 0 ? 'var(--bg-elev-2)' : 'transparent' }}>
            <span className="mono" style={{ color: METHOD_COLOR[endpoint.method] ?? '#9aa3b2', fontWeight: 700, minWidth: 52 }}>{endpoint.method}</span>
            <span className="mono">{endpoint.pathname}</span>
            {endpoint.isApi ? <span className="badge info" style={{ marginLeft: 0 }}>API</span> : null}
            <Badge status={cov} />
            {endpoint.parameters && Object.keys(endpoint.parameters).length > 0 ? (
              <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                参数 {Object.values(endpoint.parameters).flat().length}
              </span>
            ) : null}
          </summary>
          {endpoint.children.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: '4px 0 0 20px', paddingLeft: 16, borderLeft: '1px solid var(--border)' }}>
              {endpoint.children.map(child => renderEndpoint(child, depth + 1))}
            </ul>
          ) : null}
        </details>
      </li>
    )
  }

  return (
    <div>
      <div className="toolbar">
        <span>站点地图树:从流量 Referer 推导的父子关系;method 着色,API 标记,coverage 徽章。</span>
        <span className="refresh-note">{error ?? '10s 轮询'}</span>
      </div>
      <div className="panel">
        <h3>站点地图 · {data?.targetUrl ?? ''} · {data?.endpoints.length ?? 0} 端点</h3>
        <div className="panel-body">
          {!data || data.endpoints.length === 0 ? (
            <div className="empty">{error ?? '暂无端点(流量导入后才有站点地图)'}</div>
          ) : (
            <>
              <ul style={{ listStyle: 'none', margin: 0, paddingLeft: 0 }}>
                {(data.roots.length > 0 ? data.roots : data.endpoints.filter(e => e.parents.length === 0).map(e => e.key)).map(key => renderEndpoint(key, 0))}
              </ul>
              {data.unreferenced.length > 0 ? (
                <div style={{ marginTop: 18 }}>
                  <h4 style={{ color: 'var(--text-dim)', margin: '0 0 8px' }}>未关联(无 Referer 父节点)</h4>
                  <table className="data">
                    <tbody>
                      {data.unreferenced.map(key => {
                        const e = byKey.get(key)
                        if (!e) return null
                        const cov = data.coverageByKey?.[e.key] ?? 'untested'
                        return (
                          <tr key={e.key}>
                            <td className="mono" style={{ color: METHOD_COLOR[e.method] ?? '#9aa3b2', fontWeight: 700 }}>{e.method}</td>
                            <td className="mono">{e.pathname}</td>
                            <td><Badge status={cov} /></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
