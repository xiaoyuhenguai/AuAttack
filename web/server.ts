#!/usr/bin/env bun
/**
 * AuAttack Web 控制台 —— 只读监控后端
 *
 * Bun.serve 单进程提供:
 *   - /api 路径  workspace 状态 REST 端点(见 server/api.ts)
 *   - 静态文件   生产模式服务 web/dist(React/Vite 构建产物)+ SPA fallback
 *
 * 用法:
 *   bun run web/server.ts                    # 生产:API + 静态
 *   bun run web/server.ts --dev              # 开发:仅 API(Vite 代理 /api)
 *   bun run web/server.ts --port 8787 --workspace-root ../workspace
 */
import { existsSync, statSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'
import { handleApiRequest } from './server/api.ts'

function parseArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

const workspaceRoot = resolve(parseArg('--workspace-root', resolve(import.meta.dir, '..', 'workspace')))
const port = Number(parseArg('--port', '8787'))
const hostname = parseArg('--host', '127.0.0.1')
const dev = process.argv.includes('--dev')
const distDir = resolve(import.meta.dir, 'dist')

function isSafeStatic(abs: string): boolean {
  const rel = relative(distDir, abs)
  return !rel.startsWith('..') && !rel.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)
}

const server = Bun.serve({
  port,
  hostname,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api')) {
      return handleApiRequest({
        workspaceRoot,
        pathname: url.pathname,
        searchParams: url.searchParams,
        method: request.method,
      })
    }

    if (dev) {
      return new Response('dev mode: serve API only (run `bun run web:dev` for the Vite dev server)', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }

    // Static assets from web/dist with traversal guard.
    const clean = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const abs = resolve(distDir, clean)
    if (isSafeStatic(abs) && existsSync(abs) && statSync(abs).isFile()) {
      const ext = extname(abs)
      const contentType =
        ext === '.html' ? 'text/html; charset=utf-8'
        : ext === '.js' ? 'text/javascript; charset=utf-8'
        : ext === '.css' ? 'text/css; charset=utf-8'
        : ext === '.svg' ? 'image/svg+xml'
        : ext === '.png' ? 'image/png'
        : ext === '.json' ? 'application/json'
        : 'application/octet-stream'
      return new Response(Bun.file(abs), { headers: { 'content-type': contentType } })
    }

    // SPA fallback for client-side routes.
    const indexHtml = resolve(distDir, 'index.html')
    if (!dev && existsSync(indexHtml)) {
      return new Response(Bun.file(indexHtml), { headers: { 'content-type': 'text/html; charset=utf-8' } })
    }
    return new Response('not found', { status: 404 })
  },
})

console.log(
  JSON.stringify({
    ok: true,
    mode: dev ? 'dev (API only)' : 'prod (API + static)',
    workspaceRoot,
    url: `http://${hostname}:${server.port}`,
  }, null, 2),
)
