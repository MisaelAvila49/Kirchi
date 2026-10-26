import type { Id } from '../doc/tipos'
import { MODOS_MULTIMETRO } from '../instrumentos/ajustes'
import type { LecturaOhmios } from '../instrumentos/ohmetro'
import { textoMultimetro } from '../instrumentos/multimetro'
import type { LecturaDeMultimetro } from './control'
import type { PedidoOhmios, RespuestaOhmios } from './ohmios.worker'

/** La lectura de un óhmetro con la simulación detenida, con la forma de las que da la vista previa. */
export function lecturaDeOhmios(l: LecturaOhmios, continuidad = false): LecturaDeMultimetro {
  const nombre = continuidad ? 'Continuidad' : 'Ω'
  const modo = MODOS_MULTIMETRO.indexOf(nombre)
  const base = { lecturas: 1, t: 0, ventana: 0, frecuencia: Number.NaN, rango: l.rango, estado: l.estado, modo, fundido: false, periodos: 0, valor: l.valor }
  return { ...base, texto: textoMultimetro(nombre, base) }
}

/** Mide los óhmetros con la simulación detenida en un worker de un solo uso (no hay vista previa): al responder o
 * cancelarse con `senal` se libera, para no dejar memoria del WASM ocupada mientras se edita. */
export function medirOhmiosDetenido(pedido: PedidoOhmios, senal?: AbortSignal): Promise<Map<Id, LecturaDeMultimetro>> {
  return new Promise((resolve, reject) => {
    if (senal?.aborted) return reject(new DOMException('Medición cancelada.', 'AbortError'))
    const w = new Worker(new URL('./ohmios.worker.ts', import.meta.url), { type: 'module' })
    const cerrar = () => {
      senal?.removeEventListener('abort', cancelar)
      w.terminate()
    }
    // Cancelar (el documento cambió o se empezó a simular) termina el worker sin esperar su respuesta.
    const cancelar = () => {
      cerrar()
      reject(new DOMException('Medición cancelada.', 'AbortError'))
    }
    senal?.addEventListener('abort', cancelar)
    w.onmessage = (e: MessageEvent<RespuestaOhmios>) => {
      cerrar()
      if (!e.data.ok) return reject(new Error(e.data.error))
      resolve(new Map(e.data.lecturas.map((l) => [l.id, lecturaDeOhmios(l, l.continuidad)])))
    }
    w.onerror = (e) => {
      cerrar()
      reject(new Error(e.message || 'El óhmetro no pudo medir.'))
    }
    w.postMessage(pedido)
  })
}
