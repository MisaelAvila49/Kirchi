import { encuadrarConReservas, margenEncuadre, pan, screenToWorld, worldToScreen, zoomAt, type Bounds, type Camera } from '../canvas/camera'
import { crearContexto, ponerMezcla } from './contexto'
import { GridLayer } from '../canvas/grid'
import type { Punto } from '../doc/tipos'
import { esCampoDeTexto } from '../editor/teclado'
import { FpsMeter, type FrameStats } from '../perf/fps'
import type { Caja } from '../piezas/tipos'
import { muestraVacia, muestrear, type Animacion, type Efecto, type Muestra } from './animaciones'
import { ClicsDelLienzo, DetectorDobleClic } from './dobleClic'
import type { CapaSim } from './capaSim'
import { CapaFlechas } from './capaFlechas'
import { flechasVisibles, type FlechasSim } from './flechas'
import type { CapaMovimiento } from './movimiento'
import type { Escena } from './escena'
import type { Texto } from './etiquetas'
import { cajaConChips } from './ajusteChips'
import { PASO_ZOOM_ENCUADRE, ZOOM_ENCUADRE_MAX, ZOOM_INICIAL } from './medidas'
import type { Paleta } from './paleta'
import type { Superposicion } from './superposicion'
import { ajustarLienzoTexto, dibujarTextos, fuentesDeCss, textosVisibles, type Fuentes } from './texto'
import { CapaTrazos } from './trazos'
import { CapaTriangulos } from './triangulos'

export interface FuenteDeDibujo {
  escena(): Escena
  /** `anim`: estado de los efectos vivos en este cuadro (vacío si no hay ninguno); `escena`: la ya subida, con sus arcos de salto. */
  superposicion(anim: Muestra, escena: Escena | null): Superposicion
  /** Vista previa: cables por voltaje, LED encendidos y chips; null (o sin la función) mientras se edita. */
  simulacion?(escena: Escena | null): CapaSim | null
  /** Lo que se mueve en este cuadro (rotores y contactos), con el reloj de `performance.now()`; null o sin la función, nada. */
  /** `vista`: la parte del mundo que se ve (lo que queda fuera no se arma). */
  movimiento?(ahora: number, vista: { minX: number; minY: number; maxX: number; maxY: number }): CapaMovimiento | null
  /** Si algo visible se mueve en `ahora`: entonces el lienzo pide cuadros, a lo más 60 por segundo. */
  enMovimiento?(ahora: number): boolean
}

/** Los cuadros de las animaciones van a lo más a 60 por segundo aunque la pantalla vaya a 204 Hz. */
export const MS_POR_CUADRO_ANIMADO = 1000 / 60

/** Recibe los gestos del botón izquierdo en coordenadas de mundo; el paneo y el zoom se quedan en el lienzo. */
export interface Manejador {
  /** Devuelve true si la pulsación solo cerró algo abierto (el buscador): no cuenta como primer clic de un doble. */
  abajo(p: Punto, e: PointerEvent): boolean | void
  /** Botón derecho: solo cancela, nunca empieza un arrastre ni un rectángulo. */
  clicDerecho(p: Punto, e: PointerEvent): void
  /** Segunda pulsación derecha en 400 ms y a 4 px o menos de la primera (llega en lugar de clicDerecho). */
  dobleClicDerecho(p: Punto, e: PointerEvent): void
  mover(p: Punto, e: PointerEvent): void
  arriba(p: Punto, e: PointerEvent): void
  /** Segunda pulsación izquierda en 500 ms y a 4 px o menos de la primera, al soltarla (`ClicsDelLienzo`). */
  dobleClic(p: Punto, e: MouseEvent): void
  salir(): void
  /** Espacio mueve la vista con el arrastre; colocando, Espacio coloca y esto devuelve false. */
  espacioMueveLaVista?(): boolean
  /** La rueda sobre el lienzo: devuelve true si la atendió (entonces no hace zoom). */
  rueda?(p: Punto, e: WheelEvent): boolean
  /** El gesto del puntero se interrumpió (pointercancel, pérdida de captura o foco): el editor revierte lo que tenga a medias. */
  cancelar(): void
}

interface Capas {
  rejilla: GridLayer
  figTrazos: CapaTrazos
  figTriangulos: CapaTriangulos
  trazos: CapaTrazos
  triangulos: CapaTriangulos
  supTrazos: CapaTrazos
  supTriangulos: CapaTriangulos
  simTrazos: CapaTrazos
  simTriangulos: CapaTriangulos
  flechas: CapaFlechas
  movTrazos: CapaTrazos
  movTriangulos: CapaTriangulos
}

const VACIO = new Float32Array()

export class Lienzo {
  readonly gl: HTMLCanvasElement
  readonly txt: HTMLCanvasElement
  cam: Camera = { x: 0, y: 0, zoom: ZOOM_INICIAL }
  /** Tamaño de la vista en píxeles CSS. */
  ancho = 0
  alto = 0
  /** Cuadros dibujados desde el arranque (la prueba e2e comprueba que quieto no aumenta). */
  cuadros = 0
  private ctx: WebGL2RenderingContext
  private ctx2: CanvasRenderingContext2D
  private capas: Capas
  private escena: Escena | null = null
  private escenaSucia = true
  /** Al simular las figuras van a media opacidad: cambia qué capa de la escena se sube, sin rehacerla. */
  private atenuarFiguras = false
  private figurasSucias = true
  private supSucia = true
  private simSucia = true
  /** Chips de la última capa de simulación, que se dibujan con los textos de la escena. */
  private textosSim: Texto[] = []
  /** Las flechas de la última capa de la vista previa, cuánto costó armarla (ms) y el último cuadro animado. */
  private flechas: FlechasSim | null = null
  costoSim = 0
  private rafMov = 0
  private ultimoMov = -Infinity
  /** El lienzo de texto se redibuja solo si algo que no es movimiento cambió (un cuadro animado no toca los textos). */
  private textosSucios = true
  private conMovimiento = false
  /** La última superposición trae asas: su tamaño depende del zoom. */
  private supConAsas = false
  private raf = 0
  private perdido = false
  private midiendo = false
  private encuadrado = false
  private medidor = new FpsMeter()
  private fuentes: Fuentes
  private oyentesCamara = new Set<(c: Camera) => void>()
  private quitar: (() => void)[] = []
  private ro: ResizeObserver
  private animaciones: Animacion[] = []
  /** Rectángulos de la vista (px CSS) tapados por la interfaz, como el minimapa: encuadrar los deja libres. */
  reservas: () => Bounds[] = () => []
  /** Estado de los efectos en el último cuadro; vacío cuando no queda ninguno. */
  private muestra: Muestra = muestraVacia()
  /** Cursor del lienzo fuera del paneo (p. ej. `not-allowed` sobre un lugar ocupado). */
  private cursorBase = ''
  private ponerCursorCss: () => void = () => {}

  /** `sincronizado`: contexto sin `desynchronized` (por omisión, sin cuadro estirado al cambiar de tamaño) o el anterior
   * (`lienzo/contexto.ts`). Se elige al crear el lienzo: el ajuste rige al reabrir Kirchi. */
  constructor(contenedor: HTMLElement, private fuente: FuenteDeDibujo, private paleta: Paleta, private manejador: Manejador, opciones: { sincronizado?: boolean } = {}) {
    this.gl = document.createElement('canvas')
    this.gl.className = 'lienzo-gl'
    this.gl.tabIndex = 0
    this.gl.setAttribute('role', 'application')
    this.gl.setAttribute('aria-label', 'Lienzo del esquema: doble clic para agregar una pieza, rueda para zoom, Espacio y arrastre para mover la vista, F para encuadrar')
    this.txt = document.createElement('canvas')
    this.txt.className = 'lienzo-texto'
    this.txt.setAttribute('aria-hidden', 'true')
    contenedor.append(this.gl, this.txt)
    const ctx = crearContexto(this.gl, opciones.sincronizado ?? true)
    if (!ctx) throw new Error('WebGL2 no está disponible en este equipo')
    this.ctx = ctx
    this.ctx2 = this.txt.getContext('2d')!
    this.fuentes = fuentesDeCss()
    this.capas = this.crearCapas()
    this.ro = new ResizeObserver((e) => this.redimensionar(e[e.length - 1]))
    try {
      this.ro.observe(this.gl, { box: 'device-pixel-content-box' })
    } catch {
      this.ro.observe(this.gl)
    }
    this.escuchar()
    this.esperarFuentes()
  }

  /** Las fuentes incluidas llegan tras el primer cuadro (mientras tanto dibuja con las del sistema): se piden ya y al
   * terminar de cargar el texto se redibuja. */
  private esperarFuentes(): void {
    const fuentes = typeof document !== 'undefined' ? document.fonts : undefined
    if (!fuentes) return
    const listas = () => {
      this.fuentes = fuentesDeCss()
      this.invalidar()
    }
    fuentes.addEventListener('loadingdone', listas)
    this.quitar.push(() => fuentes.removeEventListener('loadingdone', listas))
    for (const f of [this.fuentes.interfaz, this.fuentes.cifras, this.fuentes.serif]) fuentes.load(`16px ${f}`).then(listas, () => {})
    // µ y Ω salen del subconjunto griego y del latino de Source Serif, que solo se cargan si se pide ese texto.
    for (const f of [this.fuentes.interfaz, this.fuentes.cifras]) fuentes.load(`16px ${f}`, 'µΩ').then(listas, () => {})
  }

  invalidar(): void {
    this.textosSucios = true
    if (!this.raf && !this.perdido) this.raf = requestAnimationFrame((t) => this.cuadro(t))
  }

  /** Un cuadro para lo que se mueve, a lo más cada `MS_POR_CUADRO_ANIMADO`. No rehace escena ni textos: sube la capa de
   * movimiento y cambia el tiempo de las flechas. */
  private pedirMovimiento(): void {
    if (this.rafMov || this.perdido) return
    this.rafMov = requestAnimationFrame((t) => {
      this.rafMov = 0
      if (this.raf) return
      if (t - this.ultimoMov < MS_POR_CUADRO_ANIMADO - 1) return this.pedirMovimiento()
      this.ultimoMov = t
      this.dibujar()
      this.seguirMoviendo()
    })
  }

  /** Si algo visible se mueve, pide el siguiente cuadro animado; si no, el lienzo se queda quieto. */
  private seguirMoviendo(): void {
    if (this.fuente.enMovimiento?.(performance.now()) || this.flechasCorren()) this.pedirMovimiento()
  }

  /** La parte del mundo que se ve. */
  private vista(): { minX: number; minY: number; maxX: number; maxY: number } {
    const z = this.cam.zoom
    return { minX: this.cam.x, minY: this.cam.y, maxX: this.cam.x + this.ancho / z, maxY: this.cam.y + this.alto / z }
  }

  /** Si alguna flecha avanza a la vista: las quietas (alterna, en pausa) o las que quedan fuera no piden cuadros. */
  private flechasCorren(): boolean {
    const f = this.flechas
    if (f === null || f.moviles === 0 || f.pausadas || !f.caja || !flechasVisibles(this.cam.zoom)) return false
    const v = this.vista()
    return !(f.caja.maxX < v.minX || f.caja.minX > v.maxX || f.caja.maxY < v.minY || f.caja.minY > v.maxY)
  }

  invalidarEscena(): void {
    this.escenaSucia = true
    this.supSucia = true
    // La capa de simulación usa los arcos de salto de la escena.
    this.simSucia = true
    this.invalidar()
  }

  /** La vista previa trae una lectura nueva (o terminó): solo se rehace su capa, no la escena. */
  /** Los chips de voltaje de la última capa de la vista previa (para agarrarlos con el ratón). */
  get chips(): readonly Texto[] {
    return this.textosSim
  }

  invalidarSimulacion(): void {
    this.simSucia = true
    this.invalidar()
  }

  invalidarSuperposicion(): void {
    this.supSucia = true
    this.invalidar()
  }

  /** Efecto breve en la superposición: mientras haya alguno vivo se redibuja cada cuadro; al terminar vuelve a dibujar
   * bajo demanda. Con prefers-reduced-motion: reduce es un resalte fijo. */
  animar(efecto: Efecto): void {
    const reducido = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    this.animaciones.push({ efecto, inicio: performance.now(), reducido })
    this.invalidarSuperposicion()
  }

  /** Textos de la escena ya construida (la sonda de pruebas los compara con lo que mide Canvas2D). */
  get textos(): Texto[] {
    return this.escena?.textos ?? []
  }

  /** Efectos vivos (la prueba e2e los cuenta). */
  get animando(): number {
    return this.animaciones.length
  }

  ponerCursor(c: string): void {
    if (c === this.cursorBase) return
    this.cursorBase = c
    this.ponerCursorCss()
  }

  ponerPaleta(p: Paleta): void {
    this.paleta = p
    this.invalidarEscena()
  }

  /** Figuras a media opacidad (vista previa) o normales: un solo cuadro nuevo, sin rehacer la escena. */
  ponerFigurasAtenuadas(si: boolean): void {
    if (si === this.atenuarFiguras) return
    this.atenuarFiguras = si
    this.figurasSucias = true
    this.invalidar()
  }

  /** Para la sonda de pruebas: las figuras se ven atenuadas. */
  get figurasAtenuadas(): boolean {
    return this.atenuarFiguras
  }

  medir(si: boolean): void {
    this.midiendo = si
    this.medidor = new FpsMeter()
    this.invalidar()
  }

  estadisticas(): FrameStats {
    return this.medidor.stats()
  }

  cajaEscena(): Caja | null {
    this.asegurarEscena()
    return this.escena?.caja ?? null
  }

  alCambiarCamara(fn: (c: Camera) => void): () => void {
    this.oyentesCamara.add(fn)
    return () => this.oyentesCamara.delete(fn)
  }

  ponerCamara(c: Camera): void {
    if (this.supConAsas && c.zoom !== this.cam.zoom) this.supSucia = true
    this.cam = c
    for (const fn of this.oyentesCamara) fn(c)
    this.invalidar()
  }

  encuadrar(): void {
    // El tamaño de este momento y no el del último aviso del ResizeObserver: F justo después de
    // Ctrl+\ o de plegar un panel encuadra en la vista nueva, no en la que había.
    const r = this.gl.getBoundingClientRect()
    const ancho = r.width || this.ancho, alto = r.height || this.alto
    if (ancho <= 0 || alto <= 0) return
    // Los textos ya van en la caja de la escena; los chips de voltaje que se ven en este momento también cuentan.
    this.asegurarEscena()
    if (!this.perdido) this.asegurarSim()
    const caja = cajaConChips(this.escena?.caja ?? null, this.textosSim)
    const margen = margenEncuadre(ancho, alto)
    this.ponerCamara(caja ? encuadrarConReservas(caja, ancho, alto, margen, this.reservas(), ZOOM_ENCUADRE_MAX, PASO_ZOOM_ENCUADRE) : { zoom: ZOOM_INICIAL, x: -ancho / 2 / ZOOM_INICIAL, y: -alto / 2 / ZOOM_INICIAL })
  }

  /** Encuadra una zona del mundo con el mismo zoom escalonado de Encuadrar (el tutorial lo usa para mostrar la zona de su capítulo). */
  encuadrarCaja(caja: Bounds): void {
    const r = this.gl.getBoundingClientRect()
    const ancho = r.width || this.ancho, alto = r.height || this.alto
    if (ancho <= 0 || alto <= 0) return
    this.ponerCamara(encuadrarConReservas(caja, ancho, alto, margenEncuadre(ancho, alto), this.reservas(), ZOOM_ENCUADRE_MAX, PASO_ZOOM_ENCUADRE))
  }

  /** Mueve la vista una fracción de su ancho y alto (positivo: hacia la derecha y abajo). */
  desplazarVista(fx: number, fy: number): void {
    this.ponerCamara(pan(this.cam, -fx * this.ancho, -fy * this.alto))
  }

  /** Zoom alrededor del centro de la vista (el botón de zoom de la barra lleva a 100 %). */
  ponerZoom(zoom: number): void {
    this.ponerCamara(zoomAt(this.cam, this.ancho / 2, this.alto / 2, zoom / this.cam.zoom))
  }

  centrarEn(p: Punto): void {
    const z = this.cam.zoom
    this.ponerCamara({ zoom: z, x: p.x - this.ancho / 2 / z, y: p.y - this.alto / 2 / z })
  }

  /** Coordenadas de ventana (clientX/Y) a mundo. */
  aMundo(clientX: number, clientY: number): Punto {
    const r = this.gl.getBoundingClientRect()
    return screenToWorld(this.cam, clientX - r.left, clientY - r.top)
  }

  /** Mundo a coordenadas de ventana, para colocar elementos DOM encima. */
  aPantalla(p: Punto): Punto {
    const r = this.gl.getBoundingClientRect()
    const s = worldToScreen(this.cam, p.x, p.y)
    return { x: s.x + r.left, y: s.y + r.top }
  }

  enfocar(): void {
    this.gl.focus({ preventScroll: true })
  }

  destruir(): void {
    // Sin contexto ya no se dibuja, aunque llegue tarde el aviso de las fuentes.
    this.perdido = true
    cancelAnimationFrame(this.raf)
    cancelAnimationFrame(this.rafMov)
    this.ro.disconnect()
    for (const f of this.quitar) f()
    this.ctx.getExtension('WEBGL_lose_context')?.loseContext()
    this.gl.remove()
    this.txt.remove()
  }

  private crearCapas(): Capas {
    const gl = this.ctx
    return {
      rejilla: new GridLayer(gl), figTrazos: new CapaTrazos(gl), figTriangulos: new CapaTriangulos(gl), trazos: new CapaTrazos(gl), triangulos: new CapaTriangulos(gl), supTrazos: new CapaTrazos(gl), supTriangulos: new CapaTriangulos(gl),
      simTrazos: new CapaTrazos(gl), simTriangulos: new CapaTriangulos(gl), flechas: new CapaFlechas(gl), movTrazos: new CapaTrazos(gl), movTriangulos: new CapaTriangulos(gl)
    }
  }

  private redimensionar(entry: ResizeObserverEntry): void {
    this.ancho = entry.contentRect.width
    this.alto = entry.contentRect.height
    const dp = entry.devicePixelContentBoxSize?.[0]
    const dpr = window.devicePixelRatio || 1
    const w = dp ? dp.inlineSize : Math.round(this.ancho * dpr)
    const h = dp ? dp.blockSize : Math.round(this.alto * dpr)
    // El lienzo de texto toma su tamaño al dibujar (1×1 mientras no haya textos visibles).
    this.gl.width = w
    this.gl.height = h
    if (!this.encuadrado && this.ancho > 0 && this.alto > 0) {
      this.encuadrado = true
      this.encuadrar()
    } else this.ponerCamara(this.cam)
    // Cambiar el tamaño de un canvas lo borra: se dibuja ya, sin esperar al siguiente cuadro, para no mostrar un fotograma negro.
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.textosSucios = true
    this.dibujar()
    // Con `desynchronized` el primer cuadro tras cambiar el tamaño puede presentarse viejo (se vio al
    // alternar Ctrl+\ y encuadrar enseguida): un cuadro más lo corrige. Solo ocurre al redimensionar.
    this.invalidar()
  }

  private asegurarEscena(): void {
    if (this.perdido) return
    if (this.escenaSucia) {
      this.escena = this.fuente.escena()
      this.capas.trazos.subir(this.escena.trazos, this.escena.nTrazos)
      this.capas.triangulos.subir(this.escena.triangulos, this.escena.nTriangulos)
      this.escenaSucia = false
      this.figurasSucias = true
    }
    if (this.figurasSucias && this.escena) {
      const f = this.atenuarFiguras ? this.escena.figurasAtenuadas : this.escena.figuras
      this.capas.figTrazos.subir(f.trazos, f.nTrazos)
      this.capas.figTriangulos.subir(f.triangulos, f.nTriangulos)
      this.figurasSucias = false
    }
  }

  /** La capa de la vista previa al día (sus chips de voltaje a la vista salen de aquí). */
  private asegurarSim(): void {
    if (!this.simSucia) return
    const t0 = performance.now()
    const s = this.fuente.simulacion?.(this.escena) ?? null
    this.costoSim = performance.now() - t0
    this.capas.simTrazos.subir(s?.trazos ?? new Float32Array(), s?.nTrazos ?? 0)
    this.capas.simTriangulos.subir(s?.triangulos ?? new Float32Array(), s?.nTriangulos ?? 0)
    this.textosSim = s?.textos ?? []
    // Las flechas de esta lectura; sus fases corren solas en el sombreador.
    this.flechas = s?.flechas ?? null
    this.capas.flechas.subir(this.flechas?.datos ?? new Float32Array(), this.flechas?.cuenta ?? 0)
    this.simSucia = false
  }

  private cuadro(t: number): void {
    this.raf = 0
    // Todo cuadro dibujado cuenta para el ritmo de lo que se mueve: los de las lecturas (30 por segundo) y los de movimiento
    // juntos no pasan de 60 por segundo (antes se sumaban: 76 por segundo con la pantalla a 204 Hz).
    this.ultimoMov = t
    if (this.midiendo) {
      this.medidor.frame(t)
      this.invalidar()
    }
    // Con efectos vivos la superposición cambia en cada cuadro; el cuadro en que muere el último la limpia.
    // Se muestrea aquí y no al dibujar para que los efectos terminen aunque el lienzo no se pueda dibujar.
    if (this.animaciones.length) {
      const m = muestrear(this.animaciones, performance.now())
      this.animaciones = m.vivas
      this.muestra = m.muestra
      this.supSucia = true
    }
    this.dibujar()
    if (this.animaciones.length) this.invalidar()
    else this.seguirMoviendo()
  }

  private dibujar(): void {
    const w = this.gl.width, h = this.gl.height
    if (this.perdido || w === 0 || h === 0 || this.alto === 0) return
    this.asegurarEscena()
    this.asegurarSim()
    if (this.supSucia) {
      const s = this.fuente.superposicion(this.muestra, this.escena)
      this.capas.supTrazos.subir(s.trazos, s.nTrazos)
      this.capas.supTriangulos.subir(s.triangulos, s.nTriangulos)
      this.supConAsas = !!s.conAsas
      this.supSucia = false
    }
    const gl = this.ctx
    const dpr = h / this.alto
    const fondo = this.paleta.lienzo
    gl.viewport(0, 0, w, h)
    gl.clearColor(fondo[0], fondo[1], fondo[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    ponerMezcla(gl)
    const c = this.capas
    c.rejilla.draw(this.cam, this.ancho, this.alto, dpr, this.paleta.rejillaMenor, this.paleta.rejillaMayor)
    // Las figuras van debajo de todo: sus rellenos y sus trazos antes que los del circuito.
    c.figTriangulos.dibujar(this.cam, w, h, dpr)
    c.figTrazos.dibujar(this.cam, w, h, dpr)
    c.triangulos.dibujar(this.cam, w, h, dpr)
    c.trazos.dibujar(this.cam, w, h, dpr)
    c.simTriangulos.dibujar(this.cam, w, h, dpr)
    c.simTrazos.dibujar(this.cam, w, h, dpr)
    // Lo que se mueve (rotores, armaduras) y las flechas de la corriente, debajo de la selección y de los textos.
    const ahora = performance.now()
    const mov = this.fuente.movimiento?.(ahora, this.vista()) ?? null
    // Sin nada que mover no se sube nada (la capa vacía no reserva memoria de video en cada cuadro).
    if (mov || this.conMovimiento) {
      c.movTrazos.subir(mov?.trazos ?? VACIO, mov?.nTrazos ?? 0)
      c.movTriangulos.subir(mov?.triangulos ?? VACIO, mov?.nTriangulos ?? 0)
      this.conMovimiento = mov !== null
    }
    c.movTriangulos.dibujar(this.cam, w, h, dpr)
    c.movTrazos.dibujar(this.cam, w, h, dpr)
    const f = this.flechas
    if (f && flechasVisibles(this.cam.zoom)) c.flechas.dibujar(this.cam, w, h, dpr, f.pausadas ? 0 : Math.max(0, (ahora - f.desde) / 1000), this.paleta.flechaCorriente)
    c.supTriangulos.dibujar(this.cam, w, h, dpr)
    c.supTrazos.dibujar(this.cam, w, h, dpr)
    if (this.textosSucios) {
      const todos = this.textosSim.length ? [...(this.escena?.textos ?? []), ...this.textosSim] : (this.escena?.textos ?? [])
      const textos = textosVisibles(todos, this.cam, this.ancho, this.alto)
      if (ajustarLienzoTexto(this.txt, textos.length > 0, w, h)) dibujarTextos(this.ctx2, textos, this.cam, dpr, this.paleta, this.fuentes)
      this.textosSucios = false
    }
    this.cuadros++
  }

  private escuchar(): void {
    const c = this.gl
    let espacio = false, paneando = false, ux = 0, uy = 0
    // Gesto del botón izquierdo en curso: lostpointercapture también llega tras un pointerup normal y ahí no se cancela nada.
    let gesto = false
    const doble = new DetectorDobleClic()
    // El doble clic izquierdo se cuenta aquí, no con `dblclick`. Desplazar la vista o el botón
    // derecho lo reinician: el doble clic que los sigue no abre el buscador.
    const clics = new ClicsDelLienzo()
    const derecho = (e: PointerEvent) => {
      clics.reiniciar()
      const p = this.aMundo(e.clientX, e.clientY)
      if (doble.pulsar(e.clientX, e.clientY, performance.now())) this.manejador.dobleClicDerecho(p, e)
      else this.manejador.clicDerecho(p, e)
    }
    const cursor = () => {
      c.style.cursor = paneando ? 'grabbing' : espacio ? 'grab' : this.cursorBase
    }
    this.ponerCursorCss = cursor
    const enLienzo = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      c.addEventListener(t, f, o)
      this.quitar.push(() => c.removeEventListener(t, f))
    }
    const enVentana = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, f)
      this.quitar.push(() => window.removeEventListener(t, f))
    }
    // Espacio es global salvo mientras se escribe en un campo.
    enVentana('keydown', (e) => {
      // Solo cuando el foco está en el lienzo o en el cuerpo: sobre un botón o enlace Espacio los activa.
      if (e.code !== 'Space' || esCampoDeTexto(e.target) || (e.target !== c && e.target !== document.body)) return
      if (this.manejador.espacioMueveLaVista?.() === false) return
      espacio = true
      cursor()
      e.preventDefault()
    })
    enVentana('keyup', (e) => {
      if (e.code !== 'Space') return
      espacio = false
      cursor()
    })
    enVentana('blur', () => {
      espacio = false
      paneando = false
      cursor()
      gesto = false
      clics.reiniciar()
      this.manejador.cancelar()
    })
    // Un clic, luego escribir en el inspector y volver a pulsar en el mismo lugar no es un doble clic: el lienzo perdió el
    // foco entre los dos (la e2e de la nota con su barra pulsaba a los 400 ms y abría el editor de la nota).
    enLienzo('blur', () => clics.reiniciar())
    enLienzo('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && espacio)) {
        clics.reiniciar()
        paneando = true
        ux = e.clientX
        uy = e.clientY
        c.setPointerCapture(e.pointerId)
        cursor()
        e.preventDefault()
        return
      }
      if (e.button === 2) {
        e.preventDefault()
        derecho(e)
        this.enfocar()
        return
      }
      if (e.button !== 0) return
      c.setPointerCapture(e.pointerId)
      gesto = true
      // Primero el manejador y luego el foco: si el clic cierra el buscador, el editor aún lo ve abierto y no edita nada.
      const consumida = this.manejador.abajo(this.aMundo(e.clientX, e.clientY), e) === true
      clics.abajo(e.clientX, e.clientY, performance.now(), consumida)
      this.enfocar()
    })
    enLienzo('pointermove', (e) => {
      // Un botón que se suma a otro ya apretado no da pointerdown sino pointermove con `button`: el derecho cancela igual.
      if (e.button === 2 && e.buttons & 2) {
        derecho(e)
        return
      }
      if (paneando) {
        this.ponerCamara(pan(this.cam, e.clientX - ux, e.clientY - uy))
        ux = e.clientX
        uy = e.clientY
        return
      }
      this.manejador.mover(this.aMundo(e.clientX, e.clientY), e)
    })
    const soltar = (e: PointerEvent) => {
      if (paneando) {
        paneando = false
        clics.reiniciar()
        cursor()
      } else if (gesto) {
        // pointerup llega solo al soltar el último botón: no se compara e.button.
        gesto = false
        const p = this.aMundo(e.clientX, e.clientY)
        this.manejador.arriba(p, e)
        if (clics.arriba(e.clientX, e.clientY, performance.now()) && !espacio) this.manejador.dobleClic(p, e)
      }
      if (c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId)
    }
    const cancelado = () => {
      paneando = false
      cursor()
      if (!gesto) return
      clics.reiniciar()
      gesto = false
      this.manejador.cancelar()
    }
    enLienzo('pointerup', soltar)
    enLienzo('pointercancel', cancelado)
    enLienzo('lostpointercapture', cancelado)
    enLienzo('pointerleave', () => this.manejador.salir())
    enLienzo(
      'wheel',
      (e) => {
        e.preventDefault()
        if (this.manejador.rueda?.(this.aMundo(e.clientX, e.clientY), e)) return
        const k = e.ctrlKey ? 0.01 : 0.0015
        const r = c.getBoundingClientRect()
        this.ponerCamara(zoomAt(this.cam, e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * k)))
      },
      { passive: false }
    )
    // Evita el autodesplazamiento de Windows con el botón medio y el menú contextual del navegador.
    enLienzo('mousedown', (e) => {
      if (e.button === 1) e.preventDefault()
    })
    // El botón derecho cancela (clicDerecho); el menú contextual propio llega en 1C.
    enLienzo('contextmenu', (e) => e.preventDefault())
    // Los eventos de contexto WebGL no están en HTMLElementEventMap: se registran con la firma genérica.
    const perdida = (e: Event) => {
      e.preventDefault()
      this.perdido = true
      cancelAnimationFrame(this.raf)
      this.raf = 0
      cancelAnimationFrame(this.rafMov)
      this.rafMov = 0
    }
    const recuperada = () => {
      this.perdido = false
      this.capas = this.crearCapas()
      this.simSucia = true
      this.invalidarEscena()
    }
    c.addEventListener('webglcontextlost', perdida)
    c.addEventListener('webglcontextrestored', recuperada)
    this.quitar.push(() => {
      c.removeEventListener('webglcontextlost', perdida)
      c.removeEventListener('webglcontextrestored', recuperada)
    })
  }
}
