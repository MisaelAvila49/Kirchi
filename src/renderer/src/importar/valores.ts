/** Valores, reóstatos y pines de caja: cómo una pieza ajena pasa sus propiedades a una de Kirchi. */
import type { PinPropio } from '../doc/tipos'
import { MAX_PINES_CAJA } from '../piezas/sinEquivalencia'
import type { PiezaDef } from '../piezas/tipos'
import { leerValor } from '../valores/valores'
import type { CircuitoAjeno, FormatoAjeno, PiezaAjena } from './ajeno'
import { proyectar } from './acomodo'
import { textoNumero } from './instrumentos'
import { numeroSpice } from './lectores/spice'
import { emparejarPines } from './pines'

const ID_PIN = /^[A-Za-z0-9_+-]{1,16}$/

/** El número de un valor del origen. KiCad y Proteus escriben como Kirchi (`1M` son 1 mega, `1m` es 1 milli, `4k7`, `220R`);
 * SPICE, LTspice y Falstad usan `meg` para mega y `M` es milli. La unidad sobrante (Ω, F) se ignora. */
export function numeroDeValor(v: string, formato: FormatoAjeno): number | null {
  // KiCad escribe a veces el parámetro con el valor (`r=5`, `c=100u`).
  v = v.replace(/^[A-Za-z_]+=/, '')
  const kirchi = leerValor(v)?.valor ?? null
  return formato === 'kicad' || formato === 'proteus' ? (kirchi ?? numeroSpice(v)) : (numeroSpice(v) ?? kirchi)
}

/** Valor ajeno como se escribe en Kirchi (`10000.0` es `10k`); lo que no es número se deja y se avisa. */
export function valorKirchi(v: string, ref: string, avisos: string[], formato: FormatoAjeno): string {
  const n = numeroDeValor(v, formato)
  if (n === null) {
    avisos.push(`${ref}: el valor «${v}» no es un número y se dejó tal cual.`)
    return v
  }
  return textoNumero(n)
}

/** El valor, la posición y el estado del origen en las propiedades de la pieza de Kirchi. */
export function aplicarValor(def: PiezaDef, p: PiezaAjena, props: Record<string, string>, avisos: string[], formato: FormatoAjeno, omision?: string): void {
  const m = def.modelo
  const crudo = p.valor ?? p.props.dc
  switch (m?.tipo) {
    case 'R': case 'C': case 'L': case 'I':
      // Una fuente solo de CA (`iin 1 0 ac`) no da corriente en CD.
      if (m.tipo === 'I' && crudo === undefined && p.props.ac !== undefined) props[m.prop] = '0'
      else if (crudo !== undefined && omision !== undefined && numeroDeValor(crudo, formato) === null) props[m.prop] = omision
      else if (crudo !== undefined) props[m.prop] = valorKirchi(crudo, p.ref, avisos, formato)
      else if (omision !== undefined) props[m.prop] = omision
      // La condición inicial del elemento (`ic=` de SPICE o LTspice, el estado guardado de Falstad).
      if ((m.tipo === 'C' || m.tipo === 'L') && m.ic !== undefined) {
        const ic = p.props.ic ?? /(?:^|\s)ic=(\S+)/i.exec(p.props.spiceLine ?? '')?.[1]
        if (ic !== undefined && numeroDeValor(ic, formato) !== null) props[m.ic] = valorKirchi(ic, p.ref, avisos, formato)
      }
      break
    case 'V':
      if (crudo !== undefined) props[m.prop] = valorKirchi(crudo, p.ref, avisos, formato)
      else if (p.props.ac !== undefined) props[m.prop] = '0'
      break
    case 'controlada':
      if (crudo !== undefined) props[m.prop] = valorKirchi(crudo, p.ref, avisos, formato)
      break
    case 'pot': {
      if (crudo !== undefined) props[m.prop] = valorKirchi(crudo, p.ref, avisos, formato)
      const pos = numeroSpice(p.props.posicion ?? '')
      if (pos !== null) props[m.posicion] = `${Math.round(Math.min(1, Math.max(0, pos)) * 100)} %`
      // LAW de Proteus (1 logarítmica, 2 antilogarítmica): la curva de Kirchi es parecida, no igual.
      const ley = p.props.LAW === '1' ? 'logarítmica' : p.props.LAW === '2' ? 'antilogarítmica' : undefined
      if (ley && m.ley) {
        props[m.ley] = ley
        avisos.push(`${p.ref}: la ley ${ley} se importó con la curva de Kirchi, que es aproximada.`)
      }
      break
    }
    case 'interruptor': {
      const c = p.props.cerrado
      if (c !== undefined) {
        const abierto = def.props.find((d) => d.id === m.prop)?.opciones?.find((o) => o !== m.cerrado)
        if (c === '1') props[m.prop] = m.cerrado
        else if (abierto) props[m.prop] = abierto
      }
      break
    }
    default:
  }
}

/** Un potenciómetro del origen con el cursor y un solo extremo conectados es un reóstato: qué pin ajeno es cada cosa y si la posición se invierte. */
export function comoReostato(p: PiezaAjena, def: PiezaDef, props: Record<string, string>, fisico: boolean, conectados: Set<string>): { pares: Map<string, string>; libre: string; invertida: boolean } | null {
  const m = def.modelo
  if (m?.tipo !== 'pot' || m.reostato || m.b === undefined || p.pines.length !== 3) return null
  const pot = emparejarPines(p, def, props, { fisico }).pares
  const clave = (q: PiezaAjena['pines'][number]): string | undefined => [q.numero, q.nombre].find((c): c is string => c !== undefined && pot.has(c))
  const conectado = (q: PiezaAjena['pines'][number]): boolean => [q.numero, q.nombre].some((c) => c !== undefined && conectados.has(`${p.ref}\0${c}`))
  const rolDe = (id: string) => p.pines.find((q) => clave(q) !== undefined && pot.get(clave(q)!) === id)
  const cursor = rolDe(m.c), a = rolDe(m.a), b = rolDe(m.b)
  if (!cursor || !a || !b || !conectado(cursor) || conectado(a) === conectado(b)) return null
  const extremo = conectado(a) ? a : b
  const libre = conectado(a) ? b : a
  const pares = new Map<string, string>()
  for (const [q, id] of [[extremo, '1'], [cursor, '2']] as const) for (const c of [q.numero, q.nombre]) if (c !== undefined && !pares.has(c)) pares.set(c, id)
  return { pares, libre: libre.numero ?? libre.nombre ?? '', invertida: extremo === b }
}

/** Pines de la caja gris: lado por la geometría del origen si hay pines a los dos lados; si no, la primera mitad a la izquierda. */
export function pinesDeCaja(p: PiezaAjena, ajeno: CircuitoAjeno): { pines: PinPropio[]; pares: Map<string, string> } {
  const todos = p.pines.slice(0, MAX_PINES_CAJA)
  const centro = p.x === undefined ? undefined : proyectar(ajeno, p.x, p.y ?? 0).x
  const conPos = todos.map((q) => (q.x === undefined || q.y === undefined ? undefined : proyectar(ajeno, q.x, q.y)))
  const geometria = centro !== undefined && conPos.every((q) => q !== undefined) && conPos.some((q) => q!.x < centro - 1e-6) && conPos.some((q) => q!.x >= centro - 1e-6)
  const usados = new Set<string>()
  const ids = todos.map((q, i) => {
    let id = [q.numero, q.nombre].find((c): c is string => c !== undefined && ID_PIN.test(c)) ?? `p${i + 1}`
    while (usados.has(id)) id = `${id}_`
    usados.add(id)
    return id
  })
  const pines: PinPropio[] = todos.map((q, i) => ({
    id: ids[i]!,
    nombre: (q.nombre ?? q.numero ?? ids[i]!).slice(0, 12),
    ...(q.numero !== undefined && q.numero !== q.nombre ? { numero: q.numero.slice(0, 6) } : {}),
    lado: geometria ? (conPos[i]!.x < centro! - 1e-6 ? 'izq' : 'der') : i < Math.ceil(todos.length / 2) ? 'izq' : 'der'
  }))
  // Cada lado de arriba abajo: por la posición del origen si la hay, si no en el orden en que vienen.
  if (geometria) {
    const y = new Map(pines.map((q, i) => [q.id, conPos[i]!.y]))
    pines.sort((a, b) => y.get(a.id)! - y.get(b.id)!)
  }
  const pares = new Map<string, string>()
  // Proteus nombra el pin por su nombre salvo en las unidades; un nombre puede coincidir con el número de otro pin.
  const campos = ajeno.formato === 'proteus' && p.unidad === undefined ? (['nombre', 'numero'] as const) : (['numero', 'nombre'] as const)
  for (const campo of campos)
    todos.forEach((q, i) => {
      const c = q[campo]
      if (c !== undefined && !pares.has(c)) pares.set(c, ids[i]!)
    })
  return { pines, pares }
}
