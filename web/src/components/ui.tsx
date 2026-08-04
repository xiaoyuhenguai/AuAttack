import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export function StatTile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="tile">
      <div className="t-label">{label}</div>
      <div className="t-value">{value}</div>
      {note ? <div className="t-note">{note}</div> : null}
    </div>
  )
}

export function Badge({ status }: { status: string }) {
  return <span className={`badge ${status}`}>{status}</span>
}

export function CoverageBar({
  tested,
  waived,
  blocked,
  untested,
}: {
  tested: number
  waived: number
  blocked: number
  untested: number
}) {
  const total = Math.max(tested + waived + blocked + untested, 1)
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`
  return (
    <div className="cov-bar">
      {tested > 0 && <div className="seg-tested" style={{ width: pct(tested) }} />}
      {waived > 0 && <div className="seg-waived" style={{ width: pct(waived) }} />}
      {blocked > 0 && <div className="seg-blocked" style={{ width: pct(blocked) }} />}
      {untested > 0 && <div className="seg-untested" style={{ width: pct(untested) }} />}
    </div>
  )
}

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  )
}

export interface CytoscapeElement {
  data: Record<string, unknown>
  classes?: string
}

/** Minimal Cytoscape wrapper: renders nodes/edges with fcose layout. */
export function CytoscapeGraph({
  elements,
  styleSheet,
  onSelect,
  heightClass = 'graph',
}: {
  elements: CytoscapeElement[]
  styleSheet: object[]
  onSelect?: (data: Record<string, unknown>) => void
  heightClass?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const cyRef = useRef<import('cytoscape').Core | null>(null)
  // Always hold the latest elements: cytoscape loads asynchronously, so the
  // mount closure may see empty elements even after the polling data arrived.
  const elementsRef = useRef(elements)
  elementsRef.current = elements
  const styleRef = useRef(styleSheet)
  styleRef.current = styleSheet
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    if (!ref.current) return
    let disposed = false

    import('cytoscape')
      .then(async ({ default: cytoscape }) => {
        if (disposed || !ref.current) return
        const fcose = (await import('cytoscape-fcose')).default
        cytoscape.use(fcose)
        const cy = cytoscape({
          container: ref.current,
          elements: elementsRef.current,
          style: styleRef.current as cytoscape.StylesheetCSS[],
          layout: {
            name: 'fcose',
            animate: false,
            randomize: false,
            fit: true,
            padding: 40,
            nodeRepulsion: 4000,
            idealEdgeLength: 90,
            nodeDimensionsIncludeLabels: true,
          } as never,
          wheelSensitivity: 0.25,
        })
        cyRef.current = cy
        cy.on('tap', 'node', event => onSelectRef.current?.(event.target.data()))
        cy.on('tap', 'edge', event => onSelectRef.current?.(event.target.data()))
      })
      .catch(() => {
        /* graph library failed to load */
      })

    return () => {
      disposed = true
      cyRef.current?.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update elements when the data changes (no-op until cytoscape is loaded;
  // the mount effect then reads elementsRef.current so nothing is lost).
  const elementsKey = JSON.stringify(elements)
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.json({ elements: elementsRef.current } as never)
    cy.layout({ name: 'fcose', animate: false, fit: true, padding: 40 } as never)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementsKey])

  return <div ref={ref} className={heightClass} />
}

export function ErrorBanner({ error }: { error?: string }) {
  if (!error) return null
  return <div className="badge failed">加载失败: {error}</div>
}
