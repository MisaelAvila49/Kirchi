import type { ApiGraficas, DatosGraficas } from '../../../../compartido/graficas'

/**
 * Enlace con la ventana de gráficas aparte. Solo `abrir` crea y enfoca la ventana. `actualizar` no, y baja la bandera si el proceso principal dice que ya no hay ventana.
 */

type Mandar = Pick<ApiGraficas, 'abrir' | 'actualizar'>

/** Lo que identifica unos datos: las corridas por identidad de lo que dibujan, y el resto por valor. */
function mismosDatos(a: DatosGraficas, b: DatosGraficas): boolean {
  if (a.elegida !== b.elegida || a.tema !== b.tema || a.archivo !== b.archivo || a.corridas.length !== b.corridas.length) return false
  return a.corridas.every((c, i) => c.n === b.corridas[i].n && c.nombre === b.corridas[i].nombre && c.analisis === b.corridas[i].analisis && c.mapeado === b.corridas[i].mapeado)
}

export interface EnlaceVentana {
  readonly abierta: boolean
  /** Se pidió la ventana: se abre (o se enfoca si ya estaba) con estos datos. */
  abrir(datos: DatosGraficas): Promise<boolean>
  /** Mantener al día: nada si no hay ventana o si los datos son los mismos que ya tiene. Devuelve si mandó algo. */
  actualizar(datos: DatosGraficas): Promise<boolean>
}

export function crearEnlaceVentana(api: Mandar, alCambiar?: (abierta: boolean) => void): EnlaceVentana {
  let abierta = false
  let enviados: DatosGraficas | null = null
  const poner = (v: boolean) => {
    if (v === abierta) return
    abierta = v
    alCambiar?.(v)
  }
  return {
    get abierta() {
      return abierta
    },
    async abrir(datos) {
      const r = await api.abrir(datos)
      enviados = r ? datos : null
      poner(r)
      return r
    },
    async actualizar(datos) {
      if (!abierta || (enviados && mismosDatos(enviados, datos))) return false
      // Se marca antes de esperar: dos ejecuciones seguidas del efecto no mandan lo mismo dos veces.
      enviados = datos
      const r = await api.actualizar(datos)
      if (!r) {
        enviados = null
        poner(false)
      }
      return r
    }
  }
}
