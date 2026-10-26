// Métricas de avance de las tres fuentes incluidas, para repartir renglones de notas y etiquetas. Mide cada carácter a 1000 px en Chromium sin ventana y escribe src/renderer/src/lienzo/metricas.json.
// Se vuelve a correr solo si cambian las fuentes.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { FUENTES, huellaFuentes, RAIZ } from './fuentes-comun.mjs'

const require = createRequire(join(RAIZ, 'package.json'))
const SALIDA = join(RAIZ, 'src/renderer/src/lienzo/metricas.json')

const ESTILOS = { normal: ['normal', 400], negrita: ['normal', 700], cursiva: ['italic', 400], negritaCursiva: ['italic', 700] }

/** Latín básico, Latín-1, Latín extendido A, griego y los signos que se usan en notas técnicas. */
function caracteres() {
  const cp = []
  const rango = (a, b) => {
    for (let c = a; c <= b; c++) cp.push(c)
  }
  rango(0x20, 0x7e)
  rango(0xa0, 0xff)
  rango(0x100, 0x17f)
  rango(0x391, 0x3a9)
  rango(0x3b1, 0x3c9)
  cp.push(0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x2032, 0x2033, 0x20ac, 0x2126, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x221a, 0x221e, 0x2248, 0x2260, 0x2264, 0x2265)
  return [...new Set(cp)].filter((c) => c !== 0x3a2).map((c) => String.fromCodePoint(c))
}

/** Cada @font-face de una hoja de fontsource, con su archivo en base64. */
function caras(hoja) {
  const ruta = require.resolve(hoja)
  const css = readFileSync(ruta, 'utf8')
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, cuerpo]) => {
    const campo = (n) => new RegExp(`${n}:\\s*([^;]+);`).exec(cuerpo)?.[1].trim()
    const url = /url\(\.\/([^)]+)\)/.exec(campo('src'))[1]
    return {
      estilo: campo('font-style'),
      peso: campo('font-weight'),
      ancho: campo('font-stretch'),
      rango: campo('unicode-range'),
      datos: readFileSync(join(dirname(ruta), url)).toString('base64')
    }
  })
}

function chromeSinVentana() {
  const raiz = join(process.env.LOCALAPPDATA ?? '', 'ms-playwright')
  if (!existsSync(raiz)) return undefined
  const dirs = readdirSync(raiz).filter((d) => d.startsWith('chromium_headless_shell-')).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  for (const d of dirs) {
    const exe = join(raiz, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')
    if (existsSync(exe)) return exe
  }
  return undefined
}

const { chromium } = require('@playwright/test')
const exe = process.env.CHROME_SHELL ?? chromeSinVentana()
const navegador = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}) })
const page = await navegador.newPage()
await page.setContent('<!doctype html><meta charset="utf-8"><canvas></canvas>')
const lista = caracteres()
const salida = { nota: 'Generado por scripts/metricas-fuentes.mjs; no se edita a mano.', huella: huellaFuentes(), caracteres: lista.join(''), fuentes: {} }
// Las tres familias se cargan antes de medir: la pila del lienzo es «fuente, Source Serif», así que lo que
// Mona Sans o Geist Mono no traen (µ, Ω) se mide con el griego y el latín de Source Serif, como se dibuja.
const carasDe = Object.fromEntries(Object.entries(FUENTES).map(([id, { hojas }]) => [id, hojas.flatMap(caras)]))
await page.evaluate(async (carasDe) => {
  for (const [id, todas] of Object.entries(carasDe))
    for (const c of todas) {
      const f = new FontFace(`medir-${id}`, `url(data:font/woff2;base64,${c.datos})`, { style: c.estilo, weight: c.peso, ...(c.ancho ? { stretch: c.ancho } : {}), unicodeRange: c.rango })
      document.fonts.add(f)
      await f.load()
    }
}, carasDe)
for (const [id, { familia }] of Object.entries(FUENTES)) {
  const medidas = await page.evaluate(
    async ({ id, lista, estilos }) => {
      const nombre = `medir-${id}`
      const pila = id === 'serif' ? `"${nombre}"` : `"${nombre}", "medir-serif"`
      const ctx = document.querySelector('canvas').getContext('2d')
      ctx.fontKerning = 'none'
      const out = {}
      for (const [clave, [estilo, peso]] of Object.entries(estilos)) {
        out[clave] = lista.map((ch) => {
          // Si la fuente no tiene el carácter, el navegador usa la de respaldo: con dos respaldos distintos el ancho cambia.
          ctx.font = `${estilo} ${peso} 1000px ${pila}, monospace`
          const a = ctx.measureText(ch).width
          ctx.font = `${estilo} ${peso} 1000px ${pila}, serif`
          const b = ctx.measureText(ch).width
          return Math.abs(a - b) < 0.01 ? Math.round(a) : null
        })
      }
      return out
    },
    { id, lista, estilos: ESTILOS }
  )
  salida.fuentes[id] = medidas
  const faltan = medidas.normal.filter((v) => v === null).length
  console.log(`${familia}: ${lista.length - faltan} caracteres medidos, ${faltan} sin glifo (usan el respaldo)`)
}
await navegador.close()
writeFileSync(SALIDA, JSON.stringify(salida) + '\n')
console.log(`escrito ${SALIDA}`)
