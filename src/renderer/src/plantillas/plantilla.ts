import { strFromU8, strToU8, zipSync } from 'fflate'
import { descomprimirLimitado } from '../archivo/zipLimitado'
import { escribirKir, FECHA_FIJA, leerKir } from '../archivo/kir'
import { limpiarTexto } from '../doc/limpiar'
import { esDeInstrumento } from '../doc/sondas'
import { documentoVacio, type Documento } from '../doc/tipos'
import { copiar, type Fragmento } from '../editor/portapapeles'
import { todo, type Seleccion } from '../editor/seleccion'
import type { PiezaDef } from '../piezas/tipos'
import { transformar } from '../piezas/transformar'
import { copiarConTextosFijos } from './textosFijos'

/** Plantilla: un `.kir` con dos entradas más en el zip, `plantilla.json` (nombre y descripción) y `vista.svg` (miniatura).
 * El circuito es un fragmento como el del portapapeles (selección con las sondas de sus instrumentos), con origen en (0,
 * 0). Colocarla es pegarla (`Editor.empezarColocarFragmento`). */
export const ENTRADA_META = 'plantilla.json'
export const ENTRADA_VISTA = 'vista.svg'
/** Tope de `plantilla.json`: un archivo ajeno no hace descomprimir más que esto. */
export const LIMITE_META = 64 * 1024
/** Tope de lo que se descomprime de una plantilla (contado en bytes reales, no por la cabecera del zip). */
export const LIMITE_PLANTILLA = 2 * 2 ** 20
export const MAX_DESCRIPCION = 300
export const MAX_NOMBRE_META = 80

export interface MetaPlantilla {
  nombre: string
  descripcion: string
}

/** El fragmento de la selección (igual que copiar); null si no hay nada que guardar. */
export const fragmentoDeSeleccion = (doc: Documento, sel: Seleccion, lib?: Map<string, PiezaDef>): Fragmento | null =>
  // Con la librería, los textos que el reparto automático puso quedan fijos donde se ven.
  lib ? copiarConTextosFijos(doc, sel, lib) : copiar(doc, sel, lib)

/** Todo el documento como fragmento con el origen en la esquina de lo que dibuja. */
export const fragmentoDeDocumento = (doc: Documento, lib?: Map<string, PiezaDef>): Fragmento | null => copiar(doc, todo(doc), lib)

/** Lo que se pega al colocar una plantilla incluida o un circuito de calculadora: sin notas de texto, porque la
 * explicación vive en la descripción o la ficha y una nota estorba al dibujo del usuario. Una plantilla que solo trae
 * notas las conserva. */
export function fragmentoParaColocar(f: Fragmento, propia = false): Fragmento {
  // Una plantilla propia trae las notas guardadas: se colocan con sus posiciones relativas.
  if (propia) return f
  const otras = f.piezas.length + f.cables.length + f.etiquetas.length + f.figuras.length
  return otras > 0 && f.notas.length > 0 ? { ...f, notas: [] } : f
}

/** El documento que se escribe en el `.kir` de la plantilla: el fragmento tal cual, con sus ids. */
export function documentoDeFragmento(f: Fragmento): Documento {
  const d = documentoVacio()
  for (const p of f.piezas) d.piezas[p.id] = p
  for (const c of f.cables) d.cables[c.id] = c
  for (const e of f.etiquetas) d.etiquetas[e.id] = e
  for (const n of f.notas) d.notas[n.id] = n
  if (f.figuras.length > 0) d.figuras = Object.fromEntries(f.figuras.map((x) => [x.id, x]))
  if (f.sondas?.length) d.sondas = Object.fromEntries(f.sondas.map((x) => [x.id, x]))
  return d
}

/** Texto de la ficha: sin caracteres inválidos y dentro de los largos. */
export function metaLimpia(m: Partial<Record<keyof MetaPlantilla, unknown>>): MetaPlantilla {
  const t = (v: unknown, max: number) => (typeof v === 'string' ? [...limpiarTexto(v).trim()].slice(0, max).join('') : '')
  return { nombre: t(m.nombre, MAX_NOMBRE_META), descripcion: t(m.descripcion, MAX_DESCRIPCION) }
}

export function empaquetarPlantilla(f: Fragmento, meta: MetaPlantilla, lib: Map<string, PiezaDef>, version: string): Uint8Array {
  const m = metaLimpia(meta)
  return escribirKir(documentoDeFragmento(f), version, {
    [ENTRADA_META]: strToU8(JSON.stringify(m, null, 2) + '\n'),
    [ENTRADA_VISTA]: strToU8(svgDeVista(vistaDeFragmento(f, lib)))
  })
}

/** Cambia solo la descripción de una plantilla guardada: lee con los topes de `leerPlantilla`, reescribe `plantilla.json`
 * con la limpieza del diálogo de guardar (`metaLimpia`: sin caracteres inválidos, 300 como máximo, vacía permitida) y
 * deja intactos circuito, manifiesto y miniatura. El nombre es el del archivo. */
export function conDescripcion(bytes: Uint8Array, descripcion: string): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const e = descomprimirLimitado(bytes, (n) => (n === ENTRADA_META ? LIMITE_META : LIMITE_PLANTILLA))
  if (!e.ok) return { ok: false, error: e.motivo === 'grande' ? 'La plantilla es demasiado grande para cambiarle la descripción.' : 'La plantilla no se pudo leer.' }
  let crudo: unknown = {}
  try {
    if (e.archivos[ENTRADA_META]) crudo = JSON.parse(strFromU8(e.archivos[ENTRADA_META]))
  } catch {
    // Sin ficha legible: se escribe una nueva solo con la descripción.
  }
  const previa = crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>) : {}
  const m = metaLimpia({ nombre: previa.nombre, descripcion })
  const archivos: Record<string, Uint8Array> = { ...e.archivos, [ENTRADA_META]: strToU8(JSON.stringify(m, null, 2) + '\n') }
  return { ok: true, bytes: zipSync(archivos, { mtime: FECHA_FIJA }) }
}

export type LecturaPlantilla = { ok: true; fragmento: Fragmento; meta: MetaPlantilla; avisos: string[] } | { ok: false; error: string }

/** Lee los bytes de una plantilla con los topes y validaciones de abrir un `.kir` (`leerKir`); la ficha sale de
 * `plantilla.json` si existe y es pequeña (si no, de `nombreDeArchivo`). Una versión más nueva no se coloca. */
export function leerPlantilla(bytes: Uint8Array, nombreDeArchivo: string): LecturaPlantilla {
  const l = leerKir(bytes, LIMITE_PLANTILLA)
  if (!l.ok) return { ok: false, error: l.error }
  if (l.soloLectura) return { ok: false, error: 'La plantilla es de una versión más nueva de Kirchi: no se puede colocar.' }
  const fragmento = fragmentoDeDocumento(l.doc)
  if (!fragmento) return { ok: false, error: 'La plantilla está vacía.' }
  // El archivo ya trae solo las sondas que viajan (las filtró `copiar` al guardar): todas entran, a la misma distancia del origen.
  const sondas = Object.values(l.doc.sondas ?? {}).filter((s) => !esDeInstrumento(s) || Object.hasOwn(l.doc.piezas, s.instrumento))
  if (sondas.length) fragmento.sondas = sondas.map((s) => ({ ...s, x: s.x - fragmento.origen.x, y: s.y - fragmento.origen.y }))
  else delete fragmento.sondas
  let crudo: unknown = {}
  try {
    const e = descomprimirLimitado(bytes, (n) => (n === ENTRADA_META ? LIMITE_META : null))
    if (e.ok && e.archivos[ENTRADA_META]) crudo = JSON.parse(strFromU8(e.archivos[ENTRADA_META]))
  } catch {
    // Sin ficha legible: se usa el nombre del archivo.
  }
  const m = metaLimpia(crudo && typeof crudo === 'object' ? (crudo as Record<string, unknown>) : {})
  return { ok: true, fragmento, meta: { nombre: m.nombre || nombreDeArchivo, descripcion: m.descripcion }, avisos: l.avisos }
}

// ---- Miniatura ----

export interface VistaPlantilla {
  viewBox: string
  ancho: number
  alto: number
  /** Polilíneas del dibujo de las piezas y de los cables, en puntos «x,y x,y». */
  lineas: { puntos: string; cable: boolean }[]
  triangulos: string[]
}

const MARGEN_VISTA = 2
const n = (v: number) => String(Math.round(v * 100) / 100)

/** La miniatura de un fragmento con la geometría real de sus símbolos (piezas sin definición no se dibujan). */
export function vistaDeFragmento(f: Fragmento, lib: Map<string, PiezaDef>): VistaPlantilla {
  const lineas: VistaPlantilla['lineas'] = []
  const triangulos: string[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const ver = (x: number, y: number) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const unir = (pts: number[], cable: boolean, p?: { x: number; y: number; rot: 0 | 90 | 180 | 270; espejo: boolean }) => {
    const out: string[] = []
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const [x, y] = p ? transformar(pts[i], pts[i + 1], p.rot, p.espejo) : [pts[i], pts[i + 1]]
      const X = x + (p?.x ?? 0), Y = y + (p?.y ?? 0)
      ver(X, Y)
      out.push(`${n(X)},${n(Y)}`)
    }
    if (out.length >= 2) lineas.push({ puntos: out.join(' '), cable })
  }
  for (const c of f.cables) unir(c.puntos.flatMap((q) => [q.x, q.y]), true)
  for (const p of f.piezas) {
    const def = lib.get(p.tipo)
    if (!def) continue
    for (const t of def.geometria.trazos) unir(t, false, p)
    const r = def.geometria.rellenos
    for (let i = 0; i + 5 < r.length; i += 6) {
      const pts: string[] = []
      for (let k = 0; k < 6; k += 2) {
        const [x, y] = transformar(r[i + k], r[i + k + 1], p.rot, p.espejo)
        ver(x + p.x, y + p.y)
        pts.push(`${n(x + p.x)},${n(y + p.y)}`)
      }
      triangulos.push(pts.join(' '))
    }
  }
  if (minX > maxX) return { viewBox: '0 0 10 10', ancho: 10, alto: 10, lineas, triangulos }
  const ancho = maxX - minX + 2 * MARGEN_VISTA, alto = maxY - minY + 2 * MARGEN_VISTA
  return { viewBox: `${n(minX - MARGEN_VISTA)} ${n(minY - MARGEN_VISTA)} ${n(ancho)} ${n(alto)}`, ancho, alto, lineas, triangulos }
}

/** La miniatura como archivo SVG suelto (para el explorador o para otro programa): colores fijos, sin texto ni scripts. */
export function svgDeVista(v: VistaPlantilla): string {
  const cuerpo = [
    ...v.triangulos.map((t) => `<polygon points="${t}" fill="#3d4650"/>`),
    ...v.lineas.map((l) => `<polyline points="${l.puntos}" fill="none" stroke="${l.cable ? '#1f7a7a' : '#3d4650'}" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round"/>`)
  ].join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${v.viewBox}" width="${n(v.ancho * 2)}" height="${n(v.alto * 2)}">${cuerpo}</svg>\n`
}

