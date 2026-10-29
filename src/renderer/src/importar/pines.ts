/** Empareja los pines de una pieza ajena con los de la pieza de Kirchi que la reemplaza. */
import type { PiezaDef } from '../piezas/tipos'
import { filaDe } from '../piezas/validarDatos'
import type { PiezaAjena } from './ajeno'

export interface Emparejado {
  /** Número y nombre ajenos (los que existan) a id de pin de Kirchi. */
  pares: Map<string, string>
  /** Pines ajenos sin pin en Kirchi (número o nombre). */
  sobrantes: string[]
  /** Ids de pines de Kirchi sin pin ajeno. */
  faltantes: string[]
}

export interface OpcionesPines {
  /** El origen da números de encapsulado (KiCad, Proteus): se comparan con las patillas de la hoja de datos. */
  fisico?: boolean
  /** Pin ajeno (en mayúsculas) a pin de Kirchi cuando los nombres no coinciden; varios pines ajenos pueden ir al mismo. */
  fijos?: Record<string, string>
}

/** Orden de los pines de Kirchi cuando el ajeno solo da posiciones (SPICE: Q = C B E, M y J = D G S, amp-op como el símbolo
 * de LTspice: + − V+ V− salida). Una pieza que no esté aquí se recorre en el orden de su `pieza.json`. */
export const ORDEN_SPICE: Record<string, string[]> = {
  npn: ['C', 'B', 'E'],
  pnp: ['C', 'B', 'E'],
  'mosfet-n': ['D', 'G', 'S'],
  'mosfet-p': ['D', 'G', 'S'],
  'jfet-n': ['D', 'G', 'S'],
  'jfet-p': ['D', 'G', 'S'],
  'amp-op': ['+', '-', 'V+', 'V-', 'OUT'],
  comparador: ['+', '-', 'V+', 'V-', 'OUT']
}

const MAS = ['+', 'in+', '+in', 'inp', 'ip', '+ip', 'ni', 'noninv', 'noninverting', 'plus', 'inplus', '+input', 'in1+']
const MENOS = ['-', 'in-', '-in', 'inn', 'im', 'inv', 'inverting', 'minus', 'inminus', '-input', 'in1-']
const SALIDA = ['out', 'op', 'o', 'output', 'vo', 'vout', 'sal', 'salida']
const VPOS = ['v+', 'vcc', 'vdd', 'vs+', 'vpos', 'vplus', '+v', '+vs', 'vcc+']
const VNEG = ['v-', 'vee', 'vss', 'vs-', 'vneg', 'vminus', '-v', '-vs', 'vcc-']
const CURSOR = ['cursor', 'wiper', 'w', 'wip']

const ROLES = new Map<string, string>()
for (const [rol, nombres] of [['+', MAS], ['-', MENOS], ['out', SALIDA], ['v+', VPOS], ['v-', VNEG], ['cursor', CURSOR]] as const) for (const n of nombres) ROLES.set(n, rol)

const normalizar = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[−–—]/g, '-').replace(/[\s_()~]/g, '')
/** El papel del pin (+, −, salida, V+, V−, cursor) o su nombre sin mayúsculas ni signos de agrupación. */
const rol = (s: string): string => {
  const n = normalizar(s)
  return ROLES.get(n) ?? n
}

/** Los papeles con que se puede reconocer un pin de Kirchi: su id, su nombre y lo que va entre paréntesis en el nombre. */
function clavesDePin(p: { id: string; nombre: string }): string[] {
  const parentesis = /\(([^)]+)\)/.exec(p.nombre)?.[1]
  return [...new Set([rol(p.id), rol(p.nombre), ...(parentesis ? [rol(parentesis)] : [])])]
}

/** Patillas físicas de la presentación que representa la fila elegida: número físico a id de pin. */
function porNumeroFisico(def: PiezaDef, props: Record<string, string>): Map<string, string> {
  const salida = new Map<string, string>()
  const presentaciones = filaDe(def, props)?.fila.presentaciones ?? []
  const elegida = presentaciones.find((p) => p.representativa && p.patillas && Object.keys(p.patillas).length) ?? presentaciones.find((p) => p.patillas && Object.keys(p.patillas).length)
  for (const [pin, fisicas] of Object.entries(elegida?.patillas ?? {})) for (const f of Array.isArray(fisicas) ? fisicas : [fisicas]) if (!salida.has(f)) salida.set(f, pin)
  return salida
}

/** Orden: número físico (si el origen lo da), nombre o papel, número igual al id y, al final, la posición (`ORDEN_SPICE` o el
 * orden de la pieza). Una vez asignado, un pin no se reutiliza. */
export function emparejarPines(p: PiezaAjena, def: PiezaDef, props: Record<string, string>, op: OpcionesPines = {}): Emparejado {
  const kirchi = def.pines
  const asignado = new Map<number, string>()
  const usados = new Set<string>()
  const libres = (): number[] => p.pines.map((_, i) => i).filter((i) => !asignado.has(i))
  const poner = (i: number, id: string): void => {
    asignado.set(i, id)
    usados.add(id)
  }

  if (op.fijos) {
    for (const i of libres()) {
      const q = p.pines[i]!
      const id = [q.nombre, q.numero].map((c) => (c === undefined ? undefined : op.fijos![c.toUpperCase()])).find((x) => x !== undefined)
      if (id !== undefined && kirchi.some((k) => k.id === id)) poner(i, id)
    }
  }

  if (op.fisico) {
    const fisicos = porNumeroFisico(def, props)
    for (const i of libres()) {
      const n = p.pines[i]!.numero
      const id = n === undefined ? undefined : fisicos.get(n)
      if (id !== undefined && !usados.has(id)) poner(i, id)
    }
  }

  // Nombre: id idéntico, luego papel, luego nombre completo del pin de Kirchi.
  const porNombre: ((i: number) => string | undefined)[] = [
    (i) => {
      const n = p.pines[i]!.nombre
      return n === undefined ? undefined : kirchi.find((k) => !usados.has(k.id) && normalizar(k.id) === normalizar(n))?.id
    },
    (i) => {
      const n = p.pines[i]!.nombre
      const r = n === undefined ? undefined : rol(n)
      return r === undefined ? undefined : kirchi.find((k) => !usados.has(k.id) && clavesDePin(k).includes(r))?.id
    }
  ]
  for (const paso of porNombre) for (const i of libres()) {
    const id = paso(i)
    if (id !== undefined) poner(i, id)
  }

  // Número igual al id (resistencias 1 y 2); si el pin no tiene número, su nombre.
  for (const i of libres()) {
    const q = p.pines[i]!
    const n = q.numero ?? q.nombre
    const id = n === undefined ? undefined : kirchi.find((k) => !usados.has(k.id) && normalizar(k.id) === normalizar(n))?.id
    if (id !== undefined) poner(i, id)
  }

  // Posición: el pin k-ésimo que quede contra el k-ésimo de Kirchi que quede, en el orden de la familia.
  const orden = (ORDEN_SPICE[def.id] ?? kirchi.map((k) => k.id)).filter((id) => kirchi.some((k) => k.id === id) && !usados.has(id))
  const resto = kirchi.map((k) => k.id).filter((id) => !usados.has(id) && !orden.includes(id))
  const cola = [...orden, ...resto]
  for (const i of libres()) {
    const id = cola.shift()
    if (id === undefined) break
    poner(i, id)
  }

  // El número manda sobre el nombre cuando un nombre coincide con el número de otro pin.
  const pares = new Map<string, string>()
  const sobrantes: string[] = []
  for (const campo of ['numero', 'nombre'] as const)
    p.pines.forEach((q, i) => {
      const id = asignado.get(i)
      const clave = q[campo]
      if (id !== undefined && clave !== undefined && !pares.has(clave)) pares.set(clave, id)
    })
  p.pines.forEach((q, i) => {
    const clave = q.numero ?? q.nombre
    if (!asignado.has(i) && clave !== undefined) sobrantes.push(clave)
  })
  return { pares, sobrantes, faltantes: kirchi.map((k) => k.id).filter((id) => !usados.has(id)) }
}
