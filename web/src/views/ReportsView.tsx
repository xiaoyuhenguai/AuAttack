import { useState } from 'react'
import { usePolling } from '../api/client'
import { MarkdownView } from '../components/ui'
import type { FileEntry } from '../api/types'

interface ReportsPayload {
  files: FileEntry[]
}

export function ReportsView({ wsId }: { wsId: string }) {
  const { data, error } = usePolling<ReportsPayload>(`/api/workspaces/${wsId}/reports`, 10000)
  const [preview, setPreview] = useState<string | undefined>()
  const [previewName, setPreviewName] = useState<string>()
  const files = data?.files ?? []

  async function open(name: string, kind: FileEntry['kind']) {
    if (kind === 'markdown' || kind === 'text' || kind === 'json') {
      const text = await (await fetch(`/api/workspaces/${wsId}/reports/${encodeURIComponent(name)}`)).text()
      setPreview(text)
      setPreviewName(name)
    } else {
      window.open(`/api/workspaces/${wsId}/reports/${encodeURIComponent(name)}`, '_blank')
    }
  }

  return (
    <div className="flex-row">
      <div className="panel" style={{ maxWidth: 420 }}>
        <h3>报告文件</h3>
        <div className="panel-body">
          {files.length === 0 ? (
            <div className="empty">{error ?? '暂无报告(报告被 coverage gate 阻塞或未生成)'}</div>
          ) : (
            <table className="data">
              <tbody>
                {files.map(file => (
                  <tr key={file.name} onClick={() => open(file.name, file.kind)} style={{ cursor: 'pointer' }}>
                    <td className="mono">{file.name}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{(file.size / 1024).toFixed(1)} KB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div className="panel grow">
        <h3>{previewName ?? '预览'}</h3>
        <div className="panel-body markdown-body">
          {preview ? <MarkdownView markdown={preview} /> : <div className="empty">点击左侧文件预览(非 markdown 二进制将新窗口下载)</div>}
        </div>
      </div>
    </div>
  )
}
