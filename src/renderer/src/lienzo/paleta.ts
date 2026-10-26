import type { ColorCables, Tema } from '../../../compartido/ajustes'
import type { Tinta } from '../doc/tipos'
import { COLORES_CLAROS, COLORES_OSCUROS } from '../ui/colores'

/** Color con componentes de 0 a 1, como los pide WebGL. */
export type RGBA = readonly [number, number, number, number]

export type Token =
  | 'lienzo'
  | 'paneles'
  | 'bordes'
  | 'trazo'
  | 'textoSecundario'
  | 'pieza'
  | 'valor'
  | 'rejillaMenor'
  | 'rejillaMayor'
  | 'cable'
  | 'seleccion'
  | 'sombraTutorial'
  | 'voltajeAlto'
  | 'voltajeCero'
  | 'voltajeNegativo'
  | 'corriente'
  | 'ledRojo'
  | 'ledVerde'
  | 'ledAzul'
  | 'ledAmarillo'
  | 'ledBlanco'
  | 'invalido'
  | 'textoTinta'
  | 'textoGris'
  | 'textoRojo'
  | 'textoAzul'
  | 'textoVerde'
  | 'flechaCorriente'
  | 'aviso'
  | 'focoTibio'
  | 'focoPleno'
  | 'sondaA'
  | 'sondaB'
  | 'sondaC'
  | 'sondaD'
  | 'medidorCuerpo'
  | 'medidorLcd'
  | 'medidorTinta'
  | 'medidorApagado'

export type Tokens = Record<Token, string>
export type Paleta = Record<Token, RGBA>

/** «Papel técnico», tema claro. */
export const TOKENS_CLAROS: Tokens = {
  lienzo: '#F7F6F2',
  paneles: '#FFFFFF',
  bordes: '#E2E0D8',
  trazo: '#1E2430',
  textoSecundario: '#5D6470',
  /** Tinta de las piezas y de las referencias en el lienzo (la interfaz usa `trazo`); en claro es la misma. */
  pieza: '#1E2430',
  /** Texto de valor en el lienzo (la interfaz usa `textoSecundario`); en claro es el mismo. */
  valor: '#5D6470',
  rejillaMenor: '#CFCBBF',
  /** 1.94:1 sobre el lienzo: la rejilla se lee como textura (objetivo de 1.3 a 2). */
  rejillaMayor: '#B8B3A5',
  cable: '#0E7C66',
  seleccion: '#2457D6',
  /** Tinta de la sombra que muestra el tutorial; se mezcla con el lienzo a ALFA_SOMBRA_TUTORIAL. */
  sombraTutorial: '#2457D6',
  /** Escala divergente de los cables al simular: naranja positivo, gris 0 V, azul negativo (validada con dataviz; 3:1 o más en toda la escala). */
  voltajeAlto: '#C2410C',
  voltajeCero: '#6B7585',
  voltajeNegativo: '#1D4ED8',
  corriente: '#B45309',
  /** Luz de los LED encendidos al simular: un disco translúcido sobre el símbolo, que se sigue leyendo debajo. */
  ledRojo: '#EF4444',
  ledVerde: '#22C55E',
  ledAzul: '#3B82F6',
  ledAmarillo: '#EAB308',
  /** Una luz blanca no se ve sobre papel claro (y en ámbar se confundía con el amarillo, CIEDE2000 de 4.7): gris pizarra, a 29 del amarillo. */
  ledBlanco: '#475569',
  /** Fantasma o arrastre que se encimaría con otra pieza. */
  invalido: '#B42318',
  /** Las cinco tintas con nombre de notas y etiquetas; la exportación usa siempre estas del tema claro. */
  textoTinta: '#1E2430',
  textoGris: '#5D6470',
  textoRojo: '#B42318',
  textoAzul: '#1D4F91',
  textoVerde: '#0E7C66',
  /** Las puntas de la corriente animada, en la tinta de las piezas (14.4:1), apartadas de la escala de voltaje. */
  flechaCorriente: '#1E2430',
  /** El contorno y el triángulo de un aviso de sobrecorriente (4.6:1). */
  aviso: '#B45309',
  /** La luz del foco, del filamento tibio (4.2:1) al pleno (3.5:1); el blanco no se vería sobre papel claro. */
  focoTibio: '#C2560C',
  focoPleno: '#B07A0A',
  /** Las banderas de las sondas del osciloscopio: el color de texto de cada canal (`ui/colores.ts`), 4.5:1 o más. */
  sondaA: COLORES_CLAROS['canal-a-texto'],
  sondaB: COLORES_CLAROS['canal-b-texto'],
  sondaC: COLORES_CLAROS['canal-c-texto'],
  sondaD: COLORES_CLAROS['canal-d-texto'],
  /** El medidor rápido: cuerpo oscuro, pantalla verde grisácea (la misma en los dos temas), cifras y segmentos apagados (`ui/colores.ts`). */
  medidorCuerpo: COLORES_CLAROS['medidor-cuerpo'],
  medidorLcd: COLORES_CLAROS['medidor-lcd'],
  medidorTinta: COLORES_CLAROS['medidor-tinta'],
  medidorApagado: COLORES_CLAROS['medidor-apagado']
}

/** Tema oscuro, solo si el usuario lo elige. */
export const TOKENS_OSCUROS: Tokens = {
  lienzo: '#17181B',
  paneles: '#22252A',
  bordes: '#33373E',
  trazo: '#E8E6E1',
  textoSecundario: '#A3A7AE',
  /** Circuito en tonos apagados («Apagada»): 11.0:1 sobre el lienzo. */
  pieza: '#C9CCD1',
  valor: '#9CA1A9',
  rejillaMenor: '#33363C',
  rejillaMayor: '#45484F',
  /** 6.3:1 sobre el lienzo. */
  cable: '#58A897',
  /** Selección del lienzo y de la interfaz (7.4:1 sobre el lienzo): una pieza y su fila en Proyecto comparten color. */
  seleccion: '#86A6EE',
  sombraTutorial: '#86A6EE',
  /** Más oscuros que #FB923C: así quedan dentro de la banda de luminosidad del validador para fondo oscuro. */
  voltajeAlto: '#D9732B',
  voltajeCero: '#8A919C',
  voltajeNegativo: '#4F8EF0',
  corriente: '#FACC15',
  ledRojo: '#F87171',
  ledVerde: '#4ADE80',
  ledAzul: '#60A5FA',
  ledAmarillo: '#FDE047',
  ledBlanco: '#F8FAFC',
  invalido: '#F97066',
  /** Tintas en la paleta «Apagada»: una nota en tinta se ve como el trazo de las piezas y una en gris como los valores. */
  textoTinta: '#C9CCD1',
  textoGris: '#9CA1A9',
  textoRojo: '#F97066',
  textoAzul: '#86A6EE',
  textoVerde: '#58A897',
  flechaCorriente: '#C9CCD1',
  aviso: '#E8B931',
  focoTibio: '#E0702A',
  focoPleno: '#FFE7B0',
  sondaA: COLORES_OSCUROS['canal-a-texto'],
  sondaB: COLORES_OSCUROS['canal-b-texto'],
  sondaC: COLORES_OSCUROS['canal-c-texto'],
  sondaD: COLORES_OSCUROS['canal-d-texto'],
  medidorCuerpo: COLORES_OSCUROS['medidor-cuerpo'],
  medidorLcd: COLORES_OSCUROS['medidor-lcd'],
  medidorTinta: COLORES_OSCUROS['medidor-tinta'],
  medidorApagado: COLORES_OSCUROS['medidor-apagado']
}

/** Token con que cada tema pinta una tinta con nombre (el documento guarda el nombre, nunca el color). */
export const TOKEN_DE_TINTA: Record<Tinta, Token> = { tinta: 'textoTinta', gris: 'textoGris', rojo: 'textoRojo', azul: 'textoAzul', verde: 'textoVerde' }

export function hexARgba(hex: string, alfa = 1): RGBA {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`color inválido: ${hex}`)
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alfa]
}

export const conAlfa = (c: RGBA, alfa: number): RGBA => [c[0], c[1], c[2], alfa]

/** Color opaco que resulta de pintar `color` con opacidad `alfa` sobre `fondo`: evita mezclar dos veces donde se solapan los trazos. */
export const mezclar = (color: RGBA, fondo: RGBA, alfa: number): RGBA => [
  fondo[0] + (color[0] - fondo[0]) * alfa,
  fondo[1] + (color[1] - fondo[1]) * alfa,
  fondo[2] + (color[2] - fondo[2]) * alfa,
  1
]

const lineal = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const luminancia = (c: RGBA) => 0.2126 * lineal(c[0]) + 0.7152 * lineal(c[1]) + 0.0722 * lineal(c[2])

/** Razón de contraste WCAG 2 entre dos colores opacos (1 a 21). */
export function contraste(a: RGBA, b: RGBA): number {
  const la = luminancia(a), lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function cssRgba(c: RGBA): string {
  const b = (v: number) => Math.round(v * 255)
  return `rgba(${b(c[0])}, ${b(c[1])}, ${b(c[2])}, ${c[3]})`
}

export const paletaDe = (t: Tokens): Paleta => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, hexARgba(v)])) as Paleta

export const PALETA_CLARA = paletaDe(TOKENS_CLAROS)
export const PALETA_OSCURA = paletaDe(TOKENS_OSCUROS)

/** textoSecundario → --texto-secundario */
export const variableCss = (t: string): string => `--${t.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}`

export const tokensDeTema = (t: Tema): Tokens => (t === 'oscuro' ? TOKENS_OSCUROS : TOKENS_CLAROS)

/** Color del cable al editar en cada tema, según Configuración → Color de cables. */
export const COLOR_CABLE: Record<ColorCables, Record<Tema, string>> = {
  verde: { claro: '#0E7C66', oscuro: '#58A897' },
  tinta: { claro: '#1E2430', oscuro: '#C9CCD1' },
  azul: { claro: '#1D4F91', oscuro: '#5B9BD5' }
}

const paletas = new Map<string, Paleta>()

/** Paleta del lienzo para un tema y color de cables. La misma combinación devuelve el mismo objeto, así cambiar de tema y
 * volver no rehace nada que dependa de ella. */
export function paletaDeTema(t: Tema, cables: ColorCables = 'verde'): Paleta {
  const k = `${t}:${cables}`
  let p = paletas.get(k)
  if (!p) paletas.set(k, (p = paletaDe({ ...tokensDeTema(t), cable: COLOR_CABLE[cables][t] })))
  return p
}

/** Colores que solo usa la interfaz (barra, chips, campos, selección en listas); el lienzo no los dibuja. */
export type TokenInterfaz = 'barra' | 'chip' | 'resalte' | 'bordeCampo' | 'seleccionFondo' | 'sobreSeleccion'

export const INTERFAZ_CLARA: Record<TokenInterfaz, string> = {
  barra: '#FFFFFF',
  chip: '#F1EFE8',
  resalte: '#F3F1EB',
  /** Borde de campos y chips: 3:1 o más sobre todos los fondos donde va (WCAG 1.4.11). */
  bordeCampo: '#858171',
  /** La selección (#2457D6) al 10 % sobre los paneles, ya mezclada. */
  seleccionFondo: '#E9EEFB',
  /** Texto sobre un botón relleno con el color de selección. */
  sobreSeleccion: '#FFFFFF'
}

export const INTERFAZ_OSCURA: Record<TokenInterfaz, string> = {
  barra: '#1E2024',
  chip: '#2A2D33',
  resalte: '#2A2D33',
  bordeCampo: '#787D86',
  /** La selección (#86A6EE) al 14 % sobre los paneles, ya mezclada. */
  seleccionFondo: '#303745',
  sobreSeleccion: '#17181B'
}

export const interfazDeTema = (t: Tema): Record<TokenInterfaz, string> => (t === 'oscuro' ? INTERFAZ_OSCURA : INTERFAZ_CLARA)

