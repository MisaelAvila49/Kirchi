import type { Documento, TipoFigura } from '../doc/tipos'
import type { Herramienta } from '../editor/Editor'
import { tamañoSeleccion, type Seleccion } from '../editor/seleccion'
import type { FaseSim } from '../sim/control'
import type { Lectura } from '../sim/lectura'
import { formatearMedida } from '../valores/valores'

/** Primera tecla vigente de un comando del registro de atajos; undefined si el comando no tiene. */
export type TeclaDe = (id: string) => string | undefined

/** Las teclas de fábrica que nombra la pista (sin registro, como en las pruebas de la vista). */
const DE_FABRICA: Record<string, string> = { girar: 'R', 'girar-izq': 'Shift+R', 'espejo-x': 'X', 'espejo-y': 'Y', escape: 'Esc', 'invertir-l': '/', retroceso: 'Retroceso' }
const deFabrica: TeclaDe = (id) => DE_FABRICA[id]

/** «y» o «e» (ante un sonido de i: «X e Y»). */
const conjuncion = (siguiente: string) => (/^[IiYy](\+|$)/.test(siguiente) ? 'e' : 'y')

/** «R y Shift+R giran» con las teclas que haya: dos, una («R gira») o ninguna (null). */
function frase(teclas: (string | undefined)[], plural: string, singular: string): string | null {
  const t = teclas.filter((x): x is string => !!x)
  if (t.length === 0) return null
  if (t.length === 1) return `${t[0]} ${singular}`
  return `${t[0]} ${conjuncion(t[1])} ${t[1]} ${plural}`
}

/** Pista de la barra de estado mientras la vista previa está activa: tiempo simulado y ritmo. */
export function pistaDeSimulacion(fase: FaseSim, l: Lectura | null, voltajes?: { tecla: string | undefined; visibles: boolean }): string {
  if (fase === 'arrancando' || !l) return 'Arrancando la vista previa…'
  const t = `t = ${formatearMedida(l.t, 's')}`
  const v = voltajes?.tecla ? ` · ${voltajes.tecla} ${voltajes.visibles ? 'oculta' : 'muestra'} los voltajes` : ''
  if (fase === 'pausada') return `En pausa · ${t}${v}`
  // Por debajo de 100 % la cifra va en ámbar en la barra de estado (BarraEstado): aquí no se repite.
  const ritmo = Math.round(l.ratio * 100) >= 100 ? ' · al 100 % del tiempo real' : ''
  return `Simulando · ${t}${ritmo} · clic, Enter o Espacio en un interruptor, un botón o un fusible fundido para accionarlo${v}`
}

const juntar = (partes: (string | null)[]) => partes.filter((p): p is string => p !== null).join(' · ')

const QUE_SE_DIBUJA: Readonly<Record<TipoFigura, string>> = { linea: 'una línea', rectangulo: 'un rectángulo', elipse: 'una elipse', flecha: 'una flecha' }
const QUE_HACE_SHIFT: Readonly<Record<TipoFigura, string>> = {
  linea: 'Shift la endereza a 45°', flecha: 'Shift la endereza a 45°', rectangulo: 'Shift lo hace cuadrado', elipse: 'Shift la hace círculo'
}

/** Acción o pista en curso para la barra de estado, con las teclas vigentes del registro de atajos. */
export function pistaDeEstado(
  e: { herramienta: Herramienta; seleccion: Seleccion; doc: Documento; figuraPendiente?: TipoFigura | null },
  tecla: TeclaDe = deFabrica
): string {
  const cancela = frase([tecla('escape')], 'cancelan', 'cancela')
  if (e.herramienta === 'colocar') {
    const giran = frase([tecla('girar'), tecla('girar-izq')], 'giran', 'gira')
    const reflejan = frase([tecla('espejo-x'), tecla('espejo-y')], 'reflejan', 'refleja')
    return juntar(['Clic para colocar', 'Shift+clic para seguir', giran && reflejan ? `${giran}, ${reflejan}` : (giran ?? reflejan), cancela])
  }
  if (e.herramienta === 'cablear') return juntar(['Clic fija una esquina', frase([tecla('invertir-l')], '', 'invierte la L'), frase([tecla('retroceso')], '', 'quita la esquina'), cancela])
  if (e.herramienta === 'etiqueta') return 'Escribe el nombre de la red · Enter termina · Esc cancela'
  if (e.herramienta === 'nota') return 'Escribe la nota · Ctrl+Enter termina · Esc cancela'
  if (e.herramienta === 'figura') {
    const t = e.figuraPendiente ?? 'rectangulo'
    return juntar([`Arrastra para dibujar ${QUE_SE_DIBUJA[t]}`, QUE_HACE_SHIFT[t], cancela])
  }
  const s = e.seleccion
  const n = tamañoSeleccion(s)
  if (n === 0) return 'Doble clic para agregar una pieza, o arrástrala desde la Librería'
  if (n > 1) return `${n} elementos seleccionados · flechas para mover`
  const [p] = s.piezas
  if (p) return `${e.doc.piezas[p]?.ref ?? 'Pieza'} seleccionada · flechas para mover`
  if (s.cables.size) return 'Cable seleccionado · arrastra un tramo para moverlo'
  const [et] = s.etiquetas
  if (et) return `Etiqueta ${e.doc.etiquetas[et]?.nombre ?? ''} seleccionada · flechas para mover`
  if (s.figuras.size) return 'Figura seleccionada · arrastra un asa para cambiar su tamaño'
  const [so] = s.sondas
  if (so) return `${e.doc.sondas?.[so]?.ref ?? 'Sonda'} seleccionada · arrástrala por la red; Supr la quita`
  return 'Nota seleccionada · flechas para mover'
}
