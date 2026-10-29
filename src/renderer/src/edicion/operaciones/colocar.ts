import { aplicar, crear, juntar } from '../../doc/comandos'
import { coordenadaValida, MOTIVO_FUERA_DEL_MUNDO } from '../../doc/limites'
import { firmaDe, paqueteDe, refDe, siguienteNumero, siguienteUnidad, unidadesDe } from '../../doc/paquetes'
import { errorDeReferencia, MAX_REFERENCIA } from '../../doc/referencias'
import type { Pieza, Punto } from '../../doc/tipos'
import type { PiezaDef } from '../../piezas/tipos'
import { cuerpoEnMundo, lugarLibre } from '../../editor/colision'
import { cambiarProp, nuevaPieza, propDelBuscador } from '../../editor/colocar'
import { cableEnCuerpo } from '../../editor/conflictos'
import { idConEntradas } from '../../editor/entradas'
import { insertarEnCable } from '../../editor/insertar'
import { motivoDeChoque } from '../motivos'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { MOTIVO_FUERA_DE_REJILLA, puntoAUnidades } from '../unidades'
import { TIPOS_DE_OBJETO } from '../objetos'

type Colocar = Extract<Orden, { orden: 'colocar' }>

/** Separación en unidades entre lo que hay y una pieza colocada sin posición: deja sitio para cablear. */
const HUECO_ENTRE_PIEZAS = 8
const par = (v: number): number => Math.ceil(v / 2) * 2

/** Lugar de partida de una pieza sin posición: a la derecha de todo lo que hay, a la altura de su centro. */
function lugarInicial(est: Estado, pieza: Pieza): Punto {
  const cajas = Object.values(est.doc.piezas).map((p) => cuerpoEnMundo(p, est.lib.get(p.tipo)))
  if (cajas.length === 0) return { x: 0, y: 0 }
  const derecha = Math.max(...cajas.map((c) => c.maxX))
  const arriba = Math.min(...cajas.map((c) => c.minY)), abajo = Math.max(...cajas.map((c) => c.maxY))
  const propia = cuerpoEnMundo({ ...pieza, x: 0, y: 0 }, est.lib.get(pieza.tipo))
  return { x: par(derecha + HUECO_ENTRE_PIEZAS - propia.minX), y: par((arriba + abajo) / 2 - (propia.minY + propia.maxY) / 2) }
}

/** Paquete y unidad de una pieza nueva que los pide: valida contra lo que ya hay en el paquete y dice por qué no cabe. */
function unidadPedida(est: Estado, def: PiezaDef, pieza: Pieza, paquete: string | undefined, unidad: string | undefined): { paquete: string; unidad: string } | Rechazo {
  const { doc, lib } = est
  const u = unidadesDe(def, pieza.props)
  if (!u) return rechazo(`${def.id} no tiene unidades: «paquete» y «unidad» no aplican.`)
  if (unidad !== undefined && !u.nombres.includes(unidad)) return rechazo(`${def.id} no tiene la unidad «${unidad.slice(0, 20)}»: tiene ${u.nombres.join(', ')}.`)
  const firma = firmaDe(def, pieza.props)
  const libres = (pq: string) => u.nombres.filter((n) => !Object.values(doc.piezas).some((q) => q.props.paquete === pq && q.props.unidad === n))
  if (paquete === undefined) {
    // Sin paquete: la unidad pedida en el primer encapsulado compatible donde esté libre, o en uno nuevo.
    const compatibles = [...new Set(Object.values(doc.piezas).filter((q) => q.tipo === def.id && paqueteDe(q) && firmaDe(def, q.props) === firma).map((q) => q.props.paquete))]
    const hueco = compatibles.sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).find((pq) => libres(pq).includes(unidad!))
    return { paquete: hueco ?? `${def.prefijo}${siguienteNumero(doc, def.prefijo)}`, unidad: unidad! }
  }
  if (/\s/.test(paquete)) return rechazo('El paquete no lleva espacios.')
  if (paquete.length + 1 > MAX_REFERENCIA) return rechazo(`El paquete admite ${MAX_REFERENCIA - 1} caracteres como máximo, con la letra de la unidad.`)
  const ocupantes = Object.values(doc.piezas).filter((q) => q.props.paquete === paquete)
  const otro = ocupantes.find((q) => q.tipo !== def.id)
  if (otro) return rechazo(`El paquete ${paquete} es de otro tipo (${otro.ref} es ${otro.tipo}): un chip no mezcla tipos.`)
  const distinta = ocupantes.find((q) => firmaDe(def, q.props) !== firma)
  if (distinta) return rechazo(`El paquete ${paquete} tiene otra familia, entradas o alimentación que la pieza nueva: pon las mismas en «props».`)
  if (ocupantes.length === 0) {
    const choca = Object.values(doc.piezas).find((q) => q.ref.toUpperCase() === paquete.toUpperCase() || q.props.paquete?.toUpperCase() === paquete.toUpperCase())
    if (choca) return rechazo(`Ya hay otra pieza con la referencia ${choca.ref}.`)
  }
  const libre = libres(paquete)
  if (unidad !== undefined) {
    const en = ocupantes.find((q) => q.props.unidad === unidad)
    return en ? rechazo(`La unidad ${unidad} de ${paquete} ya está en uso por ${en.ref}.`) : { paquete, unidad }
  }
  return libre.length ? { paquete, unidad: libre[0] } : rechazo(`El paquete ${paquete} no tiene unidades libres (${u.nombres.length} de ${u.nombres.length} en uso).`)
}

export function colocarOrden(est: Estado, o: Colocar): Plan | Rechazo {
  const { doc, lib } = est
  let def = lib.get(o.tipo)
  if (!def) return rechazo(`No existe el tipo de pieza «${o.tipo}».`)

  // La cantidad de entradas de una compuerta es otra pieza de su familia, no un valor.
  const entradas = o.props?.entradas
  if (entradas !== undefined && def.entradas) {
    const n = Number(entradas)
    if (!Number.isInteger(n) || n < 2 || n > def.entradas.max) return rechazo(`Las entradas van de 2 a ${def.entradas.max}.`)
    def = lib.get(idConEntradas(def.entradas.base, n)) ?? def
  }

  let en: Punto | null = null
  if (o.en) {
    en = puntoAUnidades(o.en)
    if (!en) return rechazo(MOTIVO_FUERA_DE_REJILLA)
  }
  let pieza = nuevaPieza(doc, def, en ?? { x: 0, y: 0 }, o.rot ?? 0, o.espejo ?? false, est.gen)

  if (o.ref !== undefined) {
    const e = errorDeReferencia(doc, pieza.id, o.ref)
    if (e) return rechazo(e)
    pieza = { ...pieza, ref: o.ref.trim() }
  }
  const cambios: [string, string][] = []
  if (o.valor !== undefined) {
    const prop = propDelBuscador(def)
    if (!prop) return rechazo(`${pieza.ref} no tiene un valor editable.`)
    cambios.push([prop.id, o.valor])
  }
  for (const [k, v] of Object.entries(o.props ?? {})) {
    if (k === 'entradas' && lib.get(o.tipo)?.entradas) continue
    if (k === 'spice') return rechazo('El modelo propio se cambia después de colocar la pieza.')
    cambios.push([k, v])
  }
  for (const [k, v] of cambios) {
    const r = cambiarProp(pieza, def, k, v)
    if ('error' in r) return rechazo(r.error)
    pieza = r.pieza
  }

  // Una pieza con unidades toma la que se pide o la primera libre de un paquete del mismo tipo y familia (U1B tras U1A), o abre uno nuevo.
  if (o.paquete !== undefined || o.unidad !== undefined) {
    if (o.ref !== undefined) return rechazo('«ref» no se combina con «paquete» ni «unidad»: la referencia sale del paquete y la unidad (U1B).')
    const su = unidadPedida(est, def, pieza, o.paquete, o.unidad)
    if ('motivo' in su) return su
    pieza = { ...pieza, ref: refDe(su.paquete, su.unidad), props: { ...pieza.props, paquete: su.paquete, unidad: su.unidad } }
  } else if (o.ref === undefined) {
    const su = siguienteUnidad(doc, lib, def.id, pieza.props)
    if (su) pieza = { ...pieza, ref: refDe(su.paquete, su.unidad), props: { ...pieza.props, paquete: su.paquete, unidad: su.unidad } }
  }

  const verbo = `No se colocó ${pieza.ref}`
  if (!en) {
    const lugar = lugarLibre(doc, lib, [{ ...pieza, x: 0, y: 0 }], lugarInicial(est, pieza), est.indice)
    if (!lugar.libre) return rechazo(`${verbo}: no hay lugar libre.`)
    en = lugar.en
  }
  pieza = { ...pieza, x: en.x, y: en.y }
  if (!coordenadaValida(en.x, en.y)) return rechazo(`${verbo}: ${MOTIVO_FUERA_DEL_MUNDO}.`)

  const choca = TIPOS_DE_OBJETO.pieza.choque({ ...doc, piezas: { ...doc.piezas, [pieza.id]: pieza } }, lib, pieza.id, undefined, est.indice)
  if (choca) return rechazo(`${verbo}: ${motivoDeChoque(doc, { con: choca }, null)}.`)

  // Sobre un cable, una pieza de dos pines lo parte y queda en serie, en el mismo paso.
  const alta = crear('colocar', 'piezas', pieza)
  const ins = insertarEnCable(doc, lib, pieza, est.gen)
  const cmd = ins ? juntar('colocar', [alta, ins]) : alta
  if (cableEnCuerpo(aplicar(doc, cmd), lib, pieza)) return rechazo(`${verbo}: un cable atravesaría ${pieza.ref}.`)
  return { cmd, creados: { [pieza.ref]: pieza.id }, avisos: [], verbo }
}
