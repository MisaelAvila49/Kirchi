import { randomUUID } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, session } from 'electron'
import { conLimite, peticionPdfPermitida, svgValido } from '../pdf'
import { LADO_MAXIMO_IMAGEN, svgParaPantalla, type ImagenSvg } from './imagen'

const PARTICION = 'kirchi-asistente-imagen'
const LIMITE_MS = 20_000
const LIMITE_SVG = 32 * 2 ** 20
const POLITICA = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:"

const temporales = new Set<string>()
let sesion: Electron.Session | null = null

/** Partición en memoria que solo carga el temporal de la imagen y lo incrustado: ni red ni otros archivos del disco. */
function sesionDeImagen(): Electron.Session {
  if (sesion) return sesion
  const s = session.fromPartition(PARTICION)
  s.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !(peticionPdfPermitida(d.url, null) || [...temporales].some((t) => peticionPdfPermitida(d.url, t))) }))
  s.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  return (sesion = s)
}

/** Pinta el SVG en una ventana oculta y devuelve el PNG de lo que se ve. */
export async function rasterizarPng(imagen: ImagenSvg): Promise<Uint8Array> {
  if (imagen.ancho > LADO_MAXIMO_IMAGEN || imagen.alto > LADO_MAXIMO_IMAGEN) throw new Error('La imagen pasa del tamaño máximo.')
  if (!svgValido(imagen.svg, LIMITE_SVG)) throw new Error('El esquema no se pudo preparar como imagen.')
  const cuerpo = svgParaPantalla(imagen).replace(/^\s*<\?xml[^>]*\?>\s*/, '')
  const html = [
    '<!doctype html>',
    `<html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${POLITICA}">`,
    `<style>html,body{margin:0;padding:0;background:#fff;overflow:hidden}svg{display:block}</style></head><body>${cuerpo}</body></html>`
  ].join('\n')
  const tmp = join(app.getPath('temp'), `kirchi-imagen-${randomUUID()}.html`)
  writeFileSync(tmp, html, { encoding: 'utf8', flag: 'wx' })
  temporales.add(tmp)
  const win = new BrowserWindow({
    show: false,
    useContentSize: true,
    width: imagen.ancho,
    height: imagen.alto,
    frame: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: sesionDeImagen(), spellcheck: false, webgl: false, backgroundThrottling: false }
  })
  const destruir = () => {
    if (!win.isDestroyed()) win.destroy()
  }
  try {
    return await conLimite(
      (async () => {
        await win.loadFile(tmp)
        const foto = await win.webContents.capturePage({ x: 0, y: 0, width: imagen.ancho, height: imagen.alto })
        return new Uint8Array(foto.toPNG())
      })(),
      LIMITE_MS,
      destruir
    )
  } finally {
    destruir()
    temporales.delete(tmp)
    try {
      rmSync(tmp, { force: true, maxRetries: 3 })
    } catch {
      /* un temporal retenido queda en la carpeta temporal del sistema */
    }
  }
}
