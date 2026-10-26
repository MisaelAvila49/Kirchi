/** Graba la ventana o el lienzo: pide permiso (`pedir`), captura con `getDisplayMedia` (más micrófono si se eligió),
 * recorta al lienzo y graba con `MediaRecorder` (MP4 H.264 si el sistema lo permite, si no WebM VP9 o VP8; 30 fps).
 * Todo lo del navegador entra por `DepsGrabador` para probar con flujos falsos. */
import { createSignal } from 'solid-js'
import type { OpcionesGrabacion } from '../../../compartido/ajustes'
import type { ApiGrabacion, GrabacionGuardada } from '../../../compartido/grabacion'
import { crearRecorte, rectEnVideo, tamañoSalida, type LienzoLike, type Medidas, type Rect } from './recorte'
import { depsDelDocumento, instalarResalte } from './resalteClics'

export const FPS_GRABACION = 30
export const AVISO_MINIMIZADA = 'La grabación se pausó porque Kirchi se minimizó. Continúa desde el botón Grabar o la barra de estado.'

export type FaseGrabador = 'inactivo' | 'grabando' | 'pausada' | 'guardando'
export type ResultadoEmpezar = { ok: true } | { error: string }
export type ResultadoDetener = GrabacionGuardada | { error: string }

export interface PistaLike {
  stop(): void
  onended?: (() => void) | null
}
export interface FlujoLike {
  getVideoTracks(): PistaLike[]
  getAudioTracks(): PistaLike[]
  getTracks(): PistaLike[]
}
export interface VideoLike {
  ancho: number
  alto: number
  /** El elemento que se dibuja en el lienzo del recorte. */
  fuente: unknown
  quitar(): void
}
export interface GrabadoraLike {
  ondataavailable: ((e: { data: Blob }) => void) | null
  onstop: (() => void) | null
  onerror: ((e: unknown) => void) | null
  start(ms?: number): void
  pause(): void
  resume(): void
  stop(): void
}
export interface OpcionesGrabadora {
  mimeType: string
  videoBitsPerSecond: number
  audioBitsPerSecond?: number
}

export interface DepsGrabador {
  api(): ApiGrabacion | undefined
  getDisplayMedia(): Promise<FlujoLike>
  getUserMedia(c: { audio: { deviceId: { exact: string } } }): Promise<FlujoLike>
  abrirVideo(flujo: FlujoLike): Promise<VideoLike>
  /** Un flujo nuevo con la pista de video de `video` y, si hay, la de audio de `audio`. */
  combinar(video: FlujoLike, audio: FlujoLike | null): FlujoLike
  tipoSoportado(mime: string): boolean
  crearGrabadora(flujo: FlujoLike, o: OpcionesGrabadora): GrabadoraLike
  crearLienzo(ancho: number, alto: number): LienzoLike
  flujoDeLienzo(lienzo: LienzoLike, fps: number): FlujoLike
  cada(f: () => void, ms: number): unknown
  dejarDe(id: unknown): void
  medidas(video: VideoLike): Medidas
  ahora(): number
  /** Resaltar los clics: devuelve cómo apagarlo. `activo` dice si se está grabando. */
  resaltarClics(activo: () => boolean): () => void
}

export interface ContextoGrabacion {
  nombreCircuito: string
  /** Rectángulo del lienzo en píxeles de la página (`getBoundingClientRect`); null si no hay. */
  rectLienzo(): Rect | null
  /** Para el Registro: avisos que no son un error de empezar o detener. */
  alAviso?(mensaje: string): void
  /** Cuando termina una grabación, también si la detuvo la barra de estado o el menú de Grabar. */
  alTerminar?(r: ResultadoDetener): void
}

/** MP4 (H.264, AAC si hay voz) si el navegador lo soporta; si no WebM VP9 (Opus) y de faltar VP8. MP4 va primero porque
 * abre en cualquier reproductor sin convertir. */
export function elegirMime(soportado: (m: string) => boolean, conAudio: boolean): string {
  const mp4 = conAudio ? 'video/mp4;codecs=avc1.42E01E,mp4a.40.2' : 'video/mp4;codecs=avc1.42E01E'
  if (soportado(mp4)) return mp4
  if (conAudio) {
    if (soportado('video/webm;codecs=vp9,opus')) return 'video/webm;codecs=vp9,opus'
    return 'video/webm;codecs=vp8,opus'
  }
  return soportado('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm;codecs=vp8'
}

/** El contenedor que produce un tipo MIME de `elegirMime`. */
export const contenedorDe = (mime: string): 'mp4' | 'webm' => (mime.startsWith('video/mp4') ? 'mp4' : 'webm')

/** Tasa de bits según el tamaño: cerca de 0.1 bits por píxel y cuadro, entre 1 y 8 Mbit/s. */
export const bitrateVideo = (ancho: number, alto: number): number => Math.min(8_000_000, Math.max(1_000_000, Math.round(ancho * alto * FPS_GRABACION * 0.1)))

export interface Grabador {
  estado(): FaseGrabador
  /** Tiempo grabado hasta ahora, sin las pausas. */
  transcurridoMs(): number
  empezar(opciones: OpcionesGrabacion, contexto: ContextoGrabacion): Promise<ResultadoEmpezar>
  pausar(): void
  continuar(): void
  detener(): Promise<ResultadoDetener>
}

const mensajeDe = (e: unknown, base: string): string => (e instanceof Error && e.message ? e.message : base)

interface Sesion {
  ctx: ContextoGrabacion
  grabadora: GrabadoraLike
  pedazos: Blob[]
  fuentes: FlujoLike[]
  video: VideoLike
  mime: string
  parar: (() => void)[]
  acumulado: number
  desde: number
  enCurso: Promise<ResultadoDetener> | null
}

export function crearGrabador(dep: DepsGrabador = depsReales()): Grabador {
  const [fase, ponerFase] = createSignal<FaseGrabador>('inactivo')
  let s: Sesion | null = null

  const ms = (): number => (s ? s.acumulado + (fase() === 'grabando' ? dep.ahora() - s.desde : 0) : 0)

  function pausar(): void {
    if (!s || fase() !== 'grabando') return
    s.grabadora.pause()
    s.acumulado += dep.ahora() - s.desde
    ponerFase('pausada')
  }

  function continuar(): void {
    if (!s || fase() !== 'pausada') return
    s.grabadora.resume()
    s.desde = dep.ahora()
    ponerFase('grabando')
  }

  function limpiar(sesion: Sesion): void {
    sesion.parar.forEach((f) => f())
    sesion.fuentes.forEach((fl) => fl.getTracks().forEach((p) => p.stop()))
    sesion.video.quitar()
  }

  function detener(): Promise<ResultadoDetener> {
    if (!s) return Promise.resolve({ error: 'No hay una grabación en curso.' })
    const sesion = s
    if (sesion.enCurso) return sesion.enCurso
    if (fase() === 'grabando') sesion.acumulado += dep.ahora() - sesion.desde
    const duracionMs = Math.round(sesion.acumulado)
    ponerFase('guardando')
    sesion.enCurso = (async (): Promise<ResultadoDetener> => {
      await new Promise<void>((resolve) => {
        sesion.grabadora.onstop = () => resolve()
        try {
          sesion.grabadora.stop()
        } catch {
          resolve()
        }
      })
      limpiar(sesion)
      let r: ResultadoDetener
      try {
        const blob = new Blob(sesion.pedazos, { type: sesion.mime })
        if (blob.size === 0) r = { error: 'La grabación quedó vacía.' }
        else {
          const api = dep.api()
          if (!api) r = { error: 'La grabación no está disponible.' }
          else r = await api.guardar({ bytes: new Uint8Array(await blob.arrayBuffer()), duracionMs, nombreCircuito: sesion.ctx.nombreCircuito, contenedor: contenedorDe(sesion.mime) })
        }
      } catch (e) {
        r = { error: mensajeDe(e, 'No se pudo guardar la grabación.') }
      }
      s = null
      ponerFase('inactivo')
      sesion.ctx.alTerminar?.(r)
      return r
    })()
    return sesion.enCurso
  }

  async function empezar(opciones: OpcionesGrabacion, ctx: ContextoGrabacion): Promise<ResultadoEmpezar> {
    if (fase() !== 'inactivo') return { error: 'Ya hay una grabación en curso.' }
    const api = dep.api()
    if (!api) return { error: 'La grabación no está disponible.' }
    ponerFase('guardando')
    const abiertos: FlujoLike[] = []
    let video: VideoLike | null = null
    let recorte: { parar(): void } | null = null
    try {
      const pedido = await api.pedir(opciones)
      if (!pedido.ok) throw new Error(pedido.error)
      const pantalla = await dep.getDisplayMedia()
      abiertos.push(pantalla)
      let voz: FlujoLike | null = null
      if (opciones.microfono) {
        try {
          // `exact`: con un dispositivo ideal Chrome usa el micrófono predeterminado sin avisar si el guardado ya no está.
          voz = await dep.getUserMedia({ audio: { deviceId: { exact: opciones.microfono } } })
          abiertos.push(voz)
        } catch (e) {
          const nombre = (e as { name?: string } | null)?.name
          if (nombre !== 'OverconstrainedError' && nombre !== 'NotFoundError') throw new Error(mensajeDe(e, 'No se pudo abrir el micrófono.'))
          voz = null
          ctx.alAviso?.('El micrófono guardado no está conectado: se graba sin micrófono.')
        }
      }
      video = await dep.abrirVideo(pantalla)
      const completo: Rect = { x: 0, y: 0, ancho: video.ancho, alto: video.alto }
      const v = video
      let ultimo: Rect = completo
      const rectActual = (): Rect => {
        const r = opciones.que === 'lienzo' ? ctx.rectLienzo() : null
        if (r && r.ancho > 0 && r.alto > 0) ultimo = rectEnVideo(r, dep.medidas(v))
        return ultimo
      }
      const origen = rectActual()
      const salida = tamañoSalida(origen.ancho, origen.alto, opciones.calidad)
      let flujoVideo: FlujoLike = pantalla
      if (origen !== completo || salida.ancho !== video.ancho || salida.alto !== video.alto) {
        const r = crearRecorte<FlujoLike>({
          video: v.fuente,
          rect: rectActual,
          salida,
          fps: FPS_GRABACION,
          crearLienzo: dep.crearLienzo,
          cada: dep.cada,
          dejarDe: dep.dejarDe,
          flujo: dep.flujoDeLienzo
        })
        recorte = r
        flujoVideo = r.stream
      }
      const flujo = dep.combinar(flujoVideo, voz)
      const mime = elegirMime(dep.tipoSoportado, voz !== null)
      const grabadora = dep.crearGrabadora(flujo, {
        mimeType: mime,
        videoBitsPerSecond: bitrateVideo(salida.ancho, salida.alto),
        ...(voz ? { audioBitsPerSecond: 128_000 } : {})
      })
      const sesion: Sesion = { ctx, grabadora, pedazos: [], fuentes: [...abiertos, ...(flujoVideo !== pantalla ? [flujoVideo] : [])], video, mime, parar: [], acumulado: 0, desde: dep.ahora(), enCurso: null }
      if (recorte) sesion.parar.push(recorte.parar)
      grabadora.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) sesion.pedazos.push(e.data)
      }
      grabadora.onerror = () => {
        ctx.alAviso?.('La grabación se interrumpió por un error del navegador.')
        void detener()
      }
      // Si el sistema corta la captura (la ventana desapareció), se cierra la grabación con lo que haya.
      for (const p of pantalla.getVideoTracks()) {
        p.onended = () => {
          if (fase() === 'grabando' || fase() === 'pausada') {
            ctx.alAviso?.('El sistema detuvo la captura de la ventana. La grabación se guardó hasta ese momento.')
            void detener()
          }
        }
      }
      if (opciones.resaltarClics) sesion.parar.push(dep.resaltarClics(() => fase() === 'grabando'))
      // Minimizar pausa la grabación: nadie ve lo que pasa y el video quedaría con una ventana vacía.
      const alMin = api.alMinimizar?.((minimizada) => {
        if (minimizada && fase() === 'grabando') {
          pausar()
          ctx.alAviso?.(AVISO_MINIMIZADA)
        }
      })
      if (alMin) sesion.parar.push(alMin)
      s = sesion
      grabadora.start(1000)
      sesion.desde = dep.ahora()
      ponerFase('grabando')
        return { ok: true }
    } catch (e) {
      recorte?.parar()
      abiertos.forEach((f) => f.getTracks().forEach((p) => p.stop()))
      video?.quitar()
      s = null
      ponerFase('inactivo')
      return { error: mensajeDe(e, 'No se pudo empezar a grabar.') }
    }
  }

  return { estado: fase, transcurridoMs: ms, empezar, pausar, continuar, detener }
}

/** Las dependencias reales del navegador (solo se tocan al llamarlas, así el módulo se importa sin DOM). */
export function depsReales(): DepsGrabador {
  return {
    api: () => window.kirchi?.grabacion,
    getDisplayMedia: () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }) as unknown as Promise<FlujoLike>,
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c) as unknown as Promise<FlujoLike>,
    abrirVideo: (flujo) =>
      new Promise<VideoLike>((resolve, reject) => {
        const el = document.createElement('video')
        el.muted = true
        el.playsInline = true
        el.srcObject = flujo as unknown as MediaStream
        el.onloadedmetadata = () => {
          void el.play().then(
            () => resolve({ ancho: el.videoWidth, alto: el.videoHeight, fuente: el, quitar: () => (el.srcObject = null) }),
            reject
          )
        }
        el.onerror = () => reject(new Error('No se pudo leer el video capturado.'))
      }),
    combinar: (video, audio) => new MediaStream([...video.getVideoTracks(), ...(audio?.getAudioTracks() ?? [])] as unknown as MediaStreamTrack[]) as unknown as FlujoLike,
    tipoSoportado: (m) => MediaRecorder.isTypeSupported(m),
    crearGrabadora: (flujo, o) => new MediaRecorder(flujo as unknown as MediaStream, o) as unknown as GrabadoraLike,
    crearLienzo: (ancho, alto) => {
      const c = document.createElement('canvas')
      c.width = ancho
      c.height = alto
      return c as unknown as LienzoLike
    },
    flujoDeLienzo: (lienzo, fps) => (lienzo as unknown as HTMLCanvasElement).captureStream(fps) as unknown as FlujoLike,
    cada: (f, ms) => setInterval(f, ms),
    dejarDe: (id) => clearInterval(id as number),
    medidas: (v) => ({ videoAncho: v.ancho, videoAlto: v.alto, interiorAncho: window.innerWidth, interiorAlto: window.innerHeight, exteriorAncho: window.outerWidth, exteriorAlto: window.outerHeight }),
    ahora: () => performance.now(),
    resaltarClics: (activo) => instalarResalte(depsDelDocumento(document, activo))
  }
}
