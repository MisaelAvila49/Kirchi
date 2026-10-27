// Escribe la clave «datos» de componentes/**/pieza.json desde tablas { "<id de pieza>": <DatosPieza> }.
// Uso: node scripts/aplicar-datos.mjs <tabla.json>... [--comprobar] [--raiz <carpeta de componentes>] [--permitir-ausentes]
// Varias tablas se mezclan por pieza y por fila. Valida antes de escribir y no escribe nada si algo falla.
// Con --comprobar solo informa: sale 1 si algún archivo cambiaría, 2 si hay errores.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { reemplazarDatos } from './formatoDatos.mjs'

const RAIZ_REPO = join(import.meta.dirname, '..')

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Mezcla dos fragmentos de tabla: los objetos se unen clave a clave, lo demás debe coincidir. */
export function mezclar(a, b, ruta, errores) {
  if (esObjeto(a) && esObjeto(b)) {
    const salida = { ...a }
    for (const [k, v] of Object.entries(b)) salida[k] = k in a ? mezclar(a[k], v, `${ruta}.${k}`, errores) : v
    return salida
  }
  if (JSON.stringify(a) !== JSON.stringify(b)) errores.push(`${ruta}: dos tablas dan valores distintos`)
  return a
}

function archivosDePieza(raiz) {
  const piezas = new Map()
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name)
      if (e.isDirectory()) recorrer(ruta)
      else if (e.name === 'pieza.json') {
        const id = JSON.parse(readFileSync(ruta, 'utf8').replace(/^\uFEFF/, '')).id
        piezas.set(id, ruta)
      }
    }
  }
  recorrer(raiz)
  return piezas
}

/** Todos los archivos de las piezas (json y svg) como los espera cargarLibreria: ruta relativa con «/» → contenido. */
function archivosDeLibreria(raiz, reemplazos) {
  const salida = {}
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name)
      if (e.isDirectory()) recorrer(ruta)
      else if (/^(pieza\.json|.*\.svg)$/.test(e.name)) salida[relative(raiz, ruta).split(sep).join('/')] = reemplazos.get(ruta) ?? readFileSync(ruta, 'utf8')
    }
  }
  recorrer(raiz)
  return salida
}

/**
 * `validar(archivos)` devuelve los errores de la librería con los archivos dados. Solo cuentan los que
 * el cambio agrega a los que ya había.
 */
export function aplicarTablas({ tablas, raiz, comprobar = false, validar, permitirAusentes = false }) {
  const errores = []
  const ausentes = []
  let tabla = {}
  tablas.forEach((t, i) => {
    if (!esObjeto(t)) return errores.push(`tabla ${i + 1}: debe ser un objeto { id: datos }`)
    tabla = mezclar(tabla, t, `tabla ${i + 1}`, errores)
  })
  const piezas = archivosDePieza(raiz)
  const reemplazos = new Map()
  const cambios = []
  const resumen = { piezas: 0, filas: 0, presentaciones: 0, pendientes: 0, sinVerificar: 0 }
  for (const [id, datos] of Object.entries(tabla)) {
    const ruta = piezas.get(id)
    if (!ruta) {
      ausentes.push(id)
      if (!permitirAusentes) errores.push(`${id}: no hay pieza con ese id en ${raiz}`)
      continue
    }
    const antes = readFileSync(ruta, 'utf8')
    let despues
    try {
      despues = reemplazarDatos(antes, datos)
    } catch (e) {
      errores.push(`${id}: ${e.message}`)
      continue
    }
    resumen.piezas++
    for (const fila of Object.values(datos.valores ?? {})) {
      resumen.filas++
      resumen.pendientes += Object.keys(fila.pendiente ?? {}).length
      resumen.sinVerificar += (fila.equivalencias?.sinVerificar ?? []).length
      for (const p of fila.presentaciones ?? []) {
        resumen.presentaciones++
        if (p.lcsc?.sinVerificar) resumen.sinVerificar++
      }
    }
    resumen.sinVerificar += (datos.equivalencias?.sinVerificar ?? []).length
    if (despues !== antes) {
      reemplazos.set(ruta, despues)
      cambios.push(relative(raiz, ruta).split(sep).join('/'))
    }
  }
  if (reemplazos.size && validar) {
    const antes = new Map()
    for (const e of validar(archivosDeLibreria(raiz, new Map()))) antes.set(e, (antes.get(e) ?? 0) + 1)
    for (const e of validar(archivosDeLibreria(raiz, reemplazos))) {
      const n = antes.get(e) ?? 0
      if (n > 0) antes.set(e, n - 1)
      else errores.push(e)
    }
  }
  if (errores.length === 0 && !comprobar) for (const [ruta, texto] of reemplazos) writeFileSync(ruta, texto)
  return { errores, ausentes, cambios, resumen }
}

async function cargarValidador() {
  const { createServer } = await import('vite')
  const servidor = await createServer({ root: RAIZ_REPO, configFile: false, appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true } })
  const { cargarLibreria } = await servidor.ssrLoadModule('/src/renderer/src/piezas/libreria.ts')
  return { validar: (archivos) => cargarLibreria(archivos).errores, cerrar: () => servidor.close() }
}

async function main() {
  const args = process.argv.slice(2)
  const bandera = (n) => args.includes(`--${n}`)
  const i = args.indexOf('--raiz')
  const raiz = i >= 0 ? args.splice(i, 2)[1] : join(RAIZ_REPO, 'componentes')
  const rutas = args.filter((a) => !a.startsWith('--'))
  if (rutas.length === 0) {
    console.error('Uso: node scripts/aplicar-datos.mjs <tabla.json>... [--comprobar] [--raiz <carpeta>] [--permitir-ausentes]')
    process.exit(2)
  }
  const tablas = rutas.map((r) => {
    if (!existsSync(r)) throw new Error(`no existe ${r}`)
    return JSON.parse(readFileSync(r, 'utf8').replace(/^\uFEFF/, ''))
  })
  const { validar, cerrar } = await cargarValidador()
  let r
  try {
    r = aplicarTablas({ tablas, raiz, comprobar: bandera('comprobar'), validar, permitirAusentes: bandera('permitir-ausentes') })
  } finally {
    await cerrar()
  }
  const { resumen: s } = r
  for (const e of r.errores) console.error(`error: ${e}`)
  if (r.ausentes.length && bandera('permitir-ausentes')) console.log(`Sin pieza (omitidas): ${r.ausentes.join(', ')}`)
  console.log(`${r.cambios.length} archivo(s) ${bandera('comprobar') ? 'cambiarían' : 'cambiados'}: ${r.cambios.join(', ') || 'ninguno'}`)
  console.log(`Piezas ${s.piezas}, filas ${s.filas}, presentaciones ${s.presentaciones}, pendientes ${s.pendientes}, sin verificar ${s.sinVerificar}`)
  if (r.errores.length) {
    console.error(`${r.errores.length} error(es): no se escribió nada.`)
    process.exit(2)
  }
  if (bandera('comprobar') && r.cambios.length) process.exit(1)
}

if (import.meta.url === `file:///${process.argv[1]?.split(sep).join('/')}` || process.argv[1] === import.meta.filename) await main()
