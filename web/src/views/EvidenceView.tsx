import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'
import type { FileEntry } from '../api/types'

interface EvidenceItem {
  evidenceId: string
  directory: string
  files: FileEntry[]
  request?: { method: string; url: string }
  statusCode?: number
}

export function EvidenceView({ wsId }: { wsId: string }) {
  const [items, setItems] = useState<EvidenceItem[]>([])
  const [selected, setSelected] = useState<EvidenceItem | undefined>()
  const [fileContent, setFileContent] = useState<{ kind: string; text?: string; image?: string } | undefined>()
  const [pageLines, setPageLines] = useState<string[]>([])
  const [pageStart, setPageStart] = useState(1)
  const [pageTotal, setPageTotal] = useState(0)
  const [currentFile, setCurrentFile] = useState<FileEntry | undefined>()
  const PAGE = 500

  async function refresh() {
    const data = await apiGet<{ items: EvidenceItem[] }>(`/api/workspaces/${wsId}/evidence`)
    setItems(data.items)
  }

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, 8000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsId])

  async function loadPage(item: EvidenceItem, file: FileEntry, start: number) {
    const url = `/api/workspaces/${wsId}/evidence/${encodeURIComponent(item.evidenceId)}/file/${encodeURIComponent(file.name)}`
    if (file.kind === 'png' || file.kind === 'bin') {
      const blob = await (await fetch(url)).blob()
      setFileContent({ kind: 'image', image: URL.createObjectURL(blob) })
      setPageLines([])
      setPageTotal(0)
      return
    }
    const paged = await apiGet<{ lines: Array<{ lineNumber: number; text: string }>; totalLines: number; start: number; count: number }>(
      `${url}?start=${start}&count=${PAGE}`,
    )
    setFileContent({ kind: 'text' })
    setPageStart(start)
    setPageTotal(paged.totalLines)
    setPageLines(prev => (start === 1 ? paged.lines.map(l => l.text) : [...prev, ...paged.lines.map(l => l.text)]))
  }

  async function openFile(item: EvidenceItem, file: FileEntry) {
    setSelected(item)
    setCurrentFile(file)
    setFileContent(undefined)
    setPageLines([])
    await loadPage(item, file, 1)
  }

  return (
    <div className="flex-row">
      <div className="panel grow" style={{ maxWidth: 420 }}>
        <h3>证据目录 ({items.length})</h3>
        <div className="panel-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {items.length === 0 ? (
            <div className="empty">暂无证据</div>
          ) : (
            <table className="data">
              <tbody>
                {items.map(item => (
                  <tr key={item.evidenceId} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{item.evidenceId}</td>
                    <td className="mono" style={{ wordBreak: 'break-all' }}>
                      {item.request ? `${item.request.method} ${item.request.url}` : '—'}
                      {item.statusCode ? ` → ${item.statusCode}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="panel grow">
        <h3>{(selected ? `${selected.evidenceId} 的 ` : '') + '文件'}</h3>
        <div className="panel-body">
          {!selected ? (
            <div className="empty">点左侧证据 ID 查看文件(左键)或先选择</div>
          ) : (
            <div className="flex-col">
              <div className="flex-row">
                {selected.files.map(file => (
                  <button key={file.name} className="btn" onClick={() => openFile(selected, file)}>
                    {file.name} ({file.kind})
                  </button>
                ))}
              </div>
              {fileContent?.kind === 'image' && fileContent.image ? (
                <img src={fileContent.image} alt="evidence" style={{ maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 8 }} />
              ) : pageLines.length > 0 ? (
                <>
                  <pre className="dump">{pageLines.join('\n')}</pre>
                  <div style={{ textAlign: 'center', padding: 8 }}>
                    <button
                      className="btn"
                      onClick={() => selected && currentFile && loadPage(selected, currentFile, pageStart + PAGE)}
                    >
                      加载更多 (已显示 {pageStart + pageLines.length - 1} / {pageTotal} 行)
                    </button>
                  </div>
                </>
              ) : fileContent?.text ? (
                <pre className="dump">{fileContent.text}</pre>
              ) : (
                <div className="empty">选择上方文件查看内容</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
