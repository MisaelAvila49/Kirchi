// Genera los iconos de la aplicación y del .kir desde build/*.svg (node scripts/generar-iconos.mjs) y los logos de la Tienda en build/appx/, con el Chromium sin ventana de Playwright.
// Hasta 32 px se usa la variante «chico» de cada SVG (trazo más grueso, menos dientes).
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { construirIcns, construirIco } from './formatos-icono.mjs'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUILD = join(RAIZ, 'build')
const LADOS_ICO = [16, 24, 32, 48, 64, 128, 256]
const LADOS_PNG = [16, 24, 32, 48, 64, 128, 256, 512, 1024]
const LIMITE_CHICO = 32
// Logos del paquete MSIX: [nombre, ancho base, alto base, lado del icono dentro de la caja en proporción de la altura]. Escalas de la Tienda.
const ESCALAS_APPX = [100, 125, 150, 200, 400]
const LOGOS_APPX = [
  ['StoreLogo', 50, 50, 1],
  ['Square44x44Logo', 44, 44, 1],
  ['Square150x150Logo', 150, 150, 0.82],
  ['Wide310x150Logo', 310, 150, 0.8]
]
// Square44x44Logo.targetsize-N (y la versión sin placa para la barra de tareas): los que pide el kit de certificación.
const LADOS_TARGET_APPX = [16, 24, 32, 48, 256]

const leer = (n) => readFileSync(join(BUILD, n), 'utf8')
const juegos = {
  app: { grande: leer('icono.svg'), chico: leer('icono-chico.svg') },
  kir: { grande: leer('icono-kir.svg'), chico: leer('icono-kir-chico.svg') }
}

/** El Chromium de Playwright; si la revisión esperada no está, cualquiera de las instaladas (solo dibuja SVG). */
function ejecutable() {
  if (process.env.KIRCHI_CHROMIUM) return process.env.KIRCHI_CHROMIUM
  const esperado = chromium.executablePath()
  if (existsSync(esperado)) return esperado
  const base = join(process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), 'AppData', 'Local', 'ms-playwright'))
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => n.startsWith('chromium_headless_shell-')).sort().reverse()) {
      const exe = join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
      if (existsSync(exe)) return exe
    }
  }
  return esperado
}

const navegador = await chromium.launch({ executablePath: ejecutable() })
try {
  const pagina = await navegador.newPage()
  async function png(svg, lado) {
    await pagina.setViewportSize({ width: lado, height: lado })
    await pagina.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`)
    return pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado } })
  }
  mkdirSync(join(BUILD, 'icons'), { recursive: true })
  for (const [nombre, { grande, chico }] of Object.entries(juegos)) {
    const porLado = new Map()
    for (const lado of LADOS_PNG) porLado.set(lado, await png(lado <= LIMITE_CHICO ? chico : grande, lado))
    const prefijo = nombre === 'app' ? 'icon' : 'kir'
    writeFileSync(join(BUILD, `${prefijo}.ico`), construirIco(LADOS_ICO.map((lado) => ({ lado, png: porLado.get(lado) }))))
    writeFileSync(join(BUILD, `${prefijo}.icns`), construirIcns(porLado))
    writeFileSync(join(BUILD, `${prefijo}.png`), porLado.get(1024))
    if (nombre === 'app') for (const lado of [16, 32, 48, 64, 128, 256, 512]) writeFileSync(join(BUILD, 'icons', `${lado}x${lado}.png`), porLado.get(lado))
  }
  // Logos del paquete de la Tienda: icono centrado en una caja transparente (el color de fondo del mosaico lo pone el manifiesto).
  async function logo(ancho, alto, proporcion) {
    const lado = Math.round(alto * proporcion)
    const svg = lado <= LIMITE_CHICO ? juegos.app.chico : juegos.app.grande
    await pagina.setViewportSize({ width: ancho, height: alto })
    await pagina.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}body{width:${ancho}px;height:${alto}px;display:flex;align-items:center;justify-content:center}svg{display:block;width:${lado}px;height:${lado}px}</style>${svg}`)
    return pagina.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: ancho, height: alto } })
  }
  const appx = join(BUILD, 'appx')
  mkdirSync(appx, { recursive: true })
  for (const [nombre, ancho, alto, prop] of LOGOS_APPX) {
    writeFileSync(join(appx, `${nombre}.png`), await logo(ancho, alto, prop))
    for (const e of ESCALAS_APPX) writeFileSync(join(appx, `${nombre}.scale-${e}.png`), await logo(Math.round((ancho * e) / 100), Math.round((alto * e) / 100), prop))
  }
  for (const lado of LADOS_TARGET_APPX) {
    const png = await logo(lado, lado, 1)
    writeFileSync(join(appx, `Square44x44Logo.targetsize-${lado}.png`), png)
    writeFileSync(join(appx, `Square44x44Logo.targetsize-${lado}_altform-unplated.png`), png)
  }
  console.log('Iconos generados en build/ y build/appx/')
} finally {
  await navegador.close()
}
