import { useState } from 'react'
import { apiPost, usePolling } from '../api/client'
import { MarkdownView } from '../components/ui'

interface ReconPayload {
  present: boolean
  markdown?: string
  path?: string
}

interface KnowledgeNote {
  role: string
  title: string
  body: string
  path: string
  createdAt: string
}

export function ReconView({ wsId }: { wsId: string }) {
  const recon = usePolling<ReconPayload>(`/api/workspaces/${wsId}/recon-summary`, 15000)
  const brief = usePolling<ReconPayload>(`/api/workspaces/${wsId}/site-brief`, 15000)
  const notes = usePolling<{ notes: KnowledgeNote[] }>(`/api/workspaces/${wsId}/knowledge-notes`, 10000)
  const [regenerating, setRegenerating] = useState(false)
  const [expandedNote, setExpandedNote] = useState<string | undefined>()

  async function regenerate() {
    setRegenerating(true)
    try {
      await apiPost<unknown>(`/api/workspaces/${wsId}/recon-summary/regenerate`)
      recon.refresh()
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div>
      <div className="toolbar">
        <span>recon-summary 是信息收集闭合交付物;site-brief 是持续交接文档</span>
        <button className="btn" onClick={regenerate} disabled={regenerating}>
          {regenerating ? '重新生成中…' : '重新生成 recon-summary'}
        </button>
        <span className="refresh-note">15s 轮询</span>
      </div>
      <div className="flex-row">
        <div className="panel grow">
          <h3>Recon Summary</h3>
          <div className="panel-body markdown-body">
            {recon.data?.present ? (
              <MarkdownView markdown={recon.data.markdown!} />
            ) : (
              <div className="empty">{recon.error ?? '尚未生成。点击"重新生成"或等 recon-002 任务运行。'}</div>
            )}
          </div>
        </div>
        <div className="panel grow">
          <h3>Site Brief</h3>
          <div className="panel-body markdown-body">
            {brief.data?.present ? (
              <MarkdownView markdown={brief.data.markdown!} />
            ) : (
              <div className="empty">{brief.error ?? '尚未生成。'}</div>
            )}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>知识笔记(agent 沉淀)</h3>
        <div className="panel-body">
          {notes.data?.notes.length === 0 || !notes.data ? (
            <div className="empty">暂无。agent 用 `knowledge note` 记录实战心得后在此展示。</div>
          ) : (
            <table className="data">
              <tbody>
                {notes.data.notes.map(note => (
                  <>
                    <tr key={note.path} onClick={() => setExpandedNote(expandedNote === note.path ? undefined : note.path)} style={{ cursor: 'pointer' }}>
                      <td>{note.role}</td>
                      <td>{note.title}</td>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{note.createdAt ? new Date(note.createdAt).toLocaleString() : ''}</td>
                    </tr>
                    {expandedNote === note.path ? (
                      <tr key={`${note.path}-body`}>
                        <td colSpan={3}><MarkdownView markdown={note.body} /></td>
                      </tr>
                    ) : null}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
