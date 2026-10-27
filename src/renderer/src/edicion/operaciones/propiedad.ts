import { modificar } from '../../doc/comandos'
import { limpiarTexto } from '../../doc/limpiar'
import { paqueteDe, PROPS_COMPARTIDAS } from '../../doc/paquetes'
import { errorDeReferencia } from '../../doc/referencias'
import type { Pieza } from '../../doc/tipos'
import { familiaSpice, spiceDeTexto, spiceVigente } from '../../doc/spice'
import { cambiarProp } from '../../editor/colocar'
import { cambiarEntradas } from '../../editor/entradas'
import { textoDeNumero } from '../../instrumentos/ajusteAutomatico'
import { CAMPO_VOLTAJE, cambioDeRiel, nombreDeRiel } from '../../netlist/alimentaciones'
import { alimentacionAlCambiarFamilia, esModeloDigital } from '../../netlist/digital'
import { leerValor } from '../../valores/valores'
import type { Orden } from '../ordenes'
import { rechazo, type Estado, type Plan, type Rechazo } from '../plan'
import { cambiarCompartida, cambiarEntradasDelPaquete, renombrarPaqueteDePieza } from './paquetes'
import { piezaPorRef, sinPieza } from '../referencias'

type Propiedad = Extract<Orden, { orden: 'propiedad' }>

const sinCambio = (): Plan => ({ cmd: { nombre: 'valor', cambios: [] }, creados: {}, avisos: [] })

/** La pieza con ese juego propio de SPICE (o sin él, si es null): el campo no queda en el documento. */
function conSpice(p: Pieza, spice: Record<string, number> | null): Pieza {
  const { spice: _antes, ...resto } = p
  return spice ? { ...resto, spice } : resto
}

/** Igual que el inspector: mismas validaciones, la cantidad de entradas de una compuerta, el periodo de una fuente de
 * pulso y el voltaje de un terminal de alimentación. */
export function propiedadOrden(est: Estado, o: Propiedad): Plan | Rechazo {
  const p = piezaPorRef(est.doc, o.ref)
  return p ? propiedadDePieza(est, p, o.prop, o.valor) : rechazo(sinPieza(o.ref))
}

/** Lo mismo para una pieza ya elegida (el editor sabe cuál es por su id). `ref` cambia la referencia con las reglas del
 * doble clic. */
export function propiedadDePieza(est: Estado, p: Pieza, prop: string, valor: string): Plan | Rechazo {
  const { doc, lib } = est
  const def = lib.get(p.tipo)
  if (!def) return rechazo(`${p.ref} es de un tipo que esta librería no tiene.`)

  if (prop === 'ref') {
    // La referencia de una unidad es la de su paquete: se renombra en todas sus unidades.
    if (paqueteDe(p)) return renombrarPaqueteDePieza(est, p, valor)
    const ref = limpiarTexto(valor).trim()
    const e = errorDeReferencia(doc, p.id, ref)
    if (e) return rechazo(e)
    if (ref === p.ref) return sinCambio()
    return { cmd: modificar('referencia', 'piezas', p, { ...p, ref }), creados: {}, avisos: [] }
  }

  if (prop === 'spice') {
    const familia = familiaSpice(def.modelo)
    if (!familia) return rechazo(`${p.ref} no tiene un modelo con parámetros de SPICE.`)
    const r = spiceDeTexto(valor, familia)
    if (!r.ok) return rechazo(r.error)
    if (JSON.stringify(r.spice) === JSON.stringify(spiceVigente(p))) return sinCambio()
    return { cmd: modificar('modelo propio', 'piezas', p, conSpice(p, r.spice)), creados: {}, avisos: [] }
  }

  if (prop === 'entradas' && def.entradas) {
    const n = Number(valor)
    if (!Number.isInteger(n) || n < 2 || n > def.entradas.max) return rechazo(`Las entradas van de 2 a ${def.entradas.max}.`)
    if (n === def.entradas.n) return sinCambio()
    if (paqueteDe(p)) {
      const r = cambiarEntradasDelPaquete(est, p, n, (d, id, k) => cambiarEntradas(d, lib, id, k))
      return 'error' in r ? rechazo(r.error) : { cmd: r.cmd, creados: {}, avisos: r.avisos }
    }
    const cmd = cambiarEntradas(doc, lib, p.id, n)
    return 'error' in cmd ? rechazo(cmd.error) : { cmd, creados: {}, avisos: [] }
  }

  if (prop === 'periodo' && def.modelo?.tipo === 'pulso') {
    const t = leerValor(valor)
    if (!t) return rechazo(`«${valor}» no es un valor válido.`)
    if (!(t.valor > 0)) return rechazo('El periodo debe ser un número mayor que cero.')
    return propiedadDePieza(est, p, def.modelo.frecuencia, textoDeNumero(1 / t.valor, 6))
  }

  // El voltaje de un terminal es el de su riel: cambiarlo cambia el de todos los terminales con su nombre.
  if (def.modelo?.tipo === 'alimentacion' && prop === CAMPO_VOLTAJE) {
    const c = cambioDeRiel(doc, nombreDeRiel(p, def), valor, est.gen)
    if (c === null) return sinCambio()
    return 'error' in c ? rechazo(c.error) : { cmd: c, creados: {}, avisos: [] }
  }

  const r = cambiarProp(p, def, prop, valor)
  if ('error' in r) return rechazo(r.error)
  const antes = p.props[prop] ?? def.props.find((d) => d.id === prop)?.defecto
  if (r.pieza.props[prop] === antes) return sinCambio()
  // La familia nueva de una pieza digital puede no admitir su alimentación: pasa a la más cercana en el mismo paso.
  const avisos: string[] = []
  const md = def.modelo
  const ajuste = esModeloDigital(md) && prop === md.familia ? alimentacionAlCambiarFamilia(p, def, md, r.pieza.props[prop]) : null
  if (ajuste && esModeloDigital(md)) {
    r.pieza = { ...r.pieza, props: { ...r.pieza.props, [md.alimentacion]: ajuste.alimentacion } }
    avisos.push(ajuste.aviso)
  }
  // Lo que comparten las unidades de un encapsulado cambia en todas, en el mismo paso.
  if (paqueteDe(p) && PROPS_COMPARTIDAS.some((k) => r.pieza.props[k] !== p.props[k])) {
    const c = cambiarCompartida(est, p, r.pieza, PROPS_COMPARTIDAS)
    return { cmd: c.cmd, creados: {}, avisos: [...avisos, ...c.avisos] }
  }
  return { cmd: modificar('valor', 'piezas', p, r.pieza), creados: {}, avisos }
}
