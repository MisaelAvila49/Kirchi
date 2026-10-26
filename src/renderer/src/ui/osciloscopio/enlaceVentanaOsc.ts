import type { DatosOsc, ResultadoActualizarOsc } from '../../../../compartido/ventanaOsc'

/**
 * Enlace con la ventana del osciloscopio aparte. `abrir` crea y enfoca, `actualizar` solo mantiene al día y baja la bandera si ya no hay ventana. La pantalla viaja como copia, así que solo se manda si cambió su identidad y a lo más cada `MS_ENTRE_PANTALLAS`.
 */

type Mandar = {
  abrir(d: DatosOsc): Promise<boolean>
  actualizar(d: DatosOsc): Promise<ResultadoActualizarOsc>
}

/** Lo mínimo entre una pantalla y la siguiente: con la simulación a 60 cuadros por segundo la ventana recibe la mitad. */
export const MS_ENTRE_PANTALLAS = 33

/** Lo que se sabe de la pantalla y la congelada que se mandan, sin copiarlas: su identidad basta para saber si cambiaron. */
export interface IdentidadOsc {
  pantalla: unknown
  congelada: unknown
}

export interface EnlaceOsc {
  readonly abierta: boolean
  abrir(datos: DatosOsc, id: IdentidadOsc): Promise<boolean>
  actualizar(datos: DatosOsc, id: IdentidadOsc): Promise<boolean>
  /** La ventana ya no existe (la cerró el usuario o se acopló). */
  cerrada(): void
}

/** Lo que cambió respecto a lo último mandado, sin la pantalla ni la congelada: si es igual, no hace falta mandar nada. */
const sinPesadas = (d: DatosOsc): string => {
  const { pantalla: _p, congelada: _c, ...resto } = d
  return JSON.stringify(resto)
}

export function crearEnlaceOsc(api: Mandar, alCambiar?: (abierta: boolean) => void, alInvalido?: () => void, ahora: () => number = () => performance.now()): EnlaceOsc {
  let abierta = false
  let resto = ''
  let idEnviada: IdentidadOsc | null = null
  let tPantalla = -Infinity
  const poner = (v: boolean) => {
    if (v === abierta) return
    abierta = v
    alCambiar?.(v)
  }
  return {
    get abierta() {
      return abierta
    },
    async abrir(datos, id) {
      const r = await api.abrir(datos)
      resto = r ? sinPesadas(datos) : ''
      idEnviada = r ? id : null
      tPantalla = ahora()
      poner(r)
      return r
    },
    async actualizar(datos, id) {
      if (!abierta) return false
      const nuevaPantalla = !idEnviada || id.pantalla !== idEnviada.pantalla
      const nuevaCongelada = !idEnviada || id.congelada !== idEnviada.congelada
      const t = ahora()
      // La pantalla puede esperar al siguiente sondeo; una congelada nueva o un cambio de ajustes no.
      const pantallaYa = nuevaPantalla && t - tPantalla >= MS_ENTRE_PANTALLAS
      const r = sinPesadas(datos)
      if (!pantallaYa && !nuevaCongelada && r === resto) return false
      const { pantalla, congelada, ...base } = datos
      const envio: DatosOsc = { ...base, ...(pantallaYa ? { pantalla } : {}), ...(nuevaCongelada ? { congelada } : {}) }
      // Se marca antes de esperar: dos ejecuciones seguidas no mandan lo mismo dos veces.
      resto = r
      idEnviada = { pantalla: pantallaYa ? id.pantalla : (idEnviada?.pantalla ?? null), congelada: id.congelada }
      if (pantallaYa) tPantalla = t
      const ok = await api.actualizar(envio)
      if (ok === 'ok') return true
      // Sin ventana baja la bandera; con datos rechazados la ventana sigue viva: se reintenta con todo y se avisa.
      idEnviada = null
      resto = ''
      if (ok === 'sin-ventana') poner(false)
      else alInvalido?.()
      return false
    },
    cerrada() {
      idEnviada = null
      resto = ''
      poner(false)
    }
  }
}
