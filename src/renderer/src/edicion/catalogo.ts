import { patillasDeUnidad, unidadesDe } from '../doc/paquetes'
import { ENCAPSULADOS } from '../piezas/encapsulados'
import type { Equivalencias, PiezaDef, PropDef } from '../piezas/tipos'
import { filaDe } from '../piezas/validarDatos'

export interface EntradaDeCatalogo {
  id: string
  nombre: string
  categoria: string
  prefijo: string
  patillas: { id: string; nombre: string }[]
  propiedades: { id: string; nombre: string; unidad?: string; defecto: string; opciones?: string[]; perilla?: { min: number; max: number; unidad: string; escala: 'lineal' | 'log' } }[]
  /** Compuertas: de cuántas entradas puede ser (la propiedad «entradas» de `colocar`). */
  entradas?: { min: number; max: number }
  /** Chips con varias unidades en un encapsulado (compuertas, amplificadores): cuántas, y el número de patilla de cada pin por unidad,
   * con los pines compartidos (V+, V-) en cada una. `colocar` acepta `paquete` y `unidad`. */
  unidades?: { n: number; nombres: string[]; compartidos: string[]; patillas: Record<string, Record<string, string>> }
  /** La pieza trae encapsulado, patillas y LCSC: se leen con `datos_pieza`. */
  datos?: true
}

/** Una propiedad con `enVivo` es una perilla: se mueve con ajustar_perilla o con `cambios` de simular, dentro de su rango. */
const propiedad = (p: PropDef) => ({
  id: p.id,
  nombre: p.nombre,
  ...(p.unidad ? { unidad: p.unidad } : {}),
  defecto: p.defecto,
  ...(p.opciones ? { opciones: [...p.opciones] } : {}),
  ...(p.enVivo ? { perilla: { min: p.enVivo.min, max: p.enVivo.max, unidad: p.unidad ?? '', escala: p.enVivo.escala === 'log' ? ('log' as const) : ('lineal' as const) } } : {})
})

/** Los tipos de pieza que se pueden colocar, por categoría y nombre, con lo que una orden necesita saber: el id, las
 * patillas para conectar y las propiedades con su unidad. Las variantes de más entradas de una compuerta no salen aparte. */
function unidadesDeCatalogo(d: PiezaDef): EntradaDeCatalogo['unidades'] {
  const u = unidadesDe(d, {})
  if (!u) return undefined
  return { n: u.nombres.length, nombres: u.nombres, compartidos: u.compartidos, patillas: Object.fromEntries(u.nombres.map((n) => [n, patillasDeUnidad(d, {}, n) ?? {}])) }
}

export function catalogo(lib: Map<string, PiezaDef>): EntradaDeCatalogo[] {
  const salida: EntradaDeCatalogo[] = []
  for (const d of lib.values()) {
    if (d.oculta) continue
    const unidades = unidadesDeCatalogo(d)
    salida.push({
      id: d.id,
      nombre: d.nombre.es,
      categoria: d.categoria,
      prefijo: d.prefijo,
      patillas: d.pines.map((p) => ({ id: p.id, nombre: p.nombre })),
      propiedades: d.props.filter((p) => !p.ajuste).map(propiedad),
      ...(d.entradas ? { entradas: { min: 2, max: d.entradas.max } } : {}),
      ...(unidades ? { unidades } : {}),
      ...(d.datos ? { datos: true as const } : {})
    })
  }
  return salida.sort((a, b) => a.categoria.localeCompare(b.categoria, 'es') || a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id))
}

export interface PresentacionDescrita {
  encapsulado: string
  nombreEncapsulado?: string
  /** Id de pin → patilla(s) física(s). */
  patillas: Record<string, string | string[]>
  /** Patillas de alimentación que no son pines del símbolo (VCC, GND). */
  alimentacion?: Record<string, string | string[]>
  sinModelo?: Record<string, string>
  unidades?: { nombre: string; patillas: Record<string, string> }[]
  huella?: string
  parte?: string
  lcsc?: { numero: string; marca: 'comprobado' | 'sin verificar'; comprobado?: string }
}

export interface DatosDePieza {
  tipo: string
  nombre: string
  /** La llave de la fila elegida («BC547», «74HC|3», «*»). */
  opcion: string
  virtual?: true
  fabricante?: string
  parte?: string
  hoja?: string
  aproximada?: string
  equivalencias?: Equivalencias
  presentaciones: PresentacionDescrita[]
  pendiente?: Record<string, string>
  comprobado?: { fecha: string; fuente: string }
  nota?: string
}

/** Los datos físicos de una pieza con las propiedades dadas, para quien arma por encapsulado: presentaciones con el número de
 * patilla de cada pin, la de alimentación, la huella (la de la presentación o la del encapsulado), LCSC con su marca y la
 * hoja. Con un solo dato (`opcion`) se toma como la propiedad que elige la fila. Si no hay datos, dice por qué. */
export function datosDePieza(def: PiezaDef, props: Record<string, string> = {}, opcion?: string): DatosDePieza | { motivo: string } {
  let p = props
  if (opcion !== undefined && def.datos?.por !== undefined) {
    const por = Array.isArray(def.datos.por) ? def.datos.por : [def.datos.por]
    const partes = opcion.split('|')
    p = { ...props }
    por.forEach((id, i) => {
      if (partes[i] !== undefined) p[id] = partes[i]
    })
  }
  if (!def.datos) return { motivo: `«${def.id}» aún no tiene datos físicos (encapsulado, pines, LCSC).` }
  const f = filaDe(def, p)
  if (!f) {
    const por = def.datos.por === undefined ? [] : Array.isArray(def.datos.por) ? def.datos.por : [def.datos.por]
    const validas = Object.keys(def.datos.valores).slice(0, 40).join(', ')
    return { motivo: `«${def.id}» no tiene fila de datos para ${por.map((id) => `${id}=${p[id] ?? def.props.find((q) => q.id === id)?.defecto}`).join(', ') || 'esa combinación'}. Opciones con datos: ${validas}.` }
  }
  const { clave, fila } = f
  const presentaciones: PresentacionDescrita[] = (fila.presentaciones ?? []).map((x) => {
    const enc = ENCAPSULADOS.get(x.encapsulado)
    const huella = x.huella ?? enc?.huella
    return {
      encapsulado: x.encapsulado,
      ...(enc ? { nombreEncapsulado: enc.nombre } : {}),
      patillas: x.patillas,
      ...(x.alimentacion ? { alimentacion: x.alimentacion } : {}),
      ...(x.sinModelo ? { sinModelo: x.sinModelo } : {}),
      ...(x.unidades ? { unidades: x.unidades } : {}),
      ...(huella ? { huella } : {}),
      ...(x.parte ? { parte: x.parte } : {}),
      ...(x.lcsc ? { lcsc: { numero: x.lcsc.numero, marca: x.lcsc.comprobado && !x.lcsc.sinVerificar ? ('comprobado' as const) : ('sin verificar' as const), ...(x.lcsc.comprobado ? { comprobado: x.lcsc.comprobado } : {}) } } : {})
    }
  })
  const equivalencias = fila.equivalencias ?? def.datos.equivalencias
  return {
    tipo: def.id,
    nombre: def.nombre.es,
    opcion: clave,
    ...(fila.virtual ? { virtual: true as const } : {}),
    ...(fila.fabricante ? { fabricante: fila.fabricante } : {}),
    ...(fila.parte ? { parte: fila.parte } : {}),
    ...(fila.hoja ? { hoja: fila.hoja } : {}),
    ...(fila.aproximada ? { aproximada: fila.aproximada } : {}),
    ...(equivalencias ? { equivalencias } : {}),
    presentaciones,
    ...(fila.pendiente ? { pendiente: fila.pendiente } : {}),
    ...(fila.comprobado ? { comprobado: fila.comprobado } : {}),
    ...(fila.nota ? { nota: fila.nota } : {})
  }
}
