/** Medidas y recorte de la grabación. El recorte pinta cada cuadro en un lienzo intermedio y lo graba con
 * `captureStream(30)`, así lo dibujado encima del lienzo (chips, medidores, confirmaciones) también entra al video. */
export interface Rect {
  x: number
  y: number
  ancho: number
  alto: number
}

export type Calidad = '720p' | '1080p' | 'real'

const LADO_CORTO: Record<Calidad, number> = { '720p': 720, '1080p': 1080, real: Infinity }

const parEnTero = (n: number): number => Math.max(2, Math.floor(n / 2) * 2)

/** Tamaño de salida de una calidad: baja el lado corto al de la calidad, nunca sube por encima del real y es par. */
export function tamañoSalida(ancho: number, alto: number, calidad: Calidad): { ancho: number; alto: number } {
  const corto = Math.min(ancho, alto)
  const k = Math.min(1, LADO_CORTO[calidad] / corto)
  if (k >= 1) return { ancho: parEnTero(ancho), alto: parEnTero(alto) }
  return { ancho: parEnTero(ancho * k), alto: parEnTero(alto * k) }
}

/** Lo que se sabe del cuadro capturado y de la ventana, para llevar un rectángulo de la página al cuadro. */
export interface Medidas {
  videoAncho: number
  videoAlto: number
  /** `innerWidth`/`innerHeight` de la página y `outerWidth`/`outerHeight` de la ventana. */
  interiorAncho: number
  interiorAlto: number
  exteriorAncho: number
  exteriorAlto: number
}

/** Pasa un rectángulo en píxeles de la página al cuadro de video. Si el cuadro trae el marco de la ventana (su proporción
 * casa mejor con la exterior), suma el borde lateral y la barra de título. */
export function rectEnVideo(r: Rect, m: Medidas): Rect {
  const errInt = Math.abs(m.videoAncho / m.interiorAncho - m.videoAlto / m.interiorAlto)
  const errExt = Math.abs(m.videoAncho / m.exteriorAncho - m.videoAlto / m.exteriorAlto)
  const conMarco = errExt + 1e-6 < errInt && m.exteriorAlto > m.interiorAlto
  let escala = m.videoAncho / m.interiorAncho
  let dx = 0
  let dy = 0
  if (conMarco) {
    escala = m.videoAncho / m.exteriorAncho
    dx = Math.max(0, (m.exteriorAncho - m.interiorAncho) / 2)
    dy = Math.max(0, m.exteriorAlto - m.interiorAlto - dx)
  }
  const x = Math.min(Math.max(0, Math.floor((dx + r.x) * escala)), m.videoAncho - 2)
  const y = Math.min(Math.max(0, Math.floor((dy + r.y) * escala)), m.videoAlto - 2)
  const ancho = Math.min(Math.ceil(r.ancho * escala), m.videoAncho - x)
  const alto = Math.min(Math.ceil(r.alto * escala), m.videoAlto - y)
  return { x, y, ancho: Math.max(2, ancho), alto: Math.max(2, alto) }
}

export interface ContextoLienzo {
  drawImage(fuente: unknown, sx: number, sy: number, sa: number, sh: number, dx: number, dy: number, da: number, dh: number): void
}
export interface LienzoLike {
  width: number
  height: number
  getContext(tipo: '2d'): ContextoLienzo | null
  captureStream(fps: number): { getVideoTracks(): unknown[] }
}

export interface OpcionesRecorte<S> {
  video: unknown
  /** Rectángulo a recortar, en píxeles del cuadro de video; se vuelve a pedir en cada cuadro (el lienzo puede cambiar de tamaño). */
  rect(): Rect
  /** Tamaño fijo de la salida: no cambia aunque el origen sí. */
  salida: { ancho: number; alto: number }
  fps: number
  crearLienzo(ancho: number, alto: number): LienzoLike
  cada(f: () => void, ms: number): unknown
  dejarDe(id: unknown): void
  /** Convierte el flujo del lienzo en el tipo de flujo que usa el grabador. */
  flujo(lienzo: LienzoLike, fps: number): S
}

export interface Recorte<S> {
  stream: S
  parar(): void
}

/** Pinta el rectángulo en un lienzo de tamaño fijo, `fps` veces por segundo, y entrega su flujo. */
export function crearRecorte<S>(o: OpcionesRecorte<S>): Recorte<S> {
  const lienzo = o.crearLienzo(o.salida.ancho, o.salida.alto)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('No se pudo preparar el recorte del video.')
  let ultimo = o.rect()
  const pintar = () => {
    try {
      ultimo = o.rect()
    } catch {
      // Se conserva el último rectángulo.
    }
    ctx.drawImage(o.video, ultimo.x, ultimo.y, ultimo.ancho, ultimo.alto, 0, 0, o.salida.ancho, o.salida.alto)
  }
  pintar()
  const id = o.cada(pintar, 1000 / o.fps)
  return {
    stream: o.flujo(lienzo, o.fps),
    parar: () => o.dejarDe(id)
  }
}
