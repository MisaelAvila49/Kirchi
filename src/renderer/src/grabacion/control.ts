/** Lo que la interfaz hace con el grabador: empezar con las opciones guardadas, detener y avisar al terminar. Todo lo
 * externo entra por `DepsControl`, y las pruebas usan un grabador falso. */
import { createSignal } from 'solid-js'
import type { OpcionesGrabacion } from '../../../compartido/ajustes'
import type { ApiGrabacion } from '../../../compartido/grabacion'
import type { Grabador, ResultadoDetener } from './grabador'
import type { Rect } from './recorte'
import { nombreDeArchivo, textoGuardada } from './textos'

export type AvisoGrabacion =
  | { tipo: 'guardada'; texto: string; ruta: string; nombre: string }
  | { tipo: 'error'; texto: string }

export interface DepsControl {
  grabador: Pick<Grabador, 'estado' | 'empezar' | 'detener' | 'pausar' | 'continuar'>
  api(): ApiGrabacion | undefined
  opciones(): OpcionesGrabacion
  /** El nombre del circuito abierto, sin extensión; vacío si no tiene. */
  nombreCircuito(): string
  rectLienzo(): Rect | null
  /** La carpeta elegida por el usuario, si hay. */
  carpeta(): string | undefined
  registrar(texto: string, tipo: 'aviso' | 'error'): void
}

export interface ControlGrabacion {
  aviso(): AvisoGrabacion | null
  cerrarAviso(): void
  empezar(opciones?: OpcionesGrabacion): Promise<boolean>
  detener(): Promise<void>
  /** Pausa si graba y continúa si está en pausa (el menú de Grabar y la barra de estado). */
  alternarPausa(): void
  /** Detiene si graba y si no empieza con las opciones guardadas (el atajo y Ctrl+K). */
  alternar(): Promise<void>
  abrirCarpeta(): Promise<void>
  cambiarNombre(): Promise<void>
}

export const AVISO_SIN_GRABACION = 'No hay una grabación en curso.'

const mensaje = (e: unknown, base: string): string => (e instanceof Error && e.message ? e.message : base)

export function crearControlGrabacion(d: DepsControl): ControlGrabacion {
  const [aviso, ponerAviso] = createSignal<AvisoGrabacion | null>(null)

  const error = (texto: string) => {
    d.registrar(texto, 'error')
    ponerAviso({ tipo: 'error', texto })
  }

  const terminar = (r: ResultadoDetener) => {
    if ('error' in r) return error(r.error)
    const texto = textoGuardada(d.carpeta())
    d.registrar(`${texto}: ${r.nombre}.`, 'aviso')
    ponerAviso({ tipo: 'guardada', texto, ruta: r.ruta, nombre: r.nombre })
  }

  async function empezar(opciones?: OpcionesGrabacion): Promise<boolean> {
    if (!d.api()) {
      error('La grabación solo funciona en la ventana de Kirchi.')
      return false
    }
    ponerAviso(null)
    const r = await d.grabador.empezar(opciones ?? d.opciones(), {
      nombreCircuito: d.nombreCircuito() || 'Kirchi',
      rectLienzo: d.rectLienzo,
      alAviso: (m) => d.registrar(m, 'aviso'),
      alTerminar: terminar
    })
    if ('error' in r) {
      error(r.error)
      return false
    }
    d.registrar('Empezó la grabación de pantalla.', 'aviso')
    return true
  }

  async function detener(): Promise<void> {
    const f = d.grabador.estado()
    if (f !== 'grabando' && f !== 'pausada') {
      d.registrar(AVISO_SIN_GRABACION, 'aviso')
      return
    }
    // El aviso de guardada o de error sale de `alTerminar`, que el grabador llama también cuando detiene la barra de estado o el menú.
    await d.grabador.detener()
  }

  function alternarPausa(): void {
    const f = d.grabador.estado()
    if (f === 'grabando') {
      d.grabador.pausar()
      d.registrar('Grabación en pausa.', 'aviso')
    } else if (f === 'pausada') {
      d.grabador.continuar()
      d.registrar('Grabación reanudada.', 'aviso')
    }
  }

  async function alternar(): Promise<void> {
    const f = d.grabador.estado()
    if (f === 'grabando' || f === 'pausada') return detener()
    if (f === 'inactivo') await empezar()
  }

  async function abrirCarpeta(): Promise<void> {
    try {
      await d.api()?.abrirCarpeta()
    } catch (e) {
      error(mensaje(e, 'No se pudo abrir la carpeta de grabaciones.'))
    }
  }

  async function cambiarNombre(): Promise<void> {
    const a = aviso()
    if (a?.tipo !== 'guardada') return
    try {
      const nueva = await d.api()?.renombrar(a.ruta)
      if (nueva) {
        const nombre = nombreDeArchivo(nueva)
        d.registrar(`La grabación se llama ahora ${nombre}.`, 'aviso')
        ponerAviso({ ...a, ruta: nueva, nombre })
      }
    } catch (e) {
      error(mensaje(e, 'No se pudo cambiar el nombre de la grabación.'))
    }
  }

  return { aviso, cerrarAviso: () => ponerAviso(null), empezar, detener, alternarPausa, alternar, abrirCarpeta, cambiarNombre }
}
