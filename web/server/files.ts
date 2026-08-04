/**
 * Safe file operations for the console: list a directory and serve a file
 * under a workspace-relative root with a path-traversal guard.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, relative, extname } from 'node:path'

export type FileKind =
  | 'markdown'
  | 'text'
  | 'json'
  | 'html'
  | 'docx'
  | 'pdf'
  | 'png'
  | 'bin'

export interface FileEntry {
  name: string
  size: number
  modifiedAt: string
  kind: FileKind
}

const EXT_KIND: Record<string, FileKind> = {
  '.md': 'markdown',
  '.txt': 'text',
  '.json': 'json',
  '.html': 'html',
  '.htm': 'html',
  '.docx': 'docx',
  '.pdf': 'pdf',
  '.png': 'png',
  '.log': 'text',
  '.raw': 'text',
  '.js': 'text',
}

export function classifyFile(name: string): FileKind {
  return EXT_KIND[extname(name).toLowerCase()] ?? 'bin'
}

export function listFiles(dir: string): FileEntry[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const stat = statSync(resolve(dir, entry.name))
      return {
        name: entry.name,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        kind: classifyFile(entry.name),
      }
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

/**
 * Resolve `...` segments under `root` and reject any escape. Returns the
 * absolute path when safe, undefined on traversal or missing target.
 */
export function safeResolve(root: string, rel: string): string | undefined {
  const abs = resolve(root, rel)
  const relCheck = relative(root, abs)
  if (relCheck.startsWith('..') || relCheck === '..' || relCheck.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return undefined
  }
  return abs
}

export function readFileEntry(root: string, rel: string):
  | { ok: true; body: Uint8Array; contentType: string; name: string }
  | { ok: false; status: number; error: string } {
  const abs = safeResolve(root, rel)
  if (!abs || !existsSync(abs)) return { ok: false, status: 404, error: 'file not found' }
  const stat = statSync(abs)
  if (!stat.isFile()) return { ok: false, status: 404, error: 'not a file' }
  const body = readFileSync(abs)
  return { ok: true, body, contentType: contentTypeFor(abs, body), name: abs.split(/[\\/]/).pop() ?? '' }
}

function contentTypeFor(path: string, body: Uint8Array): string {
  const ext = extname(path).toLowerCase()
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.md' || ext === '.txt' || ext === '.log' || ext === '.js') return 'text/plain; charset=utf-8'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  // Magic-byte sniffing for response-body.bin (may actually be png/text/html/json).
  if (body.length > 3) {
    if (body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e) return 'image/png'
    if (body[0] === 0xff && body[1] === 0xd8) return 'image/jpeg'
    if (body[0] === 0x47 && body[1] === 0x49 && body[2] === 0x46) return 'image/gif'
    if (body[0] === 0x3c) return 'text/html; charset=utf-8' // '<'
  }
  return 'application/octet-stream'
}

/** Redact credential-bearing headers before rendering raw text to a browser. */
export function redactSensitive(raw: string): string {
  return raw.replace(
    /^(Authorization|Proxy-Authorization|Cookie|Set-Cookie|X-Api-Key|Api-Key):.*$/gim,
    '$1: ****（已脱敏）',
  )
}
