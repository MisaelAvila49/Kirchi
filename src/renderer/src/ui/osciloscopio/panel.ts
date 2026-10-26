import { anuncioDeDisparo } from '../../instrumentos/barrido'
import type { FaseSim } from '../../sim/control'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { formatearMedida } from '../../valores/valores'

/** La primera letra en minúscula (el resto se respeta: «Auto» no se vuelve «auto»). */
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

/** Lo que dice la pastilla de estado de la cabecera (con `role="status"`, se anuncia al cambiar). */
export function textoEstado(fase: FaseSim, capturada: boolean, p: Pick<PantallaSab, 'tCaptura' | 'estado'> | null, teclaSimular: string | undefined, pantallaEnPausa = false): string {
  // La pantalla congelada con la simulación en marcha: dice que lo que se ve ya no es en vivo.
  if (pantallaEnPausa && p) return `Pantalla en pausa · la simulación sigue · captura de t = ${formatearMedida(p.tCaptura, 's', 4)}`
  if (fase === 'corriendo' || fase === 'arrancando') return `En vivo · ${minuscula(p ? anuncioDeDisparo(p.estado) : 'Esperando disparo')}`
  const captura = p && (capturada || fase === 'pausada') ? ` · captura de t = ${formatearMedida(p.tCaptura, 's', 4)}` : null
  if (fase === 'pausada') return `En pausa${captura ?? ''}`
  if (captura) return `Detenida${captura}`
  return `Detenida: pulsa Simular${teclaSimular ? ` (${teclaSimular})` : ''} para ver la señal`
}

/** El estado del disparo junto al título «Disparo» de los mandos: el anuncio en vivo, «Detenido» en pausa o detenida. */
export function estadoDelDisparo(fase: FaseSim, p: Pick<PantallaSab, 'estado'> | null): string {
  if (fase !== 'corriendo' && fase !== 'arrancando') return 'Detenido'
  return p ? anuncioDeDisparo(p.estado) : 'Esperando disparo'
}

/** Lo que explica el eje del tiempo al pasar el ratón sobre su título: con disparo se cuenta desde él; sin disparo, es el tiempo de la simulación. */
export function ayudaEjeTiempo(p: Pick<PantallaSab, 'tDisparo'> | null): string {
  return p && !Number.isFinite(p.tDisparo)
    ? 'Sin disparo, el eje muestra el tiempo de la simulación y la traza corre.'
    : 'Con disparo, el tiempo se cuenta desde el disparo: la imagen queda quieta. Elige el modo Rodante para ver el tiempo de la simulación.'
}

/** «barrido en t = 3.214 s»: el instante de la simulación al que corresponde la pantalla en vivo, para ver que el tiempo avanza aunque la imagen quede quieta. */
export function textoBarrido(fase: FaseSim, p: Pick<PantallaSab, 'tCaptura'> | null): string | null {
  if ((fase !== 'corriendo' && fase !== 'arrancando') || !p || !Number.isFinite(p.tCaptura)) return null
  return `barrido en t = ${formatearMedida(p.tCaptura, 's', 4)}`
}
