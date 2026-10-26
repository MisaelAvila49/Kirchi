import type { Tema } from '../../../compartido/ajustes'
import type { CanalOMatematico } from '../instrumentos/ajustes'

/**
 * Colores de la interfaz. Esta tabla es la fuente de verdad: `colores.css` los declara como variables (la prueba exige que coincidan) y ningún componente escribe un color.
 */

/**
 * Ocho tonos de categoría en el orden que pasó el validador de paletas de dataviz. El orden importa: el validador mide los vecinos.
 */
export const TONOS_CATEGORIA = ['azul', 'ocre', 'violeta', 'verdeazul', 'naranja', 'cian', 'magenta', 'oliva', 'ciruela'] as const
export type TonoCategoria = (typeof TONOS_CATEGORIA)[number]

/** Tonos que solo usan los iconos y las pestañas de la franja: rojo (borrar, detener), ámbar (corriente, multímetro, aviso) y gris (tierra, ajustes). */
export const TONOS_ICONO = ['rojo', 'ambar', 'gris'] as const
export type Tono = TonoCategoria | (typeof TONOS_ICONO)[number]
export const TONOS: readonly Tono[] = [...TONOS_CATEGORIA, ...TONOS_ICONO]

/** Las magnitudes de las lecturas: voltaje en el naranja de la escala del lienzo, corriente en ámbar, potencia en gris. */
export const MAGNITUDES = ['v', 'i', 'p'] as const
export type Magnitud = (typeof MAGNITUDES)[number]

/** Los tonos propios de los canales del osciloscopio: ver `TONO_CANAL`. */
export const CANALES_TOKEN = ['canal-a', 'canal-b', 'canal-c', 'canal-d'] as const

/** El tono (3:1), «suave» el tinte de fondo, «tenue» el tinte fuerte (siempre con contorno) y «texto» la versión con 4.5:1. */
export const VARIANTES = ['', '-suave', '-tenue', '-texto'] as const

/** Los nombres de las variables, sin los dos guiones: `azul-suave` es `--azul-suave`. */
export const NOMBRES_TOKEN: readonly string[] = [
  ...TONOS.flatMap((t) => VARIANTES.map((v) => `${t}${v}`)),
  ...MAGNITUDES.flatMap((m) => ['', '-suave', '-texto'].map((v) => `lectura-${m}${v}`)),
  ...CANALES_TOKEN.flatMap((c) => ['', '-suave', '-texto'].map((v) => `${c}${v}`)),
  ...['negro'].flatMap((c) => ['', '-suave', '-texto'].map((v) => `${c}${v}`)),
  // El medidor rápido: cuerpo oscuro, pantalla verde grisácea que conserva su verde en los dos temas, cifras y segmentos apagados.
  'medidor-cuerpo', 'medidor-lcd', 'medidor-tinta', 'medidor-apagado',
  'ic-contra',
  'ic-gris',
  'texto-sobre-tinte'
]

/** Tono de cada categoría de `componentes/` (el `categoria` de su `pieza.json`). */
export const CATEGORIA_TONO: Readonly<Record<string, TonoCategoria>> = {
  pasivos: 'azul',
  fuentes: 'ocre',
  semiconductores: 'violeta',
  interruptores: 'verdeazul',
  electromecanicos: 'naranja',
  indicadores: 'cian',
  digitales: 'magenta',
  integrados: 'oliva',
  // El noveno tono, que pasa el validador como vecino de oliva en los dos temas.
  instrumentos: 'ciruela'
}

/** Tono de una categoría; una que no es de las ocho queda sin tono (se dibuja en gris). */
export const tonoDeCategoria = (id: string): TonoCategoria | undefined => (Object.hasOwn(CATEGORIA_TONO, id) ? CATEGORIA_TONO[id] : undefined)

export type ColoresTema = Readonly<Record<string, string>>

/** Tema claro: los de `assets/comun.css` y `assets/rbase.css`. */
export const COLORES_CLAROS: ColoresTema = {
  azul: '#2F6FBF', 'azul-suave': '#E4ECF7', 'azul-tenue': '#BCD1EB', 'azul-texto': '#2D69B5',
  ocre: '#A86A12', 'ocre-suave': '#F4ECE0', 'ocre-tenue': '#E3CFB3', 'ocre-texto': '#935E13',
  violeta: '#7A4FC9', 'violeta-suave': '#EEE8F8', 'violeta-tenue': '#D4C7EE', 'violeta-texto': '#7A4FC9',
  verdeazul: '#00876F', 'verdeazul-suave': '#DEEFEC', 'verdeazul-tenue': '#ADD9D1', 'verdeazul-texto': '#027763',
  naranja: '#C8581C', 'naranja-suave': '#F8E9E1', 'naranja-tenue': '#EDCAB6', 'naranja-texto': '#AB4D1C',
  cian: '#127FA6', 'cian-suave': '#E0EEF3', 'cian-tenue': '#B3D6E3', 'cian-texto': '#127092',
  magenta: '#B83C7A', 'magenta-suave': '#F6E6EE', 'magenta-tenue': '#E8C1D4', 'magenta-texto': '#B13A76',
  oliva: '#5F7F1E', 'oliva-suave': '#EAEEE2', 'oliva-tenue': '#CCD6B7', 'oliva-texto': '#56721E',
  ciruela: '#8B4E8F', 'ciruela-suave': '#F0E8F0', 'ciruela-tenue': '#DAC6DB', 'ciruela-texto': '#8B4E8F',
  rojo: '#B42318', 'rojo-suave': '#FBE9E7', 'rojo-tenue': '#F1C4BF', 'rojo-texto': '#B42318',
  ambar: '#B45309', 'ambar-suave': '#FBF0E1', 'ambar-tenue': '#EFD2AE', 'ambar-texto': '#96450A',
  gris: '#6B7585', 'gris-suave': '#EEEFF1', 'gris-tenue': '#D3D6DB', 'gris-texto': '#5D6470',
  'lectura-v': '#C2410C', 'lectura-v-suave': '#FBEDE6', 'lectura-v-texto': '#A8380B',
  'lectura-i': '#B45309', 'lectura-i-suave': '#FBF0E1', 'lectura-i-texto': '#96450A',
  'lectura-p': '#5D6470', 'lectura-p-suave': '#F1EFE8', 'lectura-p-texto': '#4F5560',
  'canal-a': '#00876F', 'canal-a-suave': '#DEEFEC', 'canal-a-texto': '#027763',
  'canal-b': '#2F6FBF', 'canal-b-suave': '#E4ECF7', 'canal-b-texto': '#2D69B5',
  'canal-c': '#A86A12', 'canal-c-suave': '#F4ECE0', 'canal-c-texto': '#935E13',
  'canal-d': '#8B4E8F', 'canal-d-suave': '#F0E8F0', 'canal-d-texto': '#8B4E8F',
  negro: '#15171B', 'negro-suave': '#E8E9EB', 'negro-texto': '#15171B',
  'medidor-cuerpo': '#2A2E36', 'medidor-lcd': '#B9CBA7', 'medidor-tinta': '#1D2B1C', 'medidor-apagado': '#AFC19D',
  'ic-contra': '#FFFFFF', 'ic-gris': '#6B7585', 'texto-sobre-tinte': '#5D6470'
}

/** Tema oscuro: tintes al 30 % del tono sobre #22252A y texto aclarado para mantener 4.5:1. */
export const COLORES_OSCUROS: ColoresTema = {
  azul: '#5B8FD8', 'azul-suave': '#33455E', 'azul-tenue': '#3D587E', 'azul-texto': '#93B5E5',
  ocre: '#B8842E', 'ocre-suave': '#4F422B', 'ocre-tenue': '#6A532C', 'ocre-texto': '#D0AE75',
  violeta: '#9A7BD8', 'violeta-suave': '#463F5E', 'violeta-tenue': '#5C4E7E', 'violeta-texto': '#BCA8E5',
  verdeazul: '#2E9E86', 'verdeazul-suave': '#264946', 'verdeazul-tenue': '#285F56', 'verdeazul-texto': '#75BFAF',
  naranja: '#D4743A', 'naranja-suave': '#573D2F', 'naranja-tenue': '#774B32', 'naranja-texto': '#E3A37D',
  cian: '#3D9DBF', 'cian-suave': '#2A4957', 'cian-tenue': '#2F5F72', 'cian-texto': '#7FBED5',
  magenta: '#CC5E8A', 'magenta-suave': '#553647', 'magenta-tenue': '#744058', 'magenta-texto': '#DE98B4',
  oliva: '#7D9B3C', 'oliva-suave': '#3D482F', 'oliva-tenue': '#4E5E33', 'oliva-texto': '#A7BB7A',
  ciruela: '#B777BB', 'ciruela-suave': '#4F3E56', 'ciruela-tenue': '#684C6E', 'ciruela-texto': '#CEA2D1',
  rojo: '#F97066', 'rojo-suave': '#4A2E2E', 'rojo-tenue': '#6B3735', 'rojo-texto': '#F98A82',
  ambar: '#E8B931', 'ambar-suave': '#47402A', 'ambar-tenue': '#6B5B26', 'ambar-texto': '#F2CD5C',
  gris: '#9AA1AC', 'gris-suave': '#34373D', 'gris-tenue': '#474B53', 'gris-texto': '#B9BCC2',
  'lectura-v': '#D9732B', 'lectura-v-suave': '#4E382A', 'lectura-v-texto': '#E59A64',
  'lectura-i': '#FACC15', 'lectura-i-suave': '#564D25', 'lectura-i-texto': '#F5D04A',
  'lectura-p': '#A3A7AE', 'lectura-p-suave': '#41444A', 'lectura-p-texto': '#B9BCC2',
  'canal-a': '#2E9E86', 'canal-a-suave': '#264946', 'canal-a-texto': '#75BFAF',
  'canal-b': '#5B8FD8', 'canal-b-suave': '#33455E', 'canal-b-texto': '#93B5E5',
  'canal-c': '#B8842E', 'canal-c-suave': '#4F422B', 'canal-c-texto': '#D0AE75',
  'canal-d': '#A1529B', 'canal-d-suave': '#48334C', 'canal-d-texto': '#C797C3',
  negro: '#F2F3F5', 'negro-suave': '#3A3D44', 'negro-texto': '#F2F3F5',
  'medidor-cuerpo': '#0E0F12', 'medidor-lcd': '#B9CBA7', 'medidor-tinta': '#1D2B1C', 'medidor-apagado': '#AFC19D',
  'ic-contra': '#15171B', 'ic-gris': '#9AA1AC', 'texto-sobre-tinte': '#C9CDD3'
}

/**
 * Tokens con transparencia fuera de la lista de 72: velo y relleno del tutorial y sombra del aviso. En oscuro el velo es más denso.
 */
export const TOKENS_CON_ALFA: Readonly<Record<Tema, ColoresTema>> = {
  claro: { 'velo-foco': '#17181B52', 'foco-relleno': '#FFFFFF00', 'sombra-aviso': '#0000002E' },
  oscuro: { 'velo-foco': '#000000C7', 'foco-relleno': '#FFFFFF17', 'sombra-aviso': '#00000080' }
}

export const coloresDeTema = (t: Tema): ColoresTema => (t === 'oscuro' ? COLORES_OSCUROS : COLORES_CLAROS)


/**
 * Canales del osciloscopio, validados todos contra todos con dataviz en los dos temas. En oscuro el cuarto cambia para mantener ΔE 9.4 en el peor par.
 */
export const TONO_CANAL = { A: 'canal-a', B: 'canal-b', C: 'canal-c', D: 'canal-d', M: 'gris' } as const satisfies Readonly<
  Record<CanalOMatematico, (typeof CANALES_TOKEN)[number] | 'gris'>
>

/** El color de la traza de un canal en un tema (la pantalla es Canvas2D: no lee variables de CSS). */
export const colorDeCanal = (t: Tema, c: CanalOMatematico): string => coloresDeTema(t)[TONO_CANAL[c]]
