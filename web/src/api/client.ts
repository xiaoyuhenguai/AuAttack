import { useEffect, useRef, useState } from 'react'

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    let error = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body?.error) error = body.error
    } catch {
      /* non-json */
    }
    throw new Error(error)
  }
  return response.json() as Promise<T>
}

export async function apiPost<T>(path: string): Promise<T> {
  const response = await fetch(path, { method: 'POST' })
  if (!response.ok) {
    let error = `HTTP ${response.status}`
    try {
      const body = await response.json()
      if (body?.error) error = body.error
    } catch {
      /* ignore */
    }
    throw new Error(error)
  }
  return response.json() as Promise<T>
}

export interface PollingState<T> {
  data: T | undefined
  error: string | undefined
  loading: boolean
  refresh: () => void
}

/** Polls `path` every `intervalMs`; pausable when the tab is hidden. */
export function usePolling<T>(path: string | undefined, intervalMs = 5000): PollingState<T> {
  const [data, setData] = useState<T>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = () => {
    if (!path) return
    apiGet<T>(path)
      .then(value => {
        setData(value)
        setError(undefined)
      })
      .catch(err => setError(String(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setLoading(true)
    refresh()
    if (timer.current) clearInterval(timer.current)
    timer.current = setInterval(() => {
      if (document.hidden) return
      refresh()
    }, intervalMs)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, intervalMs])

  return { data, error, loading, refresh }
}
