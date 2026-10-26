import { isAbsolute, join, normalize, relative } from 'node:path'

export type Resolved = { file: string } | { status: 400 | 403 | 404 }

/** Traduce una URL app://kirchi/... a un archivo dentro de `root`, o a un estado de error. */
export function resolveAppPath(root: string, requestUrl: string): Resolved {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return { status: 400 }
  }
  if (url.hostname !== 'kirchi') return { status: 404 }
  let pathname: string
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    return { status: 400 }
  }
  if (pathname === '/' || pathname === '') pathname = '/index.html'
  const file = normalize(join(root, pathname))
  const rel = relative(root, file)
  if (rel.startsWith('..') || isAbsolute(rel)) return { status: 403 }
  return { file }
}
