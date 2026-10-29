import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'

/** Lo que sirve `app://` al cargar una ventana pasa por búferes del proceso principal, que casi siempre está quieto y no los
 * recoge solo: unos 13 MB apartados mientras la aplicación siguiera abierta. */
let gc: (() => void) | null | undefined

/** Una recolección completa del proceso principal; no hace nada si V8 no la permite. */
export function recogerBasura(): void {
  if (gc === undefined) {
    try {
      setFlagsFromString('--expose-gc')
      gc = runInNewContext('gc') as () => void
    } catch {
      gc = null
    }
  }
  gc?.()
}

/** Tras cargar una ventana, una recolección cuando ya llegaron sus archivos (las tipografías llegan después del evento de carga). */
export function recogerTrasCargar(ms = 2000): void {
  setTimeout(recogerBasura, ms).unref?.()
}
