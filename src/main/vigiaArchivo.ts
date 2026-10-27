import { statSync, unwatchFile, watchFile, type Stats } from 'node:fs'

/** Cada cuánto se mira el archivo abierto. Se consulta su fecha y tamaño (no un aviso del sistema), porque guardar de forma
 * atómica reemplaza el archivo y un aviso puesto sobre el anterior deja de llegar. */
export const INTERVALO_VIGIA_MS = 1000

type Huella = { mtimeMs: number; size: number } | null

const huellaDe = (s: Pick<Stats, 'mtimeMs' | 'size'> | null): Huella => (s && s.mtimeMs > 0 ? { mtimeMs: s.mtimeMs, size: s.size } : null)
const igual = (a: Huella, b: Huella) => (a === null ? b === null : b !== null && a.mtimeMs === b.mtimeMs && a.size === b.size)

function leerHuella(ruta: string): Huella {
  try {
    return huellaDe(statSync(ruta))
  } catch {
    return null
  }
}

/**
 * Vigila el archivo abierto en una ventana y avisa una vez por cada cambio en el disco que no hizo esta ventana (otro
 * programa, el asistente trabajando sin ventana). Lo que guarda la propia ventana se anota con `conocer` antes de que
 * el sondeo lo vea, así que no avisa de sí misma. Un archivo que desaparece no avisa: puede estar a medio reemplazarse.
 */
export class VigiaArchivo {
  private ruta: string | null = null
  private conocida: Huella = null
  private readonly oyente = (actual: Stats) => this.revisar(huellaDe(actual))

  constructor(
    private readonly alCambiar: (ruta: string) => void,
    private readonly intervalo = INTERVALO_VIGIA_MS
  ) {}

  get vigilada(): string | null {
    return this.ruta
  }

  /** Empieza a vigilar `ruta` (o nada, con null). Lo que hay ahora en el disco es lo conocido. */
  vigilar(ruta: string | null): void {
    if (ruta === this.ruta) return
    this.soltar()
    this.ruta = ruta
    if (!ruta) return
    this.conocida = leerHuella(ruta)
    watchFile(ruta, { interval: this.intervalo, persistent: false }, this.oyente)
  }

  /** Lo que hay ahora en el disco lo puso esta ventana (guardar, recargar): no es un cambio ajeno. */
  conocer(): void {
    if (this.ruta) this.conocida = leerHuella(this.ruta)
  }

  /** Revisa en el momento, sin esperar al sondeo. */
  revisarAhora(): void {
    if (this.ruta) this.revisar(leerHuella(this.ruta))
  }

  cerrar(): void {
    this.soltar()
    this.ruta = null
  }

  private revisar(actual: Huella): void {
    const ruta = this.ruta
    if (!ruta || actual === null || igual(actual, this.conocida)) return
    this.conocida = actual
    this.alCambiar(ruta)
  }

  private soltar(): void {
    if (this.ruta) unwatchFile(this.ruta, this.oyente)
    this.conocida = null
  }
}
