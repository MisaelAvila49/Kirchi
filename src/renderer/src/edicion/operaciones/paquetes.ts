import { aplicar, fusionar, juntar, modificar, type Comando } from '../../doc/comandos'
import { limpiarTexto } from '../../doc/limpiar'
import { agrupar, paqueteDe, refDe, renombrarPaquete, siguienteNumero, unidadesDe, unidadesDelPaquete } from '../../doc/paquetes'
import type { Documento, Pieza } from '../../doc/tipos'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { piezaPorRef, sinPieza } from '../referencias'

const sinCambio = (nombre: string): Plan => ({ cmd: { nombre, cambios: [] }, creados: {}, avisos: [] })

/** Quién ocupa cada unidad de la pieza (A, B, C…): null si está libre. La propia cuenta como libre para sí misma. */
export function ocupantesDeUnidades(doc: Documento, p: Pieza, nombres: string[]): { nombre: string; enUso: string | null }[] {
  const pq = paqueteDe(p)
  return nombres.map((nombre) => {
    const o = pq ? Object.values(doc.piezas).find((q) => q.id !== p.id && q.props.paquete === pq.paquete && q.props.unidad === nombre) : undefined
    return { nombre, enUso: o?.ref ?? null }
  })
}

/** Texto de una unidad ocupada, como lo rotula el selector del inspector. */
export const textoUnidadEnUso = (ref: string): string => `en uso por ${ref}`

/** Pasa la pieza a otra unidad libre de su encapsulado (U1A a U1B). */
export function unidadDePieza(est: Estado, p: Pieza, unidad: string): Plan | Rechazo {
  const def = est.lib.get(p.tipo)
  const pq = paqueteDe(p)
  if (!def || !pq) return rechazo(`${p.ref} no forma parte de un encapsulado con unidades.`)
  const u = unidadesDe(def, p.props)
  if (!u || !u.nombres.includes(unidad)) return rechazo(`${p.ref} no tiene la unidad «${unidad.slice(0, 20)}».`)
  if (unidad === pq.unidad) return sinCambio('unidad')
  const ocupante = ocupantesDeUnidades(est.doc, p, [unidad])[0].enUso
  if (ocupante) return rechazo(`La unidad ${unidad} de ${pq.paquete} ya está ${textoUnidadEnUso(ocupante)}.`)
  return { cmd: modificar('unidad', 'piezas', p, { ...p, ref: refDe(pq.paquete, unidad), props: { ...p.props, unidad } }), creados: {}, avisos: [] }
}

/** Renombra el paquete de una unidad en todas sus unidades, en un solo paso. Escribir la referencia entera de la pieza no cambia nada. */
export function renombrarPaqueteDePieza(est: Estado, p: Pieza, texto: string): Plan | Rechazo {
  const pq = paqueteDe(p)
  if (!pq) return rechazo(`${p.ref} no forma parte de un encapsulado.`)
  const t = limpiarTexto(texto).trim()
  if (t.toUpperCase() === pq.paquete.toUpperCase() || t.toUpperCase() === p.ref.toUpperCase()) return sinCambio('referencia')
  const r = renombrarPaquete(est.doc, pq.paquete, t)
  if (!r.ok) return rechazo(r.error)
  const cmd = juntar('referencia', r.cambios.map((c) => {
    const q = est.doc.piezas[c.id]
    return modificar('referencia', 'piezas', q, { ...q, ref: c.ref, props: { ...q.props, paquete: c.paquete } })
  }))
  return { cmd, creados: {}, avisos: [] }
}

/** «Agrupar en encapsulados»: las piezas multiunidad sueltas pasan a paquetes U1A, U1B… en orden de lectura. */
export function agruparPlan(est: Estado): Plan {
  const cambios = agrupar(est.doc, est.lib)
  if (cambios.length === 0) return { ...sinCambio('agrupar en encapsulados'), avisos: ['No hay piezas sueltas que agrupar.'] }
  const cmd = juntar('agrupar en encapsulados', cambios.map((c) => {
    const p = est.doc.piezas[c.id]
    return modificar('agrupar', 'piezas', p, { ...p, ref: c.ref, props: { ...p.props, paquete: c.paquete, unidad: c.unidad } })
  }))
  const paquetes = new Set(cambios.map((c) => c.paquete)).size
  // Los renombres (U3 → U1C) van en el aviso para que el asistente sepa cómo se llaman ahora sus piezas.
  const renombres = cambios.slice(0, 40).map((c) => `${est.doc.piezas[c.id].ref} → ${c.ref}`).join(', ') + (cambios.length > 40 ? '…' : '')
  return { cmd, creados: {}, avisos: [`Se agruparon ${cambios.length} ${cambios.length === 1 ? 'pieza' : 'piezas'} en ${paquetes} ${paquetes === 1 ? 'encapsulado' : 'encapsulados'}: ${renombres}.`] }
}

/** Después de cambiar lo que comparten las unidades: las que ya no caben en el chip nuevo pasan a un paquete nuevo
 * (con las letras que éste tenga) o, si el chip no tiene unidades, vuelven a ser piezas sueltas. `tras` son las unidades
 * del paquete como quedan, ya incluidas en `cmd`. */
export function ajustarPaquete(est: Estado, cmd: Comando, tras: Pieza[]): { cmd: Comando; avisos: string[] } {
  const def = est.lib.get(tras[0].tipo)
  const u = def ? unidadesDe(def, tras[0].props) : null
  const caben = u?.nombres ?? []
  const sobran = tras.filter((p) => !caben.includes(p.props.unidad))
  if (!def || sobran.length === 0) return { cmd, avisos: [] }
  const nuevas: Pieza[] = []
  if (u) {
    const n = siguienteNumero(est.doc, def.prefijo)
    sobran.forEach((p, i) => {
      const paquete = `${def.prefijo}${n + Math.floor(i / caben.length)}`
      const unidad = caben[i % caben.length]
      nuevas.push({ ...p, ref: refDe(paquete, unidad), props: { ...p.props, paquete, unidad } })
    })
  } else {
    const n = siguienteNumero(est.doc, def.prefijo, new Set(tras.map((p) => p.id)))
    sobran.forEach((p, i) => {
      const { paquete: _p, unidad: _u, ...props } = p.props
      nuevas.push({ ...p, ref: `${def.prefijo}${n + i}`, props })
    })
  }
  let c = cmd
  sobran.forEach((p, i) => (c = fusionar(c, modificar('valor', 'piezas', p, nuevas[i]))))
  const paso = sobran.map((p, i) => `${p.ref} pasó a ${nuevas[i].ref}`).join(', ')
  return { cmd: c, avisos: [`${paso}: el chip nuevo ${u ? `tiene ${caben.length} ${caben.length === 1 ? 'unidad' : 'unidades'}` : 'no tiene unidades'}.`] }
}

/** El cambio de algo que comparten todas las unidades (familia, alimentación, modelo): `nueva` es la pieza editada ya
 * cambiada y el resto de su paquete la sigue, en el mismo comando. */
export function cambiarCompartida(est: Estado, p: Pieza, nueva: Pieza, claves: readonly string[]): { cmd: Comando; avisos: string[] } {
  const unidades = unidadesDelPaquete(est.doc, p.props.paquete)
  const cambiadas = claves.filter((k) => nueva.props[k] !== p.props[k])
  const tras = unidades.map((q) => (q.id === p.id ? nueva : { ...q, props: { ...q.props, ...Object.fromEntries(cambiadas.map((k) => [k, nueva.props[k]])) } }))
  const cmd = juntar('valor', unidades.map((q, i) => modificar('valor', 'piezas', q, tras[i])))
  return ajustarPaquete(est, cmd, tras)
}

/** Lo mismo con la cantidad de entradas de una compuerta, que cambia el tipo de cada unidad y arrastra sus cables. */
export function cambiarEntradasDelPaquete(est: Estado, p: Pieza, n: number, cambiar: (doc: Documento, id: string, n: number) => Comando | { error: string }): { cmd: Comando; avisos: string[] } | { error: string } {
  const unidades = unidadesDelPaquete(est.doc, p.props.paquete)
  let doc = est.doc
  let cmd: Comando | null = null
  for (const q of unidades) {
    const c = cambiar(doc, q.id, n)
    if ('error' in c) return c
    cmd = cmd ? fusionar(cmd, c) : c
    doc = aplicar(doc, c)
  }
  return ajustarPaquete(est, cmd!, unidades.map((q) => doc.piezas[q.id]))
}

type Unidad = Extract<Orden, { orden: 'unidad' }>

export function unidadOrden(est: Estado, o: Unidad): Plan | Rechazo {
  const p = piezaPorRef(est.doc, o.ref)
  return p ? unidadDePieza(est, p, o.unidad) : rechazo(sinPieza(o.ref))
}

export const agruparOrden = (est: Estado): Plan => agruparPlan(est)
