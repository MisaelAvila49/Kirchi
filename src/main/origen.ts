/** Página propia de Kirchi: `app://kirchi/…` o el origen exacto del servidor de desarrollo. Se compara el origen analizado, no el prefijo del texto. */
export function esPropia(url: string | undefined, dev?: string): boolean {
  if (!url) return false
  try {
    const u = new URL(url)
    if (u.protocol === 'app:' && u.host === 'kirchi') return true
    return !!dev && u.origin !== 'null' && u.origin === new URL(dev).origin
  } catch {
    return false
  }
}
