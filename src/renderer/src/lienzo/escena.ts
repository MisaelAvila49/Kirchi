import type { Conexiones } from '../conexiones/conexiones'
import { enOrden } from '../doc/figuras'
import { formatoCompleto } from '../doc/formato'
import type { Cable, Documento, Etiqueta, FormatoTexto, Fuente, Id, Nota, Pieza, Rotacion, Sonda } from '../doc/tipos'
import { cajaEnMundo, transformar } from '../piezas/transformar'
import type { Caja, Geometria, PiezaDef } from '../piezas/tipos'
import { EscritorTrazos, EscritorTriangulos } from './buffers'
import { etiquetasSinChoques, listasDe } from './apartar'
import { cajaFigura, dibujarFiguras, nuevoPresupuesto } from './figuras'
import { rotuloDePieza, rotulosDePieza, textosLocales, type Texto } from './etiquetas'
import { textosNumerosPatilla } from './numerosPatilla'
import { partesVivas } from './ajusteEnPieza'
import { haySondas, medidoresDe } from '../doc/sondas'
import { dibujarCuerpoDeMedidor, dibujarPantallaDeMedidor, pantallaDeMedidor } from './medidores'
import { banderasDeEntradas, banderasDelDocumento, rotulosDeEntradas, TAM_LETRA_BANDERA, TOKEN_DE_CANAL, type Bandera } from './sondas'
import {
  ANCHO_CABLE, ANCHO_TRAZO, anchoNombreEtiqueta, anchoTexto, anclaTextoEtiqueta, CAJA_DESCONOCIDA, cajaEtiqueta, cajaNota, desplazarCaja, disposicionNota,
  emDeTam, formaEtiqueta, RADIO_UNION, TAM_ETIQUETA
} from './medidas'
import { TOKEN_DE_TINTA, type Paleta, type RGBA, type Token } from './paleta'
import { colocarRenglon, normalizar } from './reparto'
import { claveTramo, cruces, tramoConSaltos } from './saltos'
import { claveDeEscena, geometriaDeEscena } from './capas'
import { dibujarContactos } from './contactos'
import { colorDeVoltaje, type VoltajesDeCables } from './voltajes'
import type { LecturaMedidor } from '../sim/medidor'
import { defDe } from '../piezas/sinEquivalencia'

/** Trazos y rellenos de las figuras de dibujo: una capa aparte que el lienzo pone debajo de todo lo demás. */
export interface CapaFiguras {
  trazos: Float32Array
  nTrazos: number
  triangulos: Float32Array
  nTriangulos: number
}

export interface Escena {
  trazos: Float32Array
  nTrazos: number
  triangulos: Float32Array
  nTriangulos: number
  textos: Texto[]
  /** Caja de todo lo dibujado, textos incluidos; null si no hay nada. */
  caja: Caja | null
  /** Arcos de salto por tramo horizontal («id#i»); la superposición los usa para resaltar el mismo dibujo. */
  saltos: Map<string, number[]>
  /** Las figuras de dibujo, del fondo al frente. */
  figuras: CapaFiguras
  /** Las mismas a media opacidad (al simular): se arman la primera vez que se piden y se guardan en la escena, así cambiar
   * entre una y otra no la rehace y editar sin simular no las paga. */
  readonly figurasAtenuadas: CapaFiguras
  /** Alguna figura se dibujó más simple de lo que pide su estilo: pasaron el presupuesto de la escena (`MAX_TRAMOS_FIGURAS`). */
  figurasSimplificadas: boolean
  /** La bandera de cada sonda (dónde quedó): la usan la capa de simulación (su cifra), el golpe y el resalte. */
  banderas: ReadonlyMap<Id, Bandera>
}

const SIN_BANDERAS: ReadonlyMap<Id, Bandera> = new Map()

/** El color de una sonda: el de texto de su canal, el ámbar del multímetro o la tinta de las piezas (voltaje y corriente). */
export function tokenDeSonda(s: Sonda): Token {
  if (s.tipo === 'osciloscopio') return TOKEN_DE_CANAL[s.entrada ?? ''] ?? 'pieza'
  return s.tipo === 'multimetro' ? 'aviso' : 'pieza'
}

/** Bandera de una sonda: tallo del punto a la bandera, punto en lo que mide, cuadro (relleno del canal en las de
 * instrumento, del lienzo con contorno en voltaje y corriente) y letra.
 * Una sonda que no mide nada lleva el tallo punteado y el cuadro vacío. La de corriente suma una flecha sobre su tramo. */
function dibujarBandera(t: EscritorTrazos, tri: EscritorTriangulos, b: Bandera, s: Sonda, anclada: boolean, paleta: Paleta, textos: Texto[]): void {
  const token = tokenDeSonda(s)
  const color = paleta[token]
  const rellena = anclada && (s.tipo === 'osciloscopio' || s.tipo === 'multimetro')
  const [a, z] = b.tallo
  if (anclada) t.segmento(a.x, a.y, z.x, z.y, ANCHO_TRAZO, color)
  else for (let k = 0; k < 4; k += 2) t.segmento(a.x + ((z.x - a.x) * k) / 4, a.y + ((z.y - a.y) * k) / 4, a.x + ((z.x - a.x) * (k + 1)) / 4, a.y + ((z.y - a.y) * (k + 1)) / 4, ANCHO_TRAZO, color)
  if (anclada) t.segmento(a.x, a.y, a.x, a.y, 0.9, color)
  const c = b.caja
  const fondo = rellena ? color : paleta.lienzo
  tri.triangulo(c.minX, c.minY, c.maxX, c.minY, c.maxX, c.maxY, fondo)
  tri.triangulo(c.minX, c.minY, c.maxX, c.maxY, c.minX, c.maxY, fondo)
  rectangulo(t, c, ANCHO_TRAZO, color)
  textos.push({ texto: b.letra, x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2, alinear: 'centro', tamaño: TAM_LETRA_BANDERA, color: rellena ? 'lienzo' : token, fuente: 'cifras', negrita: true })
  if (s.tipo === 'corriente') {
    const d = s.sentido === 'izquierda' ? [-1, 0] : s.sentido === 'abajo' ? [0, 1] : s.sentido === 'arriba' ? [0, -1] : [1, 0]
    const [px, py] = [-d[1], d[0]]
    tri.triangulo(s.x + d[0] * 1.1, s.y + d[1] * 1.1, s.x - d[0] * 0.5 + px * 0.7, s.y - d[1] * 0.5 + py * 0.7, s.x - d[0] * 0.5 - px * 0.7, s.y - d[1] * 0.5 - py * 0.7, color)
  }
}

/** Radio del punto de conexión de una etiqueta de red, en unidades. */
export const RADIO_PUNTO_ETIQUETA = 0.55

/** Color del contorno de un texto: el de siempre sin el campo, ninguno con «ninguno», o el de la tinta elegida. */
export function colorContorno(f: FormatoTexto | undefined, paleta: Paleta, porOmision: RGBA): RGBA | null {
  const c = f?.contorno
  if (c === undefined) return porOmision
  return c === 'ninguno' ? null : paleta[TOKEN_DE_TINTA[c]]
}

export function rectangulo(t: EscritorTrazos, c: Caja, ancho: number, color: RGBA): void {
  t.segmento(c.minX, c.minY, c.maxX, c.minY, ancho, color)
  t.segmento(c.maxX, c.minY, c.maxX, c.maxY, ancho, color)
  t.segmento(c.maxX, c.maxY, c.minX, c.maxY, ancho, color)
  t.segmento(c.minX, c.maxY, c.minX, c.minY, ancho, color)
}

export function circulo(t: EscritorTrazos, cx: number, cy: number, r: number, ancho: number, color: RGBA, lados = 16): void {
  for (let k = 0; k < lados; k++) {
    const a = (2 * Math.PI * k) / lados, b = (2 * Math.PI * (k + 1)) / lados
    t.segmento(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b), ancho, color)
  }
}

/** Trazos y rellenos de un símbolo ya reflejados y girados (sin trasladar), como `transformar` los da punto por punto. */
interface GeometriaOrientada {
  trazos: Float64Array[]
  rellenos: Float64Array
}

/** Por definición, su geometría en cada una de las ocho orientaciones (cuatro giros, con y sin espejo), hecha al pedirla. */
const orientadas = new WeakMap<PiezaDef, (GeometriaOrientada | undefined)[]>()

/** Cada par (x, y) de `pts` girado y reflejado; un número suelto al final queda fuera, como en el dibujo. */
export function orientar(pts: ArrayLike<number>, rot: Rotacion, espejo: boolean): Float64Array {
  const out = new Float64Array(pts.length - (pts.length % 2))
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const [x, y] = transformar(pts[i], pts[i + 1], rot, espejo)
    out[i] = x
    out[i + 1] = y
  }
  return out
}

/** Geometría de `def` en la orientación de la pieza. Se gira una vez por tipo y orientación y no por pieza y cuadro. El
 * número sigue al `switch` de `transformar` (todo giro que no sea 0, 90 o 180 es 270). */
export function geometriaOrientada(def: PiezaDef, rot: Rotacion, espejo: boolean, accionada = false): GeometriaOrientada {
  let lista = orientadas.get(def)
  if (!lista) orientadas.set(def, (lista = []))
  const base = accionada && def.geometriaAccionada ? def.geometriaAccionada : def.geometria
  const i = (rot === 0 ? 0 : rot === 90 ? 1 : rot === 180 ? 2 : 3) + (espejo ? 4 : 0) + (base === def.geometria ? 0 : 8)
  let g = lista[i]
  if (!g) lista[i] = g = { trazos: base.trazos.map((l) => orientar(l, rot, espejo)), rellenos: orientar(base.rellenos, rot, espejo) }
  return g
}

/** La geometría de la variante de la pieza (la forma de la onda del generador) según su propiedad; undefined sin variantes. */
export function geometriaDeVariante(def: PiezaDef, p: Pieza): Geometria | undefined {
  const v = def.variantes
  if (!v) return undefined
  const guardada = p.props[v.prop]
  const omision = def.props.find((d) => d.id === v.prop)?.defecto ?? ''
  return (guardada !== undefined && Object.hasOwn(v.geometrias, guardada) ? v.geometrias[guardada] : v.geometrias[omision]) ?? undefined
}

const variantesOrientadas = new WeakMap<Geometria, GeometriaOrientada[]>()
function varianteOrientada(g: Geometria, rot: Rotacion, espejo: boolean): GeometriaOrientada {
  let lista = variantesOrientadas.get(g)
  if (!lista) variantesOrientadas.set(g, (lista = []))
  const i = (rot === 0 ? 0 : rot === 90 ? 1 : rot === 180 ? 2 : 3) + (espejo ? 4 : 0)
  return (lista[i] ??= { trazos: g.trazos.map((l) => orientar(l, rot, espejo)), rellenos: orientar(g.rellenos, rot, espejo) })
}

/** Un interruptor con el contacto cerrado según su propiedad (la del documento, o la accionada en la vista previa vía
 * `documentoVisible`) se dibuja accionado si su pieza trae `accionado.svg`. */
export function estaAccionada(p: Pieza, def: PiezaDef): boolean {
  const m = def.modelo
  if (m?.tipo !== 'interruptor' || !def.geometriaAccionada) return false
  return (p.props[m.prop] ?? def.props.find((d) => d.id === m.prop)?.defecto) === m.cerrado
}

/** Geometría orientada de una pieza con capas que no es la de siempre (cursor corrido, o sin las capas de la capa de
 * movimiento al simular), guardada por tipo, orientación y llave. */
const conCapas = new WeakMap<PiezaDef, Map<string, GeometriaOrientada>>()
function orientadaConCapas(def: PiezaDef, p: Pieza, simulando: boolean, clave: string): GeometriaOrientada {
  let m = conCapas.get(def)
  if (!m) conCapas.set(def, (m = new Map()))
  const k = `${p.rot}|${p.espejo ? 1 : 0}|${clave}`
  let g = m.get(k)
  if (!g) {
    // Un potenciómetro que se arrastra pide una llave por posición: se guardan las últimas, no todas.
    if (m.size > 256) m.clear()
    const base = geometriaDeEscena(def, p, simulando)
    m.set(k, (g = { trazos: base.trazos.map((l) => orientar(l, p.rot, p.espejo)), rellenos: orientar(base.rellenos, p.rot, p.espejo) }))
  }
  return g
}

/** Símbolo de la pieza en mundo; sin definición, el cuadro de pieza desconocida. `tri` null omite rellenos. Con
 * `simulando`, sin las capas de la capa de movimiento; la flecha del potenciómetro sigue siempre al documento. */
export function dibujarPieza(t: EscritorTrazos, tri: EscritorTriangulos | null, p: Pieza, def: PiezaDef | undefined, color: RGBA, ancho = ANCHO_TRAZO, simulando = false): void {
  if (!def) {
    rectangulo(t, desplazarCaja(CAJA_DESCONOCIDA, p.x, p.y), ancho, color)
    return
  }
  def = defDe(p, def)
  const clave = claveDeEscena(def, p, simulando)
  dibujarOrientada(t, tri, p, clave === null ? geometriaOrientada(def, p.rot, p.espejo, estaAccionada(p, def)) : orientadaConCapas(def, p, simulando, clave), color, ancho)
  const v = geometriaDeVariante(def, p)
  if (v) dibujarOrientada(t, tri, p, varianteOrientada(v, p.rot, p.espejo), color, ancho)
  // Las palancas de un DIP y las teclas pulsadas de un teclado no están en el símbolo: se dibujan según su estado.
  if (def.animacion?.tipo === 'zonas') dibujarContactos(t, tri, p, def, color, ancho)
}

function dibujarOrientada(t: EscritorTrazos, tri: EscritorTriangulos | null, p: Pieza, g: GeometriaOrientada, color: RGBA, ancho: number): void {
  for (const l of g.trazos) {
    let px = l[0], py = l[1]
    for (let i = 2; i + 1 < l.length; i += 2) {
      const qx = l[i], qy = l[i + 1]
      t.segmento(p.x + px, p.y + py, p.x + qx, p.y + qy, ancho, color)
      px = qx
      py = qy
    }
  }
  if (!tri) return
  const r = g.rellenos
  for (let i = 0; i + 5 < r.length; i += 6) tri.triangulo(p.x + r[i], p.y + r[i + 1], p.x + r[i + 2], p.y + r[i + 3], p.x + r[i + 4], p.y + r[i + 5], color)
}

export function dibujarCable(t: EscritorTrazos, c: Cable, color: RGBA, saltos?: Map<string, number[]>, ancho = ANCHO_CABLE): void {
  // Sin ningún salto no hace falta armar la clave de cada tramo.
  const conSaltos = saltos !== undefined && saltos.size > 0
  for (let i = 1; i < c.puntos.length; i++) {
    const a = c.puntos[i - 1], b = c.puntos[i]
    const xs = conSaltos ? saltos.get(claveTramo(c.id, i - 1)) : undefined
    if (xs) t.polilinea(tramoConSaltos(a, b, xs), ancho, color)
    else t.segmento(a.x, a.y, b.x, b.y, ancho, color)
  }
}

/** Fuente de un texto del lienzo para cada fuente del formato. */
export const FUENTE_DE_TEXTO: Record<Fuente, Texto['fuente']> = { sans: 'interfaz', serif: 'serif', mono: 'cifras' }

/** Nombre de una etiqueta de red con su formato, en su ancla (dentro de la bandera o tras la punta). */
export function textoDeEtiqueta(e: Etiqueta): Texto | null {
  if (e.nombre === '') return null
  const f = formatoCompleto(e.formato, 'etiqueta')
  const a = anclaTextoEtiqueta(e)
  const ancho = anchoNombreEtiqueta(e)
  return {
    texto: normalizar(e.nombre), x: a.x, y: a.y, alinear: a.alinear, tamaño: emDeTam(f.tam), color: TOKEN_DE_TINTA[f.tinta], fuente: FUENTE_DE_TEXTO[f.fuente],
    negrita: f.negrita, cursiva: f.cursiva, ancho, ...(a.giro ? { giro: a.giro } : {}), ...(f.subrayado ? { subrayado: ancho } : {})
  }
}

/** Textos de una nota: un trozo por renglón (por palabra si está justificado), ya alineado en la caja, para que el lienzo
 * dibuje exactamente los cortes del reparto. */
export function textosDeNota(n: Nota): Texto[] {
  const d = disposicionNota(n)
  const f = d.formato
  const out: Texto[] = []
  d.renglones.forEach((r, i) => {
    const trozos = colocarRenglon(r, f.alinear, d.anchoArea)
    const y = n.y + d.padY + d.linea * (i + 0.5)
    const fin = trozos.length ? trozos[trozos.length - 1].x + trozos[trozos.length - 1].ancho : 0
    trozos.forEach((tr, j) =>
      out.push({
        texto: tr.texto, x: n.x + d.padX + tr.x, y, alinear: 'izq', tamaño: d.em, color: TOKEN_DE_TINTA[f.tinta], fuente: FUENTE_DE_TEXTO[f.fuente],
        negrita: f.negrita, cursiva: f.cursiva, ancho: tr.ancho,
        // Un renglón justificado se subraya de punta a punta desde su primera palabra.
        ...(f.subrayado && j === 0 ? { subrayado: fin - tr.x } : {})
      })
    )
  })
  return out
}

/** `sinOpacidad`: las figuras van opacas, sin su opacidad (el lienzo con el contraste alto de Windows). */
export interface OpcionesEscena {
  sinOpacidad?: boolean
  /** La vista previa corre; el rotor y la armadura del relé los dibuja la capa de movimiento. */
  simulando?: boolean
  /** Exportar: la lectura de cada medidor rápido por id de sonda; sin ella (o sin la del medidor) la pantalla queda en reposo. */
  lecturasMedidores?: ReadonlyMap<Id, LecturaMedidor>
  /** Exportar: los cables y uniones con el color de su voltaje (escala azul a naranja); lo que no figura conserva el color de edición. */
  voltajes?: VoltajesDeCables
  /** Dibuja el número de cada patilla junto a su pin (Vista › Números de patilla; al exportar, solo si están visibles). */
  numerosPatilla?: boolean
}

/** Simulando, el ajuste de un termistor o fotorresistencia con resistencia visible se parte: aquí queda lo fijo (anclado a la
 * izquierda donde empezaba la línea) y la capa de la vista previa escribe la resistencia del motor detrás. */
function conResistenciaViva(p: Pieza, def: PiezaDef, doc: Documento, suyas: readonly Texto[]): readonly Texto[] {
  const vivas = partesVivas(p, def)
  if (!vivas) return suyas
  const i = textosLocales(p, def, doc).findIndex((t) => t.cual === 'ajuste')
  const t = suyas[i]
  if (!t) return suyas
  const w = anchoTexto(t.texto, t.tamaño)
  const inicio = t.alinear === 'izq' ? t.x : t.alinear === 'der' ? t.x - w : t.x - w / 2
  const fuera = suyas.slice()
  fuera[i] = { ...t, texto: vivas.fijo, x: inicio, alinear: 'izq', vivo: { id: p.id, respaldo: vivas.respaldo } }
  return fuera
}

export function construirEscena(doc: Documento, lib: Map<string, PiezaDef>, con: Conexiones, paleta: Paleta, opciones: OpcionesEscena = {}): Escena {
  const t = new EscritorTrazos()
  const tri = new EscritorTriangulos()
  const textos: Texto[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const sumar4 = (x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
  }
  const sumar = (c: Caja) => sumar4(c.minX, c.minY, c.maxX, c.maxY)
  // Los textos de cada pieza se agregan de a uno: `push(...a, ...b)` armaba dos listas de argumentos por pieza.
  const agregarTextos = (xs: readonly Texto[]) => {
    for (const x of xs) textos.push(x)
  }

  // Referencias y valores apartados de cables, cuerpos y otros textos cuando su lugar por omisión choca.
  // Una sola vez cada colección: `Object.values` de miles de elementos cuesta casi un milisegundo.
  const listas = listasDe(doc)
  const etiquetas = etiquetasSinChoques(doc, lib, listas)
  // Con sondas, las entradas de los instrumentos que miden dicen de dónde («A ← R1:2»).
  const conSondas = haySondas(doc)
  const entradas = conSondas ? rotulosDeEntradas(doc, lib, con) : null
  for (const p of listas.piezas) {
    const def = defDe(p, lib.get(p.tipo))
    dibujarPieza(t, tri, p, def, paleta.pieza, ANCHO_TRAZO, opciones.simulando)
    if (def) {
      const suyas = etiquetas.get(p.id)
      if (suyas) agregarTextos(opciones.simulando ? conResistenciaViva(p, def, doc, suyas) : suyas)
      const suyasEntradas = entradas?.get(p.id)
      if (def.rotulos) agregarTextos(rotulosDePieza(p, def, suyasEntradas?.reemplazos))
      if (opciones.numerosPatilla) agregarTextos(textosNumerosPatilla(p, def))
      if (suyasEntradas) for (const r of suyasEntradas.extra) textos.push(rotuloDePieza(p, def, r))
      sumar(cajaEnMundo(p, def))
    } else {
      textos.push({ texto: `desconocida: ${p.tipo}`, x: p.x, y: p.y, alinear: 'centro', tamaño: TAM_ETIQUETA, color: 'valor', fuente: 'interfaz' })
      sumar(desplazarCaja(CAJA_DESCONOCIDA, p.x, p.y))
    }
  }

  const cables = listas.cables
  const saltos = cruces(cables, con.uniones)
  const vol = opciones.voltajes
  for (const c of cables) {
    const v = vol?.cables.get(c.id)
    dibujarCable(t, c, v === undefined ? paleta.cable : colorDeVoltaje(v, vol!.vmax, paleta), saltos)
    for (const pt of c.puntos) sumar4(pt.x, pt.y, pt.x, pt.y)
  }
  for (const u of con.uniones) {
    const v = vol?.puntos.get(`${u.x},${u.y}`)
    t.segmento(u.x, u.y, u.x, u.y, 2 * RADIO_UNION, v === undefined ? paleta.cable : colorDeVoltaje(v, vol!.vmax, paleta))
  }

  for (const e of listas.etiquetas) {
    const contorno = colorContorno(e.formato, paleta, paleta.pieza)
    if (contorno) t.polilinea(formaEtiqueta(e), ANCHO_TRAZO, contorno)
    // Su punto de conexión: lleno, del color del cable, si algo llega a él; hueco si está suelta.
    if (con.etiquetaConectada?.has(e.id)) t.segmento(e.x, e.y, e.x, e.y, 2 * RADIO_PUNTO_ETIQUETA, paleta.cable)
    else circulo(t, e.x, e.y, RADIO_PUNTO_ETIQUETA, ANCHO_TRAZO, contorno ?? paleta.pieza)
    const tx = textoDeEtiqueta(e)
    if (tx) textos.push(tx)
    sumar(cajaEtiqueta(e))
  }

  for (const n of listas.notas) {
    const c = cajaNota(n)
    const borde = colorContorno(n.formato, paleta, paleta.valor)
    if (borde) rectangulo(t, c, ANCHO_TRAZO * 0.6, borde)
    textos.push(...textosDeNota(n))
    sumar(c)
  }

  // Las sondas: la bandera de cada una fuera de cuerpos y textos (con los textos que ya están), encima del circuito.
  const banderas = conSondas ? banderasDelDocumento(doc, lib, con, etiquetas, listas) : SIN_BANDERAS
  for (const b of banderas.values()) {
    dibujarBandera(t, tri, b, doc.sondas![b.sonda], con.redDeSonda.has(b.sonda), paleta, textos)
    sumar(b.caja)
  }
  // Los medidores rápidos: su cuerpo con la guía y, sin simular, la pantalla en reposo (al simular la dibuja la capa de la vista previa).
  if (conSondas)
    for (const m of medidoresDe(doc)) {
      dibujarCuerpoDeMedidor({ t, tri, textos }, m, paleta)
      if (!opciones.simulando) dibujarPantallaDeMedidor({ t, tri, textos }, m, paleta, opciones.lecturasMedidores?.get(m.id) ?? null)
      sumar(pantallaDeMedidor(m).caja)
    }
  // La misma bandera, con su letra, junto al pin del instrumento: la entrada unida por sonda no parece desconectada.
  if (conSondas)
    for (const b of banderasDeEntradas(doc, lib, con)) {
      const color = paleta[tokenDeSonda(doc.sondas![b.sonda])]
      const [a, z] = b.tallo
      t.segmento(a.x, a.y, z.x, z.y, ANCHO_TRAZO, color)
      const c = b.caja
      tri.triangulo(c.minX, c.minY, c.maxX, c.minY, c.maxX, c.maxY, color)
      tri.triangulo(c.minX, c.minY, c.maxX, c.maxY, c.minX, c.maxY, color)
      rectangulo(t, c, ANCHO_TRAZO, color)
      textos.push({ texto: b.letra, x: (c.minX + c.maxX) / 2, y: (c.minY + c.maxY) / 2, alinear: 'centro', tamaño: TAM_LETRA_BANDERA, color: 'lienzo', fuente: 'cifras', negrita: true })
      sumar(c)
    }

  // Las figuras: su propia capa, del fondo al frente, y su caja en la del dibujo (encuadrar y exportar las ven).
  const figs = enOrden(doc)
  let figurasSimplificadas = false
  const capaFiguras = (atenuar: boolean): CapaFiguras => {
    const ft = new EscritorTrazos(), fr = new EscritorTriangulos()
    const p = nuevoPresupuesto()
    dibujarFiguras(ft, fr, figs, paleta, atenuar, p, opciones.sinOpacidad === true)
    if (!atenuar) figurasSimplificadas = p.agotado
    return { trazos: ft.resultado(), nTrazos: ft.cuenta, triangulos: fr.resultado(), nTriangulos: fr.cuenta }
  }
  const figuras = capaFiguras(false)
  let atenuadas: CapaFiguras | null = figs.length > 0 ? null : figuras
  for (const f of figs) sumar(cajaFigura(f))

  // Los textos cuentan en la caja (encuadrar no debe cortarlos), con el mismo ancho estimado que usa el dibujo.
  for (const x of textos) {
    const w = x.ancho ?? anchoTexto(x.texto, x.tamaño)
    if (x.giro) {
      const arriba = x.alinear === 'izq' ? x.y : x.alinear === 'der' ? x.y - w : x.y - w / 2
      sumar4(x.x - x.tamaño / 2, arriba, x.x + x.tamaño / 2, arriba + w)
      continue
    }
    const izq = x.alinear === 'izq' ? x.x : x.alinear === 'der' ? x.x - w : x.x - w / 2
    sumar4(izq, x.y - x.tamaño / 2, izq + w, x.y + x.tamaño / 2)
  }

  return {
    trazos: t.resultado(),
    nTrazos: t.cuenta,
    triangulos: tri.resultado(),
    nTriangulos: tri.cuenta,
    textos,
    caja: minX <= maxX ? { minX, minY, maxX, maxY } : null,
    saltos,
    figuras,
    get figurasAtenuadas() {
      return (atenuadas ??= capaFiguras(true))
    },
    figurasSimplificadas,
    banderas
  }
}
