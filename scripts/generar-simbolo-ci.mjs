// Dibuja el símbolo rectangular de IEEE 91 de un circuito integrado desde la clave «caja» de su pieza.json.
// Uso: node scripts/generar-simbolo-ci.mjs <carpeta>... | --todas [--raiz <carpeta de componentes>] [--comprobar]
// Escribe en la misma pieza las x e y de los pines, «rotulos», «etiquetas» y simbolo.svg. Se corre una vez por pieza y
// la salida se versiona: la aplicación nunca regenera, así que mejorar el generador no mueve pines ya guardados.
// Con --comprobar solo informa: sale 1 si algún archivo cambiaría, 2 si hay errores.
//
// caja = { titulo, forma: "funcional" | "dip", izquierda, derecha, arriba, abajo, ancho, marcas }
//   Las listas llevan ids de pin; null deja un hueco. Un id con «!» delante es activo en bajo.
//   marcas = { "<id>": ["bajo", "dinamico", "z", "oc"] }: círculo de negación, indicador dinámico, triángulo de tres
//   estados y rombo de colector abierto. Un valor del modelo escrito «!ID» también marca ese pin como activo en bajo.
//   "dip" ignora las listas y ordena las patillas como la primera presentación de «datos»: 1 a N/2 bajando por la
//   izquierda, el resto subiendo por la derecha.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { propiedadesRaiz } from './formatoDatos.mjs'

const RAIZ_REPO = join(import.meta.dirname, '..')
const CLAVES_CAJA = new Set(['titulo', 'forma', 'izquierda', 'derecha', 'arriba', 'abajo', 'ancho', 'marcas'])
const MARCAS = new Set(['bajo', 'dinamico', 'z', 'oc'])
/** Ancho de un carácter de rótulo (tam 1 mm = 0.8 unidades) con margen. */
const ANCHO_LETRA = 0.55

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const num = (n) => String(Math.round(n * 100) / 100)
const par = (n) => 2 * Math.ceil(n / 2)
const multiplo4 = (n) => 4 * Math.ceil(n / 4)

/** Valores del modelo escritos «!ID»: pines activos en bajo según el motor. */
function bajosDelModelo(modelo, ids) {
  const salida = new Set()
  const ver = (v) => {
    if (typeof v === 'string') {
      if (v.startsWith('!') && ids.has(v.slice(1))) salida.add(v.slice(1))
    } else if (Array.isArray(v)) v.forEach(ver)
    else if (esObjeto(v)) Object.values(v).forEach(ver)
  }
  ver(modelo)
  return salida
}

/** Patilla física de cada pin en la primera presentación de «datos», y el número de patillas del encapsulado. */
function patillasFisicas(pieza, errores) {
  for (const fila of Object.values(pieza.datos?.valores ?? {})) {
    const pres = fila?.presentaciones?.[0]
    if (!pres) continue
    const n = /^DIP-(\d+)$/.exec(pres.encapsulado ?? '')
    if (!n || Number(n[1]) % 2) {
      errores.push(`caja: la forma «dip» pide una presentación DIP-N con N par (hay «${pres.encapsulado}»)`)
      return null
    }
    const mapa = new Map()
    for (const [pin, p] of Object.entries(pres.patillas ?? {})) mapa.set(String(Array.isArray(p) ? p[0] : p), pin)
    return { n: Number(n[1]), mapa }
  }
  errores.push('caja: la forma «dip» pide una presentación en «datos»')
  return null
}

/** Listas por lado ya normalizadas: [{ id, bajo, dinamico, z, oc } | null]. */
function lados(pieza, errores) {
  const caja = pieza.caja
  const ids = new Set(pieza.pines.map((p) => p.id))
  for (const k of Object.keys(caja)) if (!CLAVES_CAJA.has(k)) errores.push(`caja.${k}: clave desconocida`)
  if (caja.forma !== 'funcional' && caja.forma !== 'dip') errores.push('caja.forma debe ser «funcional» o «dip»')
  const marcas = {}
  for (const [id, lista] of Object.entries(caja.marcas ?? {})) {
    if (!ids.has(id)) errores.push(`caja.marcas.${id}: no es un pin de la pieza`)
    for (const m of lista) if (!MARCAS.has(m)) errores.push(`caja.marcas.${id}: «${m}» no es una marca (${[...MARCAS].join(', ')})`)
    marcas[id] = new Set(lista)
  }
  const bajos = bajosDelModelo(pieza.modelo, ids)
  const entrada = (e) => {
    if (e === null) return null
    const bajoPrefijo = typeof e === 'string' && e.startsWith('!')
    const id = bajoPrefijo ? e.slice(1) : e
    if (typeof id !== 'string' || !ids.has(id)) {
      errores.push(`caja: «${e}» no es un pin de la pieza`)
      return null
    }
    const m = marcas[id] ?? new Set()
    return { id, bajo: bajoPrefijo || bajos.has(id) || m.has('bajo'), dinamico: m.has('dinamico'), z: m.has('z'), oc: m.has('oc') }
  }
  let res
  if (caja.forma === 'dip') {
    const f = patillasFisicas(pieza, errores)
    res = { izquierda: [], derecha: [], arriba: [], abajo: [] }
    if (f) {
      const medio = f.n / 2
      for (let i = 0; i < medio; i++) {
        res.izquierda.push(entrada(f.mapa.get(String(i + 1)) ?? null))
        res.derecha.push(entrada(f.mapa.get(String(f.n - i)) ?? null))
      }
    }
  } else {
    res = {}
    for (const lado of ['izquierda', 'derecha', 'arriba', 'abajo']) {
      if (caja[lado] !== undefined && !Array.isArray(caja[lado])) errores.push(`caja.${lado} debe ser una lista`)
      res[lado] = (Array.isArray(caja[lado]) ? caja[lado] : []).map(entrada)
    }
  }
  const usados = new Map()
  for (const [lado, lista] of Object.entries(res)) {
    for (const e of lista) if (e) usados.set(e.id, [...(usados.get(e.id) ?? []), lado])
  }
  for (const [id, l] of usados) if (l.length > 1) errores.push(`caja: el pin ${id} aparece ${l.length} veces`)
  // En «dip» un pin sin patilla (CO del contador de hoy) queda fuera; en «funcional» todos deben tener lugar.
  if (caja.forma === 'funcional') for (const id of ids) if (!usados.has(id)) errores.push(`caja: el pin ${id} no está en ningún lado`)
  return res
}

/** Geometría y textos de la caja: pines con su posición, trazos y rótulos. */
export function disenar(pieza) {
  const errores = []
  if (!esObjeto(pieza.caja)) return { errores: ['la pieza no tiene «caja»'] }
  if (!Array.isArray(pieza.pines)) return { errores: ['la pieza no tiene «pines»'] }
  const { izquierda, derecha, arriba, abajo } = lados(pieza, errores)
  if (errores.length) return { errores }
  const n = Math.max(izquierda.length, derecha.length, 1)
  const hayA = arriba.length > 0
  const hayB = abajo.length > 0
  const alto0 = (hayA ? 6 : 4) + 2 * (n - 1) + (hayB ? 6 : 2)
  const alto = multiplo4(alto0)
  const sup = -alto / 2
  const inf = alto / 2
  const y0 = sup + (hayA ? 6 : 4)

  const holgura = (m) => (m.dinamico ? 0.9 : 0) + (m.z || m.oc ? 2 : 0)
  const anchoLado = (lista) => Math.max(0, ...lista.filter(Boolean).map((e) => e.id.length * ANCHO_LETRA + 0.8 + holgura(e)))
  const xsVert = (lista) => lista.map((e, i) => (e ? 2 * (i - Math.floor((lista.length - 1) / 2)) : null))
  const xa = xsVert(arriba)
  const xb = xsVert(abajo)
  const reachV = Math.max(0, ...[...xa, ...xb].filter((x) => x !== null).map(Math.abs)) + 2
  const necesario = multiplo4(Math.max(8, anchoLado(izquierda) + anchoLado(derecha) + 2, 2 * reachV, hayA || hayB ? 2 * (Math.max(arriba.length, abajo.length) + 1) : 0))
  let ancho = necesario
  if (pieza.caja.ancho !== undefined) {
    if (!Number.isInteger(pieza.caja.ancho) || pieza.caja.ancho % 4 || pieza.caja.ancho < necesario) {
      return { errores: [`caja.ancho debe ser múltiplo de 4 y de al menos ${necesario}`] }
    }
    ancho = pieza.caja.ancho
  }
  const izq = -ancho / 2
  const der = ancho / 2

  const pos = new Map()
  const rotulos = []
  const dib = []
  const circulos = []
  const rotulo = (texto, x, y, alinear) => rotulos.push({ texto, x, y, tam: 1, alinear })

  /** Dibuja un pin: `e` = punto del borde, `n` = hacia dentro del cuerpo, `t` = tangente. */
  const pin = (m, ex, ey, nx, ny, tx, ty, alinear) => {
    pos.set(m.id, [ex - 2 * nx, ey - 2 * ny])
    const corte = m.bajo ? 1 : 0
    dib.push(`M${num(ex - 2 * nx)} ${num(ey - 2 * ny)} L${num(ex - corte * nx)} ${num(ey - corte * ny)}`)
    if (m.bajo) circulos.push(`<circle cx="${num(ex - 0.5 * nx)}" cy="${num(ey - 0.5 * ny)}" r="0.5"/>`)
    if (m.dinamico) dib.push(`M${num(ex - tx)} ${num(ey - ty)} L${num(ex + nx)} ${num(ey + ny)} L${num(ex + tx)} ${num(ey + ty)}`)
    let fondo = 0.8 + (m.dinamico ? 0.9 : 0)
    if (m.z) {
      const cx = ex + 1.4 * nx
      const cy = ey + 1.4 * ny
      dib.push(`M${num(cx - 0.6)} ${num(cy - 0.5)} L${num(cx + 0.6)} ${num(cy - 0.5)} L${num(cx)} ${num(cy + 0.6)} Z`)
      fondo += 2
    } else if (m.oc) {
      const cx = ex + 1.5 * nx
      const cy = ey + 1.5 * ny
      dib.push(`M${num(cx - 0.6)} ${num(cy)} L${num(cx)} ${num(cy - 0.6)} L${num(cx + 0.6)} ${num(cy)} L${num(cx)} ${num(cy + 0.6)} Z`)
      dib.push(`M${num(cx - 0.7)} ${num(cy + 0.9)} H${num(cx + 0.7)}`)
      fondo += 2
    }
    rotulo(m.id, ex + fondo * nx, ey + fondo * ny, alinear)
  }
  izquierda.forEach((m, i) => m && pin(m, izq, y0 + 2 * i, 1, 0, 0, 1, 'izq'))
  derecha.forEach((m, i) => m && pin(m, der, y0 + 2 * i, -1, 0, 0, 1, 'der'))
  arriba.forEach((m, i) => m && pin(m, xa[i], sup, 0, 1, 1, 0, 'abajo'))
  abajo.forEach((m, i) => m && pin(m, xb[i], inf, 0, -1, 1, 0, 'arriba'))

  if (pieza.caja.titulo) rotulo(pieza.caja.titulo, 0, hayA ? sup + 3.6 : sup + 1, 'centro')

  const rect = `<rect x="${num(izq)}" y="${num(sup)}" width="${num(ancho)}" height="${num(alto)}"/>`
  const xs = [izq, der, ...[...pos.values()].map((p) => p[0])]
  const ys = [sup, inf, ...[...pos.values()].map((p) => p[1])]
  const minX = Math.floor(Math.min(...xs)) - 1
  const minY = Math.floor(Math.min(...ys)) - 1
  const anchoV = Math.ceil(Math.max(...xs)) + 1 - minX
  const altoV = Math.ceil(Math.max(...ys)) + 1 - minY
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${anchoV} ${altoV}" fill="none" stroke="currentColor">`,
    `  ${rect}<path d="${dib.join(' ')}"/>${circulos.join('')}`,
    '</svg>',
    ''
  ].join('\n')
  return {
    errores,
    pos,
    svg,
    rotulos,
    etiquetas: { ref: { x: 0, y: sup - (hayA ? 4 : 2) }, valor: { x: 0, y: inf + (hayB ? 4 : 2) } }
  }
}

const enLinea = (v) => {
  if (Array.isArray(v)) return `[${v.map(enLinea).join(', ')}]`
  if (esObjeto(v)) return `{ ${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${enLinea(x)}`).join(', ')} }`
  return JSON.stringify(v)
}

/** Reemplaza el valor de una clave de la raíz, o la inserta tras la primera ancla que exista. */
function ponerClave(texto, clave, valor, anclas, eol) {
  const props = propiedadesRaiz(texto)
  const actual = props.find((p) => p.clave === clave)
  const bloque = `"${clave}": ${valor}`
  if (actual) return texto.slice(0, actual.inicio) + bloque + texto.slice(actual.fin)
  const ancla = anclas.map((a) => props.find((p) => p.clave === a)).find(Boolean) ?? props[props.length - 1]
  return `${texto.slice(0, ancla.fin)},${eol}  ${bloque}${texto.slice(ancla.fin)}`
}

/** Texto nuevo de pieza.json y simbolo.svg; null en `pieza` si no hay caja. */
export function generar(textoPieza) {
  const crlf = textoPieza.includes('\r\n')
  const eol = crlf ? '\r\n' : '\n'
  const pieza = JSON.parse(textoPieza.replace(/^﻿/, ''))
  const d = disenar(pieza)
  if (d.errores.length) return { errores: d.errores }
  const pinesTxt =
    '[' +
    eol +
    pieza.pines
      .map((p) => {
        const xy = d.pos.get(p.id)
        const { id, nombre, x, y, ...resto } = p
        void x
        void y
        return `    ${enLinea({ id, ...(nombre !== undefined ? { nombre } : {}), x: xy ? xy[0] : p.x, y: xy ? xy[1] : p.y, ...resto })}`
      })
      .join(',' + eol) +
    eol +
    '  ]'
  const rotTxt = '[' + eol + d.rotulos.map((r) => `    ${enLinea(r)}`).join(',' + eol) + eol + '  ]'
  let t = textoPieza
  t = ponerClave(t, 'pines', pinesTxt, [], eol)
  t = ponerClave(t, 'etiquetas', enLinea(d.etiquetas), ['modelo', 'pines'], eol)
  t = ponerClave(t, 'rotulos', rotTxt, ['etiquetas'], eol)
  return { errores: [], pieza: t, svg: d.svg }
}

/** Genera una carpeta; con `comprobar` no escribe. Devuelve { cambia, errores }. */
export function generarCarpeta(carpeta, comprobar) {
  const ruta = join(carpeta, 'pieza.json')
  const actual = readFileSync(ruta, 'utf8')
  const r = generar(actual)
  if (r.errores.length) return { cambia: false, errores: r.errores.map((e) => `${ruta}: ${e}`) }
  const rutaSvg = join(carpeta, 'simbolo.svg')
  const svgActual = existsSync(rutaSvg) ? readFileSync(rutaSvg, 'utf8').replace(/\r\n/g, '\n') : null
  const cambia = r.pieza !== actual || r.svg !== svgActual
  if (cambia && !comprobar) {
    writeFileSync(ruta, r.pieza)
    writeFileSync(rutaSvg, r.svg)
  }
  return { cambia, errores: [] }
}

/** Carpetas con una pieza que trae «caja». */
export function carpetasConCaja(raiz) {
  const salida = []
  const recorrer = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, e.name)
      if (e.isDirectory()) recorrer(ruta)
      else if (e.name === 'pieza.json' && /"caja"\s*:\s*\{/.test(readFileSync(ruta, 'utf8'))) salida.push(dir)
    }
  }
  recorrer(raiz)
  return salida
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2)
  const comprobar = args.includes('--comprobar')
  const i = args.indexOf('--raiz')
  const raiz = i >= 0 ? args[i + 1] : join(RAIZ_REPO, 'componentes')
  const carpetas = args.includes('--todas') ? carpetasConCaja(raiz) : args.filter((a, k) => !a.startsWith('--') && (i < 0 || k !== i + 1))
  if (!carpetas.length) {
    console.error('Uso: node scripts/generar-simbolo-ci.mjs <carpeta>... | --todas [--raiz <carpeta>] [--comprobar]')
    process.exit(args.includes('--todas') ? 0 : 2)
  }
  let cambian = 0
  let fallos = 0
  for (const c of carpetas) {
    const { cambia, errores } = generarCarpeta(c, comprobar)
    for (const e of errores) console.error(e)
    fallos += errores.length
    if (cambia) {
      cambian++
      console.log(`${comprobar ? 'cambiaría' : 'escrito'}: ${relative(process.cwd(), c)}`)
    }
  }
  if (fallos) process.exit(2)
  if (comprobar && cambian) process.exit(1)
}
