import type { Conexiones } from '../conexiones/conexiones'
import type { Cable, Documento, Pieza } from '../doc/tipos'
import { cajaEnMundo, pinesEnMundo, transformar } from '../piezas/transformar'
import type { AnimacionDef, Caja, PiezaDef } from '../piezas/tipos'
import { paraTexto, type ExtraMedicion, type Lectura, type LecturaDigital } from '../sim/lectura'
import { corrienteDelTramo, lecturaDeMedidor, tramoEn, type LecturaAc } from '../sim/medidor'
import { hayMedidores, medidoresDe } from '../doc/sondas'
import { dibujarPantallaDeMedidor, pantallaDeMedidor } from './medidores'
import { cajaTexto, valores } from './apartar'
import { EscritorTrazos, EscritorTriangulos } from './buffers'
import { resistenciaDeTermistor } from './ajusteEnPieza'
import { chipsDeVoltaje, FACTOR_ANILLO, TAM_CHIP, type OpcionesChips } from './chips'
import type { Bandera } from './sondas'
import type { Histeresis } from '../ui/histeresis'
import { formatearMedida, formatearValor } from '../valores/valores'
import { circulo, dibujarCable, geometriaOrientada } from './escena'
import type { Texto } from './etiquetas'
import { anchoTexto, ANCHO_CABLE, ANCHO_TRAZO, RADIO_UNION } from './medidas'
import { conAlfa, type Paleta, type RGBA, type Token } from './paleta'
import { porcentajesDePot } from './porcentajePot'
import { textosDeInstrumentos, type InstrumentosLienzo } from './instrumentosLienzo'
import { colorDeVoltaje } from './voltajes'
import { arcosDeZumbador, flechaDeSentido, marcasDeAvisos, textoRpm, textosJuntoAPiezas, type TextoJunto } from './avisosLienzo'
import { ALFA_RESPLANDOR, BRILLO_MINIMO, brilloDeLuz, colorDeFoco, FACTOR_RESPLANDOR, luzDeFoco, resplandor, type VigiaDeDestellos } from './luces'
import { RPM_MINIMA } from './movimiento'
import type { Id } from '../doc/tipos'
import type { FlechasSim } from './flechas'
import type { Aviso } from '../sim/avisos'

/** Lo que la vista previa dibuja encima de la escena: cables coloreados, brillo de los LED y chips de voltaje. */
export interface CapaSim {
  trazos: Float32Array
  nTrazos: number
  triangulos: Float32Array
  nTriangulos: number
  /** Chips de voltaje (se dibujan con los textos de la escena). */
  textos: Texto[]
  /** Las flechas de la corriente animada de esta lectura (las pone quien arma la capa, con sus fases). */
  flechas?: FlechasSim | null
}

/** Corriente nominal de un LED o de un segmento sin la suya en el modelo. */
export const CORRIENTE_BRILLO_PLENO = 0.02
/** Opacidad máxima del disco de luz sobre el cuerpo del LED: el símbolo se sigue leyendo debajo. */
export const ALFA_LUZ = 0.45
export { BRILLO_MINIMO }

/** Token de luz de cada color de LED; un color que no esté aquí brilla en rojo. */
export const TOKEN_DE_LED: Record<string, Token> = { rojo: 'ledRojo', verde: 'ledVerde', azul: 'ledAzul', amarillo: 'ledAmarillo', blanco: 'ledBlanco' }

/** 0 a 1: la raíz de la corriente media entre la nominal; en inversa, apagado. */
export const brilloDeLed = (i: number, inom = CORRIENTE_BRILLO_PLENO): number => brilloDeLuz(i, inom)

/** Lo que la capa de la vista previa necesita además de la lectura. */
export interface ExtraCapaSim {
  /** Regla de destellos (WCAG 2.3.1): recuerda el último segundo de cada luz con el reloj (ms) de la capa y el instante
   * simulado de la lectura, así la misma lectura dibujada en muchos cuadros cuenta una vez. */
  destellos?: { vigia: VigiaDeDestellos; ahora: number; muestra: number }
  /** Las piezas que dibujan algo propio en esta capa (`piezasDeCapaSim`), armada una vez por vista previa; sin ella, todas. */
  piezas?: readonly Pieza[]
  /** Las banderas de las sondas (de la escena): la de voltaje y la de corriente escriben su cifra junto a ellas. */
  banderas?: ReadonlyMap<Id, Bandera>
  /** La cifra de cada sonda de corriente con la histéresis de su última cifra (la media del intervalo baila un poco). */
  histeresis?: Histeresis
  /** El valor eficaz y la frecuencia en vivo de cada medidor AC (la ventana que le lleva el motor). */
  alternas?: ReadonlyMap<Id, LecturaAc>
}

/** Resistencia de cada termistor y fotorresistencia que lleva `vivo` en la escena: va pegada tras la parte fija del valor, con
 * la del motor (la temperatura con calentamiento propio, la resistencia de la fotorresistencia) o, sin lectura, la del documento. */
function resistenciasEnVivo(doc: Documento, lib: Map<string, PiezaDef>, textos: readonly Texto[], media: Lectura): Texto[] {
  const out: Texto[] = []
  for (const t of textos) {
    if (!t.vivo) continue
    const p = doc.piezas[t.vivo.id], def = p && lib.get(p.tipo), x = media.piezas.get(t.vivo.id)?.extra
    let texto = t.vivo.respaldo
    const m = def?.modelo
    if (p && def && m?.tipo === 'termistor' && x?.tipo === 'termistor') {
      const r = resistenciaDeTermistor(m, p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto ?? '', x.temperatura)
      if (r !== null) texto = formatearValor(r, 'Ω')
    } else if (x?.tipo === 'ldr') texto = formatearValor(x.r, 'Ω')
    out.push({ ...t, texto, x: t.x + anchoTexto(t.texto, t.tamaño), vivo: undefined })
  }
  return out
}

/** Lo que dice una sonda de corriente todavía sin el reparto por tramos (la primera lectura de la vista previa). */
export const ESPERANDO_CORRIENTE = '…'

/** Cifras de las sondas de voltaje (red de su punto, lectura estable) y de corriente (media del tramo, con signo de su
 * sentido), como chips a la derecha de su bandera. */
function textosDeSondas(doc: Documento, con: Conexiones, l: Lectura, banderas: ReadonlyMap<Id, Bandera>, h?: Histeresis): Texto[] {
  const out: Texto[] = []
  const estable = paraTexto(l)
  for (const b of banderas.values()) {
    const s = doc.sondas?.[b.sonda]
    if (!s || (s.tipo !== 'voltaje' && s.tipo !== 'corriente')) continue
    let texto: string | null = null
    if (s.tipo === 'voltaje') {
      const red = con.redDeSonda.get(s.id)
      const v = red === undefined ? undefined : estable.redes.get(red)
      if (v !== undefined) texto = formatearMedida(v, 'V')
    } else {
      const c = l.corrientes
      const k = c ? tramoEn(c, s.x, s.y) : -1
      if (!c) texto = ESPERANDO_CORRIENTE
      else if (k >= 0) {
        // La media va de su punto 0 al 1; el sentido de la sonda dice hacia dónde es positiva.
        const i = corrienteDelTramo(c, k, s.sentido === 'derecha' || s.sentido === 'abajo')
        texto = formatearMedida(h ? h.valor(s.id, i) : i, 'A')
      } else if (c.sinFlechas.has(con.redDeSonda.get(s.id) ?? -1)) texto = 'sin dato'
    }
    if (texto !== null) out.push({ texto, x: b.cifra.x, y: b.cifra.y, alinear: 'izq', tamaño: TAM_CHIP, color: 'trazo', fuente: 'cifras', chip: true })
  }
  return out
}

/** Una luz con la regla de destellos: el brillo que se dibuja y si conmuta (se dibuja quieta con la marca). */
const conDestellos = (extra: ExtraCapaSim, llave: string, b: number): { brillo: number; conmuta: boolean } => {
  const d = extra.destellos
  return d ? d.vigia.revisar(llave, b, d.ahora, d.muestra) : { brillo: b, conmuta: false }
}

/** Los modelos que no dibujan nada propio en la capa de la vista previa (sus cables y sus chips van aparte). */
const SIN_DIBUJO_PROPIO: ReadonlySet<string> = new Set(['R', 'C', 'L', 'V', 'I', 'pot', 'interruptor', 'senoidal', 'pulso', 'tierra', 'alimentacion', 'bjt', 'mosfet', 'ampop', 'comparador', 'compuesto', 'zener'])

/** Piezas con dibujo propio en la capa de la vista previa (luces, displays, motores, zumbadores, fusibles, marcas
 * digitales). Como el circuito no se edita corriendo, se arma una vez al arrancar y la capa recorre solo esa lista (con
 * miles de resistencias, ninguna). */
export function piezasDeCapaSim(doc: Documento, lib: Map<string, PiezaDef>): Pieza[] {
  return valores(doc.piezas).filter((p) => {
    const def = lib.get(p.tipo)
    return !!def?.modelo && (def.animacion !== undefined || !SIN_DIBUJO_PROPIO.has(def.modelo.tipo))
  })
}

const SIN_AVISOS: ReadonlyMap<Id, Aviso> = new Map()
const SIN_QUEMADAS: ReadonlySet<Id> = new Set()

/** Luz de un LED o foco: disco translúcido (el símbolo se sigue leyendo debajo), anillo y resplandor que se desvanece
 * hasta 1.6 veces su radio. Una luz que conmuta más rápido de lo que se ve sin destellar lleva el anillo en guiones
 * («conmuta»). */
function luzEnCaja(t: EscritorTrazos, tri: EscritorTriangulos, p: Pieza, def: PiezaDef, luz: RGBA, brillo: number, conmuta: boolean): void {
  const c = cajaEnMundo(p, def)
  luzEn(t, tri, (c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2, Math.max(c.maxX - c.minX, c.maxY - c.minY) / 2, luz, brillo, conmuta)
}

/** La misma luz en un punto y un radio dados (las de una caja y las sueltas de una pieza compuesta). */
function luzEn(t: EscritorTrazos, tri: EscritorTriangulos, cx: number, cy: number, r: number, luz: RGBA, brillo: number, conmuta: boolean): void {
  disco(tri, cx, cy, r, conAlfa(luz, ALFA_LUZ * brillo))
  resplandor(tri, cx, cy, r, r * FACTOR_RESPLANDOR, luz, ALFA_RESPLANDOR * brillo)
  const anillo = conAlfa(luz, 0.6 * brillo)
  circulo(conmuta ? new TrazosConPatron(t, GUION_X, HUECO_X, [anillo], ANCHO_TRAZO) : t, cx, cy, r * FACTOR_ANILLO, ANCHO_TRAZO, anillo, 24)
}

/** Radio (unidades de rejilla fina) de cada luz suelta de una pieza compuesta. */
export const RADIO_LUZ_SUELTA = 1.6

/** Las luces de una pieza compuesta con animación «luces»: cada una brilla con la corriente media de su diodo y la regla de
 * destellos, como un LED, en el punto de su símbolo ya girado y reflejado. */
function lucesSueltas(t: EscritorTrazos, tri: EscritorTriangulos, p: Pieza, a: Extract<AnimacionDef, { tipo: 'luces' }>, x: ExtraMedicion | undefined, paleta: Paleta, extra: ExtraCapaSim): void {
  if (x?.tipo !== 'compuesto') return
  a.luces.forEach((l, k) => {
    const { brillo, conmuta } = conDestellos(extra, `${p.id}#luz${k}`, brilloDeLed(x.corrientes[l.elemento] ?? 0))
    if (brillo < BRILLO_MINIMO) return
    const [dx, dy] = transformar(l.x, l.y, p.rot, p.espejo)
    luzEn(t, tri, p.x + dx, p.y + dy, RADIO_LUZ_SUELTA, paleta[Object.hasOwn(TOKEN_DE_LED, l.color) ? TOKEN_DE_LED[l.color] : 'ledRojo'], brillo, conmuta)
  })
}

/** Piezas de animación «brillo» (LED y display de 7 segmentos), con el color de la propiedad de su animación (rojo sin
 * ella). */
const colorDeLed = (p: Pieza, def: PiezaDef): string | null => {
  const a = def.animacion
  if (a?.tipo !== 'brillo') return null
  if (a.color === undefined) return 'rojo'
  const prop = def.props.find((d) => d.id === a.color && d.opciones)
  if (!prop) return 'rojo'
  // El color viene del documento (no confiable): solo vale si es una de las opciones de la pieza.
  const c = p.props[a.color]
  return c !== undefined && prop.opciones!.includes(c) ? c : prop.defecto
}

/** El anillo en guiones alrededor de una pieza que conmuta más rápido de lo que se ve sin destellar (el display). */
function anilloConmuta(t: EscritorTrazos, p: Pieza, def: PiezaDef, luz: RGBA): void {
  const c = cajaEnMundo(p, def)
  const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2
  const r = Math.max(c.maxX - c.minX, c.maxY - c.minY) / 2
  const anillo = conAlfa(luz, 0.6)
  circulo(new TrazosConPatron(t, GUION_X, HUECO_X, [anillo], ANCHO_TRAZO), cx, cy, r * FACTOR_ANILLO, ANCHO_TRAZO, anillo, 24)
}

/** Radio (unidades de rejilla fina) del corte que deja abierto un fusible fundido en el centro de su símbolo. */
export const RADIO_CORTE_FUSIBLE = 1.1

/** Fusible fundido: un disco del color del lienzo tapa el centro del símbolo y encima va el símbolo en rojo sin los tramos
 * que caen en el disco. Se ve abierto y en rojo. */
function fusibleFundido(t: EscritorTrazos, tri: EscritorTriangulos, p: Pieza, def: PiezaDef, paleta: Paleta): void {
  const c = cajaEnMundo(p, def)
  const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2
  disco(tri, cx, cy, RADIO_CORTE_FUSIBLE, paleta.lienzo)
  const rojo = paleta.invalido
  for (const l of geometriaOrientada(def, p.rot, p.espejo).trazos) {
    for (let i = 0; i + 3 < l.length; i += 2) {
      const [ax, ay, bx, by] = [p.x + l[i], p.y + l[i + 1], p.x + l[i + 2], p.y + l[i + 3]]
      if (Math.hypot((ax + bx) / 2 - cx, (ay + by) / 2 - cy) < RADIO_CORTE_FUSIBLE) continue
      t.segmento(ax, ay, bx, by, ANCHO_TRAZO, rojo)
    }
  }
}

/** Disco relleno como abanico de triángulos. */
function disco(tri: EscritorTriangulos, cx: number, cy: number, r: number, color: readonly [number, number, number, number], lados = 24): void {
  for (let k = 0; k < lados; k++) {
    const a = (2 * Math.PI * k) / lados, b = (2 * Math.PI * (k + 1)) / lados
    tri.triangulo(cx, cy, cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b), color)
  }
}

/** Formas de redes con nivel lógico: X en guiones, Z punteada, delgada y gris, y una red que conmuta más rápido de lo que
 * se ve, en tramos alternos de sus dos colores. Medidas en rejilla fina. */
export const GUION_X = 1.2
export const HUECO_X = 0.8
export const PUNTO_Z = 0.3
export const HUECO_Z = 0.6
export const FACTOR_ANCHO_Z = 0.6
export const TRAMO_CONMUTA = 1
/** Lado del cuadro que marca el nivel de cada pin de una pieza digital, y alto de la letra X o Z. */
export const LADO_MARCA = 1.2
export const TAM_MARCA = 1.4

/** Tope de guiones por tramo y por cuadro. Un `.kir` manipulado con un cable de 0 a 1e15 daría un guion cada 2 unidades y
 * colgaría el renderizador. Lo que pase el tope va liso en el primer color del patrón. */
export const MAX_PIEZAS_POR_TRAMO = 2000
export const MAX_PIEZAS_POR_CUADRO = 100_000

/** Cuántas piezas de patrón le quedan al cuadro (lo comparten todos los cables de una capa). */
export interface PresupuestoPatron {
  restantes: number
}

/** Reparte cada tramo en guiones de `largo` y huecos de `hueco` con patrón continuo entre tramos (arcos de salto
 * incluidos), alternando `colores`. Lleva lo que falta del guion o hueco en curso y no una fase acumulada: con coma
 * flotante un resto de 1e-16 deja de avanzarla y el ciclo no termina. */
export class TrazosConPatron extends EscritorTrazos {
  private enGuion = true
  private resto: number
  private guiones = 0
  constructor(
    private destino: EscritorTrazos,
    private largo: number,
    private hueco: number,
    private colores: readonly RGBA[],
    private ancho: number,
    private presupuesto: PresupuestoPatron = { restantes: MAX_PIEZAS_POR_CUADRO }
  ) {
    super()
    this.resto = largo
  }

  override segmento(x0: number, y0: number, x1: number, y1: number): void {
    const L = Math.hypot(x1 - x0, y1 - y0)
    if (!(L > 0)) return
    // Las piezas que daría este tramo (un guion y un hueco por periodo, más el que va a medias).
    const piezas = Math.ceil(L / Math.max(this.largo + this.hueco, 1e-6)) + 1
    if (!Number.isFinite(L) || piezas > MAX_PIEZAS_POR_TRAMO || piezas > this.presupuesto.restantes) {
      if (piezas > this.presupuesto.restantes) this.presupuesto.restantes = 0
      this.destino.segmento(x0, y0, x1, y1, this.ancho, this.colores[0])
      this.enGuion = true
      this.resto = this.largo
      return
    }
    this.presupuesto.restantes -= piezas
    let s = 0
    while (L - s > 1e-9) {
      const paso = Math.min(this.resto, L - s)
      if (this.enGuion) {
        const a = s / L, b = (s + paso) / L
        const color = this.colores[this.guiones % this.colores.length]
        this.destino.segmento(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b, this.ancho, color)
      }
      s += paso
      this.resto -= paso
      if (this.resto > 1e-9) continue
      if (this.enGuion) this.guiones++
      this.enGuion = !this.enGuion || this.hueco <= 0
      this.resto = this.enGuion ? this.largo : this.hueco
    }
  }
}

/** El color de una red con nivel lógico: el de su voltaje (medido o nominal); X a media escala; Z, el gris de los valores. */
export function colorDeNivel(d: LecturaDigital, v: number | undefined, vmax: number, p: Paleta): RGBA {
  if (v !== undefined) return colorDeVoltaje(v, vmax, p)
  if (d.nivel === 'Z') return p.valor
  if (d.nivel === 'X') return colorDeVoltaje((d.vcc ?? vmax) / 2, vmax, p)
  return colorDeVoltaje(d.nominal ?? 0, vmax, p)
}

/** Un cable de una red con nivel lógico: liso con su color, o con la forma de X, Z o de una red que conmuta. */
function cableDigital(t: EscritorTrazos, c: Cable, d: LecturaDigital, v: number | undefined, vmax: number, p: Paleta, presupuesto: PresupuestoPatron, saltos?: Map<string, number[]>): void {
  const patron = (largo: number, hueco: number, colores: RGBA[], ancho = ANCHO_CABLE) => {
    // Debajo, el color del lienzo tapa el cable de edición, que se vería en los huecos.
    dibujarCable(t, c, p.lienzo, saltos, ANCHO_CABLE)
    dibujarCable(new TrazosConPatron(t, largo, hueco, colores, ancho, presupuesto), c, colores[0], saltos, ancho)
  }
  if (d.conmuta && d.f > 0) patron(TRAMO_CONMUTA, 0, [colorDeVoltaje(0, vmax, p), colorDeVoltaje(d.vcc ?? vmax, vmax, p)])
  else if (v === undefined && d.nivel === 'X') patron(GUION_X, HUECO_X, [colorDeNivel(d, v, vmax, p)])
  else if (v === undefined && d.nivel === 'Z') patron(PUNTO_Z, HUECO_Z, [p.valor], ANCHO_CABLE * FACTOR_ANCHO_Z)
  else dibujarCable(t, c, colorDeNivel(d, v, vmax, p), saltos, ANCHO_CABLE)
}

/** Un cuadro relleno de trazos paralelos (los trazos tienen puntas redondas: las esquinas quedan apenas redondeadas). */
function cuadro(t: EscritorTrazos, cx: number, cy: number, lado: number, color: RGBA): void {
  const w = ANCHO_TRAZO, h = lado / 2
  const n = Math.max(2, Math.ceil(lado / w))
  for (let k = 0; k < n; k++) {
    const y = cy - h + w / 2 + (k * (lado - w)) / (n - 1)
    t.segmento(cx - h + w / 2, y, cx + h - w / 2, y, w, color)
  }
}

/** Marca del nivel de cada pin de una pieza digital: cuadro relleno en 1, vacío en 0, y la letra en X y Z sobre un cuadro
 * del color del lienzo. Va encima del cable que llega al pin. */
function marcasDePines(t: EscritorTrazos, p: Pieza, def: PiezaDef, x: Extract<ExtraMedicion, { tipo: 'digital' }>, paleta: Paleta, textos: Texto[]): void {
  const pos = new Map(pinesEnMundo(p, def).map((q) => [q.id, q]))
  const h = LADO_MARCA / 2
  for (const pin of x.pines) {
    const q = pos.get(pin.id)
    if (!q) continue
    if (pin.nivel === '1') {
      cuadro(t, q.x, q.y, LADO_MARCA, paleta.pieza)
      continue
    }
    cuadro(t, q.x, q.y, LADO_MARCA, paleta.lienzo)
    if (pin.nivel === '0') t.polilinea([q.x - h, q.y - h, q.x + h, q.y - h, q.x + h, q.y + h, q.x - h, q.y + h, q.x - h, q.y - h], ANCHO_TRAZO, paleta.pieza)
    else textos.push({ texto: pin.nivel, x: q.x, y: q.y, alinear: 'centro', tamaño: TAM_MARCA, color: 'pieza', fuente: 'cifras' })
  }
}

/** Los segmentos a a g del símbolo del display, en sus coordenadas (los de `simbolo.svg`), y el centro del punto. */
export const SEGMENTOS_DEL_SIMBOLO: readonly (readonly [number, number, number, number])[] = [
  [-0.9, -5.6, 1.9, -5.6],
  [2.3, -5.2, 2.3, -1.4],
  [2.3, -0.6, 2.3, 3.2],
  [-0.9, 3.6, 1.9, 3.6],
  [-1.3, -0.6, -1.3, 3.2],
  [-1.3, -5.2, -1.3, -1.4],
  [-0.9, -1, 1.9, -1]
]
export const PUNTO_DEL_SIMBOLO: readonly [number, number] = [3.1, 3.6]
/** Ancho del trazo de luz de un segmento encendido. */
export const ANCHO_SEGMENTO = 0.6

/** Cada segmento del display con su propia corriente media y la regla de brillo del LED, para que un display multiplexado
 * se vea quieto con cada dígito a su brillo medio. */
function segmentosEncendidos(t: EscritorTrazos, tri: EscritorTriangulos, p: Pieza, x: Extract<ExtraMedicion, { tipo: 'display' }>, luz: RGBA, inom: number, extra: ExtraCapaSim): boolean {
  let conmuta = false
  const mundo = (a: number, b: number): [number, number] => {
    const [u, w] = transformar(a, b, p.rot, p.espejo)
    return [p.x + u, p.y + w]
  }
  SEGMENTOS_DEL_SIMBOLO.forEach(([ax, ay, bx, by], k) => {
    const r = conDestellos(extra, `${p.id}#${k}`, brilloDeLed(x.corrientes[k] ?? 0, inom))
    const brillo = r.brillo
    conmuta ||= r.conmuta
    if (brillo < BRILLO_MINIMO) return
    const [x0, y0] = mundo(ax, ay), [x1, y1] = mundo(bx, by)
    t.segmento(x0, y0, x1, y1, ANCHO_SEGMENTO, conAlfa(luz, 0.35 + 0.65 * brillo))
  })
  const rp = conDestellos(extra, `${p.id}#7`, brilloDeLed(x.corrientes[7] ?? 0, inom))
  conmuta ||= rp.conmuta
  const punto = rp.brillo
  if (punto >= BRILLO_MINIMO) {
    const [cx, cy] = mundo(...PUNTO_DEL_SIMBOLO)
    disco(tri, cx, cy, ANCHO_SEGMENTO / 2 + 0.1, conAlfa(luz, 0.35 + 0.65 * punto))
  }
  return conmuta
}

/** Capa de la vista previa: cada cable y unión de una red simulada con el color de su voltaje (±`vmax`) y cada LED con un
 * disco según su corriente. `chips`: redes con chip y cuánto los movió el lector. Las redes lógicas (`l.digitales`) usan
 * voltaje nominal o la forma de X, Z o conmutación, con el nivel en cada pin. */
export function construirCapaSim(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, l: Lectura, vmax: number, paleta: Paleta, saltos?: Map<string, number[]>, chips: OpcionesChips | null = { redes: null }, textos: readonly Texto[] = [], instrumentos: InstrumentosLienzo | null = null, extra: ExtraCapaSim = {}): CapaSim {
  const t = new EscritorTrazos()
  const tri = new EscritorTriangulos()
  // La red de cada punto de cable solo sirve para colorear las uniones: sin uniones no se arma.
  const conUniones = con.uniones.length > 0
  const redDePunto = new Map<string, number>()
  const digitales = l.digitales
  const presupuesto: PresupuestoPatron = { restantes: MAX_PIEZAS_POR_CUADRO }
  for (const c of valores(doc.cables)) {
    const red = con.redDeCable.get(c.id)
    const v = red === undefined ? undefined : l.redes.get(red)
    const d = red === undefined ? undefined : digitales?.get(red)
    if (d && (v === undefined || d.conmuta)) {
      cableDigital(t, c, d, v, vmax, paleta, presupuesto, saltos)
      if (conUniones) for (const q of c.puntos) redDePunto.set(`${q.x},${q.y}`, red!)
      continue
    }
    if (v === undefined) continue
    dibujarCable(t, c, colorDeVoltaje(v, vmax, paleta), saltos, ANCHO_CABLE)
    if (conUniones) for (const q of c.puntos) redDePunto.set(`${q.x},${q.y}`, red!)
  }
  for (const u of con.uniones) {
    const red = redDePunto.get(`${u.x},${u.y}`)
    if (red === undefined) continue
    const d = digitales?.get(red)
    t.segmento(u.x, u.y, u.x, u.y, 2 * RADIO_UNION, d ? colorDeNivel(d, l.redes.get(red), vmax, paleta) : colorDeVoltaje(l.redes.get(red)!, vmax, paleta))
  }
  const marcas: Texto[] = []
  // Las luces y el motor siguen a la media del intervalo (la de las cifras); lo demás, al último paso.
  const media = paraTexto(l)
  const junto: TextoJunto[] = []
  // Los textos cerca de una pieza (su referencia, su valor): las marcas del motor y del zumbador van del lado que no los tapa.
  const cajasCerca = (p: Pieza, def: PiezaDef) => {
    const c = cajaEnMundo(p, def)
    const m = 8
    return textos.filter((x) => x.x > c.minX - m - 10 && x.x < c.maxX + m + 10 && x.y > c.minY - m && x.y < c.maxY + m).map((x) => cajaTexto(x, 0))
  }
  for (const p of extra.piezas ?? valores(doc.piezas)) {
    const def = lib.get(p.tipo)
    const x = l.piezas.get(p.id)?.extra
    const xm = media.piezas.get(p.id)?.extra
    if (def && x?.tipo === 'fusible' && x.fundido) fusibleFundido(t, tri, p, def, paleta)
    if (def && x?.tipo === 'digital') marcasDePines(t, p, def, x, paleta, marcas)
    if (def && x?.tipo === 'zumbador') {
      // Los arcos con la regla de destellos: un zumbador que suena y calla a 5 Hz los deja quietos.
      const a = conDestellos(extra, `${p.id}#arcos`, x.suena ? 1 : 0)
      if (a.conmuta ? a.brillo > 0.05 : x.suena) arcosDeZumbador(t, p, paleta, cajasCerca(p, def))
    }
    if (def && xm?.tipo === 'motor' && Math.abs(xm.rpm) >= RPM_MINIMA) {
      flechaDeSentido(t, p, xm.rpm > 0 ? 1 : -1, paleta, cajasCerca(p, def))
      junto.push({ pieza: p, texto: textoRpm(xm.rpm), color: 'valor' })
    }
    if (def && def.animacion?.tipo === 'filamento' && xm?.tipo === 'foco' && !xm.fundido) {
      const theta = xm.calentamiento ?? 0
      // El foco también con la regla de destellos (un pulso de 5 Hz lleva el filamento de tibio a pleno).
      const { brillo, conmuta } = conDestellos(extra, p.id, luzDeFoco(theta))
      if (brillo >= BRILLO_MINIMO * BRILLO_MINIMO) luzEnCaja(t, tri, p, def, colorDeFoco(theta, paleta), brillo, conmuta)
      continue
    }
    if (def?.animacion?.tipo === 'luces') {
      lucesSueltas(t, tri, p, def.animacion, xm, paleta, extra)
      continue
    }
    const color = def ? colorDeLed(p, def) : null
    const inom = def?.modelo?.tipo === 'display' ? (def.modelo.inom ?? CORRIENTE_BRILLO_PLENO) : CORRIENTE_BRILLO_PLENO
    if (def && color !== null && xm?.tipo === 'display') {
      const luz = paleta[Object.hasOwn(TOKEN_DE_LED, color) ? TOKEN_DE_LED[color] : 'ledRojo']
      if (segmentosEncendidos(t, tri, p, xm, luz, inom, extra)) anilloConmuta(t, p, def, luz)
      continue
    }
    const m = color === null ? undefined : media.piezas.get(p.id)
    if (!def || color === null || !m) continue
    const ex = m.extra?.tipo === 'led' ? m.extra.inom : CORRIENTE_BRILLO_PLENO
    const { brillo, conmuta } = conDestellos(extra, p.id, brilloDeLed(m.i, ex))
    if (brillo < BRILLO_MINIMO) continue
    luzEnCaja(t, tri, p, def, paleta[Object.hasOwn(TOKEN_DE_LED, color) ? TOKEN_DE_LED[color] : 'ledRojo'], brillo, conmuta)
  }
  // Los avisos de sobrecorriente y las piezas quemadas, con su cifra (o «quemado») junto a la pieza.
  const avisos = l.avisos ?? SIN_AVISOS, quemadas = l.quemadas ?? SIN_QUEMADAS
  if (avisos.size || quemadas.size) {
    marcasDeAvisos(t, tri, doc, lib, avisos, quemadas, paleta, marcas)
    for (const [id, a] of avisos) if (doc.piezas[id] && !quemadas.has(id)) junto.push({ pieza: doc.piezas[id], texto: a.texto, color: 'aviso' })
    for (const id of quemadas) if (doc.piezas[id]) junto.push({ pieza: doc.piezas[id], texto: 'quemado', color: 'invalido' })
  }
  // La cifra de los multímetros, la fuente variable y los canales del osciloscopio.
  if (instrumentos) marcas.push(...textosDeInstrumentos(t, doc, lib, paraTexto(l), instrumentos, paleta))
  const deSondas = extra.banderas?.size ? textosDeSondas(doc, con, l, extra.banderas, extra.histeresis) : []
  // Los chips esquivan lo que se mide: banderas y cifras de sondas, pantallas de medidores rápidos y cifras de instrumentos.
  const estorbos: Caja[] = []
  if (chips) {
    if (extra.banderas) for (const b of extra.banderas.values()) estorbos.push(b.caja)
    if (hayMedidores(doc)) for (const m of medidoresDe(doc)) estorbos.push(pantallaDeMedidor(m).caja)
    for (const x of marcas) estorbos.push(cajaTexto(x, 0))
    for (const x of deSondas) estorbos.push(cajaTexto(x, 0))
  }
  // Los chips son cifras: leen lo estable; los cables de arriba siguen al último paso.
  const delVoltaje = chips ? chipsDeVoltaje(doc, lib, con, paraTexto(l), textos, estorbos.length ? { ...chips, estorbos } : chips) : []
  // El porcentaje de cada potenciómetro simulado va junto a su cursor, esquivando lo demás (chips incluidos).
  const delPot = porcentajesDePot(doc, lib, new Set(l.piezas.keys()), textos, delVoltaje)
  // La resistencia en vivo de termistores y fotorresistencias, tras lo fijo de su ajuste (que la escena dejó con `vivo`).
  const deVivo = resistenciasEnVivo(doc, lib, textos, media)
  const deJunto = textosJuntoAPiezas(doc, lib, junto, textos, [...delVoltaje, ...delPot, ...deVivo])
  // Los medidores rápidos: la pantalla de siete segmentos con su lectura, encima de la que dejó la escena.
  const deMedidores: Texto[] = []
  if (hayMedidores(doc)) {
    for (const m of medidoresDe(doc)) {
      let lectura = lecturaDeMedidor(m, con, l, extra.alternas?.get(m.id))
      if (lectura.estado === 'ok' && extra.histeresis) lectura = { ...lectura, valor: extra.histeresis.valor(m.id, lectura.valor) }
      dibujarPantallaDeMedidor({ t, tri, textos: deMedidores }, m, paleta, lectura)
    }
  }
  const todos = delPot.length || marcas.length || deJunto.length || deVivo.length || deSondas.length || deMedidores.length ? [...marcas, ...delVoltaje, ...delPot, ...deVivo, ...deJunto, ...deSondas, ...deMedidores] : delVoltaje
  return { trazos: t.resultado(), nTrazos: t.cuenta, triangulos: tri.resultado(), nTriangulos: tri.cuenta, textos: todos }
}
