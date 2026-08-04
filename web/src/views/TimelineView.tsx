import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../api/client'
import type { Event } from '../api/types'

const PAGE = 200

export function TimelineView({ wsId }: { wsId: string }) {
  const [events, setEvents] = useState<Event[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState('')
  const offsetRef = useRef(0)
  const loadingRef = useRef(false)

  async function loadMore(reset = false) {
    if (loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const offset = reset ? 0 : offsetRef.current
      const data = await apiGet<{ events: Event[]; total: number }>(
        `/api/workspaces/${wsId}/events?limit=${PAGE}&offset=${offset}`,
      )
      setTotal(data.total)
      setEvents(prev => (reset ? data.events : [...prev, ...data.events]))
      offsetRef.current = offset + data.events.length
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  useEffect(() => {
    offsetRef.current = 0
    setEvents([])
    loadMore(true)
    const timer = setInterval(() => loadMore(true), 8000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  const filtered = typeFilter ? events.filter(e => e.type === typeFilter) : events
  const types = [...new Set(events.map(e => e.type))]

  return (
    <div>
      <div className="toolbar">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">全部类型</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span>共 {total} 条 · 滚动加载</span>
        <button className="btn" onClick={() => loadMore(true)}>刷新</button>
        <span className="refresh-note">{loading ? '加载中…' : '8s 自动刷新'}</span>
      </div>
      <div className="panel">
        <div className="panel-body">
          <table className="data">
            <thead>
              <tr><th>时间</th><th>类型</th><th>actor</th><th>详情</th></tr>
            </thead>
            <tbody>
              {filtered.map(event => (
                <tr key={event.id}>
                  <td className="mono" style={{ whiteSpace: 'nowrap' }}>{new Date(event.at).toLocaleString()}</td>
                  <td className="mono">{event.type}</td>
                  <td>{event.actor}</td>
                  <td className="mono">{event.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ textAlign: 'center', padding: 10 }}>
            <button className="btn" onClick={() => loadMore()} disabled={loading}>
              {loading ? '加载中…' : events.length >= total ? `已全部加载(${total})` : '加载更多'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
