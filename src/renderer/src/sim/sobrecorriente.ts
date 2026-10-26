import type { Id, Pieza } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { formatearMedida, formatearValor } from '../valores/valores'
import type { Lectura } from './lectura'

/** Sobrecorriente de un LED: con más corriente directa que la nominal de su `pieza.json` (`modelo.inom`, o la de su opción
 * en `modelo.por.valores`) el Registro lo dice una vez, sin detener la vista previa, y su medición lo marca. */

/** La corriente nominal de un LED (A), la de su opción si la trae; null si el modelo no tiene (un diodo rectificador). */
export function corrienteNominal(p: Pieza, def: PiezaDef): number | null {
  const m = def.modelo
  if (m?.tipo !== 'D') return null
  if (m.por) {
    const propDef = def.props.find((d) => d.id === m.por!.prop)
    const guardada = p.props[m.por.prop]
    const opcion = guardada !== undefined && (!propDef?.opciones || propDef.opciones.includes(guardada)) ? guardada : (propDef?.defecto ?? '')
    const propia = Object.hasOwn(m.por.valores, opcion) ? m.por.valores[opcion].inom : undefined
    if (propia !== undefined) return propia
  }
  return m.inom ?? null
}

/** Un 555 fuera de la alimentación de su hoja de datos (no se detiene: el macromodelo sigue simulando). */
export const mensajeDeAlimentacion555 = (ref: string, modelo: string, v: number, vmin: number, vmax: number): string =>
  `${ref} (${modelo}) tiene ${formatearValor(v, 'V')} de alimentación, fuera de los ${formatearValor(vmin, '')} a ${formatearValor(vmax, 'V')} que admite: la hoja de datos no garantiza cómo funciona.`

/** Lo que dura el arranque, en que la alimentación de un 555 todavía puede estar subiendo (no se revisa). */
const ARRANQUE_555 = 1e-3

export const mensajeDeSobrecorriente = (ref: string, i: number, inom: number): string =>
  `${ref} lleva ${formatearMedida(i, 'A')}, más de sus ${formatearValor(inom, 'A')} nominales: agrega una resistencia en serie.`

/** Cuenta qué LED pasó de su corriente nominal con las lecturas que ya hace la vista previa: avisa una vez por LED y vista
 * previa. Con una fuente de pulsos la corriente cruza la nominal en cada periodo y avisar en cada cruce llenaría el
 * Registro (el número cambia y no se juntarían como «×N»). El estado de inspector y Multímetro sí sigue cada lectura. */
export class VigiaDeSobrecorriente {
  private avisados = new Set<Id>()

  /** Los mensajes de los LED que acaban de pasar de su nominal (`ref` da la referencia de cada pieza). */
  revisar(l: Lectura, ref: (id: Id) => string | undefined): string[] {
    const nuevos: string[] = []
    for (const [id, m] of l.piezas) {
      const x = m.extra
      if (x?.tipo === '555') {
        const fuera = x.alimentacion < x.vmin - 1e-6 || x.alimentacion > x.vmax + 1e-6
        if (l.t >= ARRANQUE_555 && fuera && !this.avisados.has(id)) {
          this.avisados.add(id)
          nuevos.push(mensajeDeAlimentacion555(ref(id) ?? id, x.modelo, x.alimentacion, x.vmin, x.vmax))
        }
        continue
      }
      if (x?.tipo !== 'led') continue
      if (m.i <= x.inom || this.avisados.has(id)) continue
      this.avisados.add(id)
      nuevos.push(mensajeDeSobrecorriente(ref(id) ?? id, m.i, x.inom))
    }
    return nuevos
  }

  /** Al detener la vista previa: la próxima vuelve a avisar. */
  reiniciar(): void {
    this.avisados.clear()
  }
}
