/** Órdenes que la interfaz puede pedir a su ventana (las del menú Ver, oculto en Windows y Linux). No importa nada. */
export type OrdenVentana = 'acercar' | 'alejar' | 'tamaño-real' | 'pantalla-completa'
export const ORDENES_VENTANA: readonly OrdenVentana[] = ['acercar', 'alejar', 'tamaño-real', 'pantalla-completa']
export const CANAL_ORDEN_VENTANA = 'ventana:orden'

export const esOrdenVentana = (v: unknown): v is OrdenVentana => typeof v === 'string' && (ORDENES_VENTANA as readonly string[]).includes(v)

export interface DefOrdenVentana {
  nombre: string
  /** Tecla que se muestra (en el menú de la cinta y en los globos). */
  tecla(mac: boolean): string
  /** Acelerador de Electron del menú Ver de la aplicación. */
  acelerador(mac: boolean): string
}

/** Nombres y teclas de las órdenes de la ventana. Acercar se muestra como Ctrl++ porque en un teclado en español el «+» es una tecla propia. */
export const ORDEN_VENTANA: Readonly<Record<OrdenVentana, DefOrdenVentana>> = {
  acercar: { nombre: 'Acercar la página', tecla: () => 'Ctrl++', acelerador: () => 'CommandOrControl+Plus' },
  alejar: { nombre: 'Alejar la página', tecla: () => 'Ctrl+-', acelerador: () => 'CommandOrControl+-' },
  'tamaño-real': { nombre: 'Tamaño real de la página', tecla: () => 'Ctrl+0', acelerador: () => 'CommandOrControl+0' },
  'pantalla-completa': { nombre: 'Pantalla completa', tecla: (mac) => (mac ? 'Ctrl+Cmd+F' : 'F11'), acelerador: (mac) => (mac ? 'Control+Command+F' : 'F11') }
}

/** Tamaño de la interfaz (zoom de la página, en por ciento): los pasos de Chromium entre 80 y 150 %, que recorren Configuración, Vista y Ctrl++, Ctrl+− y Ctrl+0. */
export const TAMAÑOS_INTERFAZ = [80, 90, 100, 110, 125, 150] as const
export type TamañoInterfaz = (typeof TAMAÑOS_INTERFAZ)[number]
export const TAMAÑO_INTERFAZ_NORMAL: TamañoInterfaz = 100
export const esTamañoInterfaz = (v: unknown): v is TamañoInterfaz => typeof v === 'number' && (TAMAÑOS_INTERFAZ as readonly number[]).includes(v)
/** Las órdenes que cambian el tamaño (todas menos la pantalla completa). */
export type OrdenTamaño = Exclude<OrdenVentana, 'pantalla-completa'>

/** El paso siguiente o el anterior (sin pasar de los topes), o 100 % con «tamaño real». */
export function tamañoTrasOrden(actual: TamañoInterfaz, orden: OrdenTamaño): TamañoInterfaz {
  if (orden === 'tamaño-real') return TAMAÑO_INTERFAZ_NORMAL
  const i = TAMAÑOS_INTERFAZ.indexOf(actual)
  const j = Math.min(TAMAÑOS_INTERFAZ.length - 1, Math.max(0, (i < 0 ? TAMAÑOS_INTERFAZ.indexOf(TAMAÑO_INTERFAZ_NORMAL) : i) + (orden === 'acercar' ? 1 : -1)))
  return TAMAÑOS_INTERFAZ[j]
}

/** Aceleradores ocultos del menú Vista: Ctrl+= acerca con teclado en inglés y el teclado numérico acerca, aleja y vuelve al 100 % (sus teclas son otras para Electron). */
export const ACELERADORES_OCULTOS: readonly (readonly [OrdenTamaño, string])[] = [
  ['acercar', 'CommandOrControl+='],
  ['acercar', 'CommandOrControl+numadd'],
  ['alejar', 'CommandOrControl+numsub'],
  ['tamaño-real', 'CommandOrControl+num0']
]

const ORDEN_NUMERICA: Readonly<Record<string, OrdenTamaño>> = { NumpadAdd: 'acercar', NumpadSubtract: 'alejar', Numpad0: 'tamaño-real' }

/** Orden del tamaño de la interfaz de Ctrl o Cmd con una tecla del teclado numérico, o null. La interfaz la atiende por si el acelerador del menú no llega. */
export function ordenDeTeclaNumerica(e: { code?: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): OrdenTamaño | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !e.code) return null
  return Object.hasOwn(ORDEN_NUMERICA, e.code) ? ORDEN_NUMERICA[e.code] : null
}

/** Canal con que el proceso principal le dice a cada interfaz el tamaño vigente (después de cada cambio). */
export const CANAL_TAMAÑO_INTERFAZ = 'ventana:tamaño'

/** Un rectángulo en píxeles de pantalla. */
export interface Rect {
  x: number
  y: number
  ancho: number
  alto: number
}

/** Cómo se cerró la ventana: rectángulo en modo ventana y si estaba maximizada o a pantalla completa. Solo lo anota el proceso principal. */
export interface EstadoVentana extends Rect {
  maximizada: boolean
  pantallaCompleta: boolean
}

export const TAMAÑO_VENTANA_NUEVA = { ancho: 1280, alto: 800 } as const
export const TAMAÑO_VENTANA_MINIMO = { ancho: 800, alto: 500 } as const
/** Lo que debe asomar de la ventana dentro de una pantalla para poder tomarla de la barra de título. */
const VISIBLE_MINIMO = { ancho: 120, alto: 60 } as const

const entero = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v) : null

/** Un estado de ventana válido a partir de cualquier valor (el JSON del disco), o null. */
export function estadoDeVentana(v: unknown): EstadoVentana | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const g = (k: string) => (Object.hasOwn(o, k) ? o[k] : undefined)
  const x = entero(g('x'), -100000, 100000)
  const y = entero(g('y'), -100000, 100000)
  const ancho = entero(g('ancho'), TAMAÑO_VENTANA_MINIMO.ancho, 100000)
  const alto = entero(g('alto'), TAMAÑO_VENTANA_MINIMO.alto, 100000)
  if (x === null || y === null || ancho === null || alto === null) return null
  return { x, y, ancho, alto, maximizada: g('maximizada') === true, pantallaCompleta: g('pantallaCompleta') === true }
}

const area = (a: Rect, b: Rect): number => Math.max(0, Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y))

/** Lo que se le da a `new BrowserWindow`: sin `x` ni `y` el sistema la centra en la pantalla principal. */
export interface PlanVentana extends Partial<Pick<Rect, 'x' | 'y'>> {
  ancho: number
  alto: number
  maximizada: boolean
  pantallaCompleta: boolean
}

/** Dónde abrir la ventana. Sin estado o con un rectángulo fuera de toda pantalla, tamaño de siempre centrado en la principal. Si toca alguna, se queda en la que más comparte y se desplaza hasta caber, de modo que asome la barra de título. */
export function planDeVentana(estado: EstadoVentana | null, pantallas: readonly Rect[]): PlanVentana {
  const nueva = { ...TAMAÑO_VENTANA_NUEVA }
  const principal = pantallas[0]
  const centrada = (): PlanVentana => {
    const ancho = principal ? Math.max(TAMAÑO_VENTANA_MINIMO.ancho, Math.min(nueva.ancho, principal.ancho)) : nueva.ancho
    const alto = principal ? Math.max(TAMAÑO_VENTANA_MINIMO.alto, Math.min(nueva.alto, principal.alto)) : nueva.alto
    return { ancho, alto, maximizada: false, pantallaCompleta: false }
  }
  if (!estado || !principal) return centrada()
  let mejor: Rect | null = null
  let mayor = 0
  for (const p of pantallas) {
    const a = area(estado, p)
    if (a > mayor) {
      mayor = a
      mejor = p
    }
  }
  if (!mejor || area(estado, mejor) < VISIBLE_MINIMO.ancho * VISIBLE_MINIMO.alto) return { ...centrada(), maximizada: estado.maximizada, pantallaCompleta: estado.pantallaCompleta }
  const ancho = Math.max(TAMAÑO_VENTANA_MINIMO.ancho, Math.min(estado.ancho, mejor.ancho))
  const alto = Math.max(TAMAÑO_VENTANA_MINIMO.alto, Math.min(estado.alto, mejor.alto))
  const x = Math.min(Math.max(estado.x, mejor.x), mejor.x + mejor.ancho - ancho)
  const y = Math.min(Math.max(estado.y, mejor.y), mejor.y + mejor.alto - alto)
  return { x, y, ancho, alto, maximizada: estado.maximizada, pantallaCompleta: estado.pantallaCompleta }
}
