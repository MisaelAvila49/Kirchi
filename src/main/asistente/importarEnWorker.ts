import type { PiezaDef } from '../../renderer/src/piezas/tipos'
import type { ResultadoImportar } from '../../renderer/src/importar/importar'

/** Lo mínimo de un `Worker` de `node:worker_threads` que necesita la importación (se sustituye en las pruebas). */
export interface TrabajadorImportar {
  postMessage(mensaje: unknown): void
  terminate(): unknown
  on(evento: 'message', f: (r: ResultadoImportar) => void): unknown
  on(evento: 'error', f: (e: Error) => void): unknown
  on(evento: 'exit', f: (codigo: number) => void): unknown
}

/** Tiempo que se espera una conversión antes de terminar el trabajador. */
export const LIMITE_IMPORTAR_MS = 30_000

/** Convierte fuera del hilo principal: un archivo hostil o enorme solo ocupa al trabajador, que se termina al vencer el tiempo. */
export function importarEnWorker(nombre: string, bytes: Uint8Array, lib: Map<string, PiezaDef>, crear: () => TrabajadorImportar, limiteMs = LIMITE_IMPORTAR_MS): Promise<ResultadoImportar> {
  return new Promise((resolver) => {
    let t: TrabajadorImportar | undefined
    let listo = false
    const terminar = (r: ResultadoImportar): void => {
      if (listo) return
      listo = true
      clearTimeout(reloj)
      void Promise.resolve(t?.terminate()).catch(() => undefined)
      resolver(r)
    }
    const reloj = setTimeout(() => terminar({ ok: false, motivo: `La conversión pasó de ${Math.round(limiteMs / 1000)} s y se canceló: el archivo es demasiado grande o complejo para importarlo.` }), limiteMs)
    try {
      t = crear()
      t.on('message', (r) => terminar(r))
      t.on('error', (e) => terminar({ ok: false, motivo: 'No se pudo convertir el archivo: puede estar dañado.', detalle: e.message }))
      t.on('exit', (c) => terminar({ ok: false, motivo: 'La conversión terminó antes de dar un resultado.', detalle: `código ${c}` }))
      t.postMessage({ nombre, bytes, lib: [...lib] })
    } catch (e) {
      terminar({ ok: false, motivo: 'No se pudo iniciar la conversión del archivo.', detalle: e instanceof Error ? e.message : String(e) })
    }
  })
}
