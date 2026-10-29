/** Símbolos incrustados en ROOT.DSN: dan los pines de cada dispositivo y el punto donde se conecta cada estilo de pin. */

/** Celda de Proteus (100 milésimas) en unidades del archivo; el largo de pin por omisión si falta el marcador. */
const CELDA = 254000
const LARGO_POR_OMISION: Record<string, number> = { $PINDEFAULT: 2 * CELDA, $PINSHORT: CELDA }

export interface PinSimbolo {
  estilo: string
  x: number
  y: number
  /** Décimas de grado. */
  giro: number
  banderas: number
  nombre: string
  numero: string
}

/** Espejo primero (bit 1 en X, bit 2 en Y) y luego giro en décimas de grado, en múltiplos de 90°. */
export function transformar(x: number, y: number, giro: number, banderas: number): [number, number] {
  if (banderas & 1) x = -x
  if (banderas & 2) y = -y
  const a = (giro / 10) * (Math.PI / 180)
  const c = Math.round(Math.cos(a))
  const s = Math.round(Math.sin(a))
  return [c * x - s * y + 0, s * x + c * y + 0]
}

export class Simbolos {
  private readonly circuito: number
  private readonly cache = new Map<string, PinSimbolo[] | null>()
  private readonly nodos = new Map<string, [number, number]>()

  constructor(
    private readonly d: Uint8Array,
    private readonly s: string
  ) {
    const i = s.indexOf('ISIS CIRCUIT FILE')
    this.circuito = i < 0 ? s.length : i
  }

  /** Punto de conexión de un estilo de pin, relativo al pin (marcador `$MKRNODE` del símbolo de sistema). */
  nodoDePin(estilo: string): [number, number] {
    let n = this.nodos.get(estilo)
    if (!n) {
      const i = this.s.indexOf(String.fromCharCode(estilo.length) + estilo)
      const e = i < 0 ? -1 : this.s.indexOf('$MKRNODE\0', i)
      if (e >= 12) {
        const v = new DataView(this.d.buffer, this.d.byteOffset, this.d.byteLength)
        n = [v.getInt32(e - 12, true), v.getInt32(e - 8, true)]
      } else {
        n = [-(LARGO_POR_OMISION[estilo] ?? CELDA), 0]
      }
      this.nodos.set(estilo, n)
    }
    return n
  }

  /** Pines del símbolo de un dispositivo, en el orden en que el componente guarda sus cables, o null si no está incrustado. */
  pines(dispositivo: string): PinSimbolo[] | null {
    const guardado = this.cache.get(dispositivo)
    if (guardado !== undefined) return guardado
    const r = this.buscar(dispositivo)
    this.cache.set(dispositivo, r)
    return r
  }

  private buscar(dispositivo: string): PinSimbolo[] | null {
    const { s } = this
    const clave = String.fromCharCode(dispositivo.length) + dispositivo
    let inicio = -1
    // Las búsquedas se reusan mientras la coincidencia siga antes del mismo `{*DEVICE}`: el recorrido queda lineal.
    let eCache = -2
    let previo = -1
    let pinCache = -2
    for (let i = s.indexOf(clave); i >= 0 && i < this.circuito; i = s.indexOf(clave, i + 1)) {
      const desde = i + clave.length
      if (eCache === -2 || (eCache >= 0 && desde > eCache)) {
        eCache = s.indexOf('{*DEVICE}', desde)
        previo = eCache < 0 ? -1 : s.lastIndexOf('{*DEVICE}', eCache - 1)
      }
      const e = eCache
      if (e < 0) break
      if (pinCache !== -1 && pinCache < desde) pinCache = s.indexOf('$PIN', desde)
      // El símbolo es el bloque cuyo nombre precede a pines y a su `{*DEVICE}` sin otro `{*DEVICE}` en medio.
      if (pinCache >= 0 && pinCache + 4 <= e && previo < i) inicio = i
    }
    if (inicio < 0) return null
    const fin = s.indexOf('{*DEVICE}', inicio)
    const v = new DataView(this.d.buffer, this.d.byteOffset, this.d.byteLength)
    const pines: PinSimbolo[] = []
    const re = /\$PIN[A-Z]+\0/g
    const bloque = s.slice(inicio, fin)
    for (let m = re.exec(bloque); m; m = re.exec(bloque)) {
      const p = inicio + m.index
      if (p < 16) continue
      const q = inicio + m.index + m[0].length
      const e1 = s.indexOf('\0', q)
      const e2 = e1 < 0 ? -1 : s.indexOf('\0', e1 + 1)
      if (e2 < 0) break
      pines.push({
        estilo: m[0].slice(0, -1),
        x: v.getInt32(p - 12, true),
        y: v.getInt32(p - 8, true),
        giro: v.getInt16(p - 4, true),
        banderas: v.getInt16(p - 2, true),
        nombre: s.slice(q, e1),
        numero: s.slice(e1 + 1, e2)
      })
    }
    return pines
  }

  /** Posición absoluta del punto de conexión de cada pin de un componente. */
  posiciones(dispositivo: string, x: number, y: number, giro: number, banderas: number): { pin: PinSimbolo; x: number; y: number }[] | null {
    const lista = this.pines(dispositivo)
    if (!lista) return null
    return lista.map((pin) => {
      const [mx, my] = this.nodoDePin(pin.estilo)
      const [lx, ly] = transformar(mx, my, pin.giro, pin.banderas)
      const [gx, gy] = transformar(lx + pin.x, ly + pin.y, giro, banderas)
      return { pin, x: gx + x, y: gy + y }
    })
  }
}
