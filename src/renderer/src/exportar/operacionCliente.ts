import type { CrudoOperacion } from './operacion'
import type { PedidoOperacion, RespuestaOperacion } from './operacion.worker'

/** Resuelve el punto de operación en un worker de un solo uso; al responder o cancelarse con `senal` se libera. */
export function medirOperacion(pedido: PedidoOperacion, senal?: AbortSignal): Promise<CrudoOperacion> {
  return new Promise((resolve, reject) => {
    if (senal?.aborted) return reject(new DOMException('Medición cancelada.', 'AbortError'))
    const w = new Worker(new URL('./operacion.worker.ts', import.meta.url), { type: 'module' })
    const cerrar = () => {
      senal?.removeEventListener('abort', cancelar)
      w.terminate()
    }
    const cancelar = () => {
      cerrar()
      reject(new DOMException('Medición cancelada.', 'AbortError'))
    }
    senal?.addEventListener('abort', cancelar)
    w.onmessage = (e: MessageEvent<RespuestaOperacion>) => {
      cerrar()
      if (!e.data.ok) return reject(new Error(e.data.error))
      resolve(e.data.crudo)
    }
    w.onerror = (e) => {
      cerrar()
      reject(new Error(e.message || 'No se pudo resolver el punto de operación.'))
    }
    w.postMessage(pedido)
  })
}
