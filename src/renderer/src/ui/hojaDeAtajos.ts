import { normalizar } from '../buscador/buscar'
import type { Atajos } from '../editor/teclado'
import { COMANDOS, nombreLargo, type IdComando } from './cinta/comandos'
import type { NombreIcono } from './cinta/trazos'

export interface FilaAtajo {
  id: string
  nombre: string
  /** Cada combinación partida en sus teclas: «Ctrl+Shift+Z» → ["Ctrl", "Shift", "Z"]. */
  teclas: string[][]
  /** Dónde está su botón en la barra superior («Inicio › Girar y reflejar»), si tiene. */
  lugar?: string
}

export interface GrupoAtajos {
  nombre: string
  filas: FilaAtajo[]
}

/** Grupos de la hoja y el orden de sus comandos; lo que no esté aquí va al final, en «Otros». */
export const GRUPOS_DE_ATAJOS: readonly [string, readonly string[]][] = [
  ['Archivo', ['nuevo', 'abrir', 'guardar', 'guardar-como']],
  ['Simulación', ['simular', 'detener', 'grabar', 'detener-grabacion', 'voltajes', 'pot-mas', 'pot-menos']],
  ['Edición', ['deshacer', 'rehacer', 'cortar', 'copiar', 'pegar', 'duplicar', 'borrar', 'todo', 'escape']],
  ['Piezas y redes', ['girar', 'girar-izq', 'espejo-x', 'espejo-y', 'etiqueta', 'tierra', 'nota', 'colocar-pieza', 'colocar-seguir']],
  ['Cables', ['retroceso', 'invertir-l']],
  ['Texto', ['negrita', 'cursiva', 'subrayado', 'tam-mayor', 'tam-menor', 'alinear-izq', 'alinear-centro', 'alinear-der', 'justificar']],
  ['Mover', ['mover-izq', 'mover-der', 'mover-arriba', 'mover-abajo', 'mover-izq-5', 'mover-der-5', 'mover-arriba-5', 'mover-abajo-5']],
  ['Vista y ventana', ['encuadrar', 'menu-contextual', 'formato-barra', 'limpio', 'plegar-cinta', 'buscar-comando', 'enfocar-tutorial', 'atajos', 'configuracion']]
]

/** «Ctrl+Shift+Z» → ["Ctrl", "Shift", "Z"]; el «+» suelto también es una tecla. */
export const partirCombinacion = (t: string): string[] => (t === '+' ? ['+'] : t.split(/\+(?!$)/))

/**
 * Hoja de atajos (solo lectura) del registro real, con `lugarDe` indica dónde está el botón en la barra superior.
 */
export function hojaDeAtajos(a: Atajos, lugarDe?: (id: string) => string | undefined): GrupoAtajos[] {
  const comandos = new Map(a.lista().map((c) => [c.id, c]))
  const fila = (id: string): FilaAtajo | null => {
    const c = comandos.get(id)
    if (!c) return null
    comandos.delete(id)
    const lugar = lugarDe?.(id)
    return { id, nombre: c.nombre, teclas: a.teclasDe(id).map(partirCombinacion), ...(lugar ? { lugar } : {}) }
  }
  const grupos: GrupoAtajos[] = []
  for (const [nombre, ids] of GRUPOS_DE_ATAJOS) {
    const filas = ids.map(fila).filter((f): f is FilaAtajo => f !== null)
    if (filas.length) grupos.push({ nombre, filas })
  }
  const otros = [...comandos.keys()].map(fila).filter((f): f is FilaAtajo => f !== null)
  if (otros.length) grupos.push({ nombre: 'Otros', filas: otros })
  return grupos
}

/** Una fila de la hoja: la de siempre, con el icono R1 de su orden y, si es un gesto («doble clic»), el gesto. */
export interface FilaMapa extends FilaAtajo {
  icono?: NombreIcono
  gesto?: string
  /** Fila que junta varias órdenes del registro (las cuatro flechas de mover): sus ids. */
  juntas?: string[]
  /** Las teclas de una fila que junta flechas: el modificador común y una tecla por orden, sin «o» entre ellas. */
  flechas?: { mod?: string; teclas: string[] }
  /** Texto de más para el buscador (los nombres y las teclas de las órdenes que junta). */
  buscar?: string
}

export interface GrupoMapa {
  id: string
  /** El lugar de la cinta («Inicio › Editar») o la clase («Solo con teclado»). */
  nombre: string
  /** El nombre corto del filtro («Editar»). */
  corto: string
  /** Icono del encabezado de la sección. */
  icono: NombreIcono
  filas: FilaMapa[]
}

/** Una tecla de la tira de arriba: la orden, su nombre corto, su tecla vigente y su icono. */
export interface TeclaSola {
  id: string
  nombre: string
  tecla: string
  icono?: NombreIcono
}

export interface MapaAtajos {
  solas: TeclaSola[]
  grupos: GrupoMapa[]
  total: number
}

/** Un comando del registro, o una orden de la cinta con tecla fija o gesto (Pieza…, Pantalla completa, Zoom de la página). */
type Entrada = string | { comando: IdComando }

/** Los grupos de la hoja, con el icono de su encabezado. */
export const GRUPOS_DEL_MAPA: readonly { id: string; nombre: string; corto: string; icono: NombreIcono; entradas: readonly Entrada[] }[] = [
  { id: 'archivo', nombre: 'Inicio › Archivo', corto: 'Archivo', icono: 'abrir', entradas: ['nuevo', 'abrir', 'guardar', 'guardar-como'] },
  { id: 'editar', nombre: 'Inicio › Editar', corto: 'Editar', icono: 'copiar', entradas: ['deshacer', 'rehacer', 'cortar', 'copiar', 'pegar', 'duplicar', 'borrar', 'todo'] },
  { id: 'girar', nombre: 'Inicio › Girar y reflejar', corto: 'Girar y reflejar', icono: 'girar', entradas: ['girar', 'girar-izq', 'espejo-x', 'espejo-y'] },
  { id: 'colocar', nombre: 'Inicio › Colocar', corto: 'Colocar', icono: 'pieza', entradas: [{ comando: 'pieza' }, 'etiqueta', 'tierra', 'nota'] },
  {
    id: 'simulacion', nombre: 'Simulación', corto: 'Simulación', icono: 'simular',
    // El tiempo y lo que se muestra, en el grupo de la simulación.
    entradas: ['simular', 'detener', 'avanzar', 'retroceder', 'avanzar-hasta', 'grabar', 'detener-grabacion', 'mas-lento', 'mas-rapido', 'voltajes', 'corriente', 'animaciones', 'sonido', 'pot-mas', 'pot-menos']
  },
  {
    id: 'vista', nombre: 'Vista y ventana', corto: 'Vista y ventana', icono: 'encuadrar',
    entradas: ['encuadrar', 'limpio', { comando: 'pantalla-completa' }, { comando: 'pagina-mas' }, { comando: 'pagina-menos' }, { comando: 'pagina-real' }, 'plegar-cinta', 'buscar-comando', 'enfocar-tutorial', 'atajos', 'configuracion']
  },
  {
    id: 'teclado', nombre: 'Solo con teclado', corto: 'Solo con teclado', icono: 'atajos',
    entradas: ['escape', 'mover-izq', 'mover-der', 'mover-arriba', 'mover-abajo', 'mover-izq-5', 'mover-der-5', 'mover-arriba-5', 'mover-abajo-5', 'menu-contextual', 'formato-barra', 'retroceso', 'invertir-l', 'colocar-pieza', 'colocar-seguir']
  },
  { id: 'texto', nombre: 'Texto de notas', corto: 'Texto de notas', icono: 'formato', entradas: ['negrita', 'cursiva', 'subrayado', 'tam-mayor', 'tam-menor', 'alinear-izq', 'alinear-centro', 'alinear-der', 'justificar'] }
]

/** La tira «Con una sola tecla»: once órdenes con su nombre corto, en el orden de la hoja. */
export const TECLAS_SOLAS: readonly [string, string][] = [
  ['girar', 'Girar'], ['espejo-x', 'Horizontal'], ['espejo-y', 'Vertical'], ['etiqueta', 'Etiqueta'], ['tierra', 'Tierra'], ['nota', 'Nota'],
  ['voltajes', 'Voltajes'], ['encuadrar', 'Encuadrar'], ['simular', 'Simular'], ['borrar', 'Borrar'], ['atajos', 'Atajos']
]

/** Icono de las órdenes del registro que no tienen botón en la cinta. */
const ICONO_SIN_BOTON: Readonly<Record<string, NombreIcono>> = {
  escape: 'cancelar',
  'mover-izq': 'moverIzq', 'mover-der': 'moverDer', 'mover-arriba': 'moverArriba', 'mover-abajo': 'moverAbajo',
  'mover-izq-5': 'moverIzq', 'mover-der-5': 'moverDer', 'mover-arriba-5': 'moverArriba', 'mover-abajo-5': 'moverAbajo',
  'menu-contextual': 'menuContextual', 'formato-barra': 'formato', retroceso: 'quitarEsquina', 'invertir-l': 'invertirL',
  'colocar-pieza': 'pieza', 'colocar-seguir': 'pieza', 'pot-mas': 'potMas', 'pot-menos': 'potMenos', 'buscar-comando': 'buscar',
  negrita: 'negrita', cursiva: 'cursiva', subrayado: 'subrayado', 'tam-mayor': 'letraMayor', 'tam-menor': 'letraMenor',
  'alinear-izq': 'alinearIzq', 'alinear-centro': 'alinearCentro', 'alinear-der': 'alinearDer', justificar: 'justificar'
}

const ICONO_DE_TECLA: ReadonlyMap<string, NombreIcono> = new Map([
  ...Object.entries(ICONO_SIN_BOTON),
  ...Object.values(COMANDOS).flatMap((c) => (c.tecla ? [[c.tecla, c.icono] as const] : []))
])

/**
 * Hoja: tira de teclas solas y grupos por lugar de la cinta. Lo que no esté en ningún grupo va al final, en «Otros».
 */
export function mapaDeAtajos(a: Atajos, lugarDe?: (id: string) => string | undefined): MapaAtajos {
  const comandos = new Map(a.lista().map((c) => [c.id, c]))
  const fila = (e: Entrada, grupo: string): FilaMapa | null => {
    if (typeof e !== 'string') {
      const c = COMANDOS[e.comando]
      const t = c.teclaFija
      const gesto = t && /clic/.test(t) ? t : undefined
      return { id: e.comando, nombre: nombreLargo(e.comando), teclas: t && !gesto ? [partirCombinacion(t)] : [], icono: c.icono, ...(gesto ? { gesto } : {}) }
    }
    const c = comandos.get(e)
    if (!c) return null
    comandos.delete(e)
    const lugar = lugarDe?.(e)
    const icono = ICONO_DE_TECLA.get(e)
    return { id: e, nombre: c.nombre, teclas: a.teclasDe(e).map(partirCombinacion), ...(icono ? { icono } : {}), ...(lugar && lugar !== grupo ? { lugar } : {}) }
  }
  const grupos: GrupoMapa[] = []
  for (const g of GRUPOS_DEL_MAPA) {
    const filas = juntarFlechas(g.entradas.map((e) => fila(e, g.nombre)).filter((f): f is FilaMapa => f !== null))
    if (filas.length) grupos.push({ id: g.id, nombre: g.nombre, corto: g.corto, icono: g.icono, filas })
  }
  const otros = [...comandos.keys()].map((id) => fila(id, 'Otros')).filter((f): f is FilaMapa => f !== null)
  if (otros.length) grupos.push({ id: 'otros', nombre: 'Otros', corto: 'Otros', icono: 'atajos', filas: otros })
  const solas: TeclaSola[] = []
  for (const [id, nombre] of TECLAS_SOLAS) {
    const t = a.teclasDe(id)[0]
    const icono = ICONO_DE_TECLA.get(id)
    if (t !== undefined && partirCombinacion(t).length === 1) solas.push({ id, nombre, tecla: t, ...(icono ? { icono } : {}) })
  }
  return { solas, grupos, total: grupos.reduce((n, g) => n + g.filas.length, 0) }
}

/** Las cuatro flechas de mover y su tecla de fábrica, en el orden de la fila que las junta. */
const FLECHAS: readonly [string, string, string][] = [['izq', 'Izquierda', '←'], ['der', 'Derecha', '→'], ['arriba', 'Arriba', '↑'], ['abajo', 'Abajo', '↓']]

/**
 * Las ocho órdenes de mover en dos filas (con Shift la de cinco pasos), solo si las cuatro de un paso conservan su tecla de fábrica. Si no, van separadas.
 */
function juntarFlechas(filas: FilaMapa[]): FilaMapa[] {
  let salida = filas
  for (const [sufijo, mod, id, nombre] of [['', undefined, 'mover', 'Mover la selección'], ['-5', 'Shift', 'mover-5', 'Mover la selección cinco pasos']] as const) {
    const ids = FLECHAS.map(([d]) => `mover-${d}${sufijo}`)
    const cuatro = ids.map((i) => salida.find((f) => f.id === i))
    const deFabrica = cuatro.every((f, k) => f && f.teclas.length === 1 && f.teclas[0].join('+') === (mod ? `${mod}+${FLECHAS[k][1]}` : FLECHAS[k][1]))
    if (!deFabrica) continue
    const junta: FilaMapa = {
      id,
      nombre,
      teclas: cuatro.map((f) => f!.teclas[0]),
      icono: 'mover',
      juntas: ids,
      flechas: { ...(mod ? { mod } : {}), teclas: FLECHAS.map(([, , g]) => g) },
      buscar: cuatro.map((f) => f!.nombre).join(' ')
    }
    const primera = salida.findIndex((f) => f.id === ids[0])
    salida = salida.flatMap((f, i) => (i === primera ? [junta] : ids.includes(f.id) ? [] : [f]))
  }
  return salida
}

/** Los grupos con solo las filas que pasan: del grupo `grupo` (null: todos) y cuyo nombre o teclas contienen `texto`. */
export function filtrarMapa(m: MapaAtajos, grupo: string | null, texto: string): GrupoMapa[] {
  const f = normalizar(texto)
  const pasa = (r: FilaMapa) => !f || normalizar([r.nombre, ...r.teclas.map((c) => c.join('+')), r.gesto ?? '', r.buscar ?? ''].join(' ')).includes(f)
  return m.grupos
    .filter((g) => grupo === null || g.id === grupo)
    .map((g) => ({ ...g, filas: g.filas.filter(pasa) }))
    .filter((g) => g.filas.length > 0)
}

/** Peso del encabezado de una sección y del renglón de más que pone el lugar de la cinta, en renglones de una fila. */
export const PESO_ENCABEZADO = 1.6
export const PESO_LUGAR = 0.5

/** Alto aproximado de una sección en renglones: su encabezado, una fila por orden y medio renglón más si dice su lugar. */
export const pesoDeGrupo = (g: Pick<GrupoMapa, 'filas'>): number => PESO_ENCABEZADO + g.filas.reduce((n, f) => n + 1 + (f.lugar ? PESO_LUGAR : 0), 0)

/**
 * Reparte las secciones (por su peso) en `n` columnas seguidas, con la columna más alta lo más baja posible. A igual alto, la primera lleva más.
 */
export function repartirEnColumnas(pesos: readonly number[], n: number): number[][] {
  const k = Math.max(1, Math.min(n, pesos.length))
  if (pesos.length === 0) return []
  const suma = [0]
  for (const p of pesos) suma.push(suma[suma.length - 1] + p)
  const m = pesos.length
  // mejor[j][i]: la columna más alta al repartir las primeras i secciones en j columnas; corte[j][i]: dónde empieza la última.
  const mejor: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(m + 1).fill(Infinity))
  const corte: number[][] = Array.from({ length: k + 1 }, () => new Array<number>(m + 1).fill(0))
  mejor[0][0] = 0
  for (let j = 1; j <= k; j++)
    for (let i = j; i <= m; i++)
      for (let c = i - 1; c >= j - 1; c--) {
        const v = Math.max(mejor[j - 1][c], suma[i] - suma[c])
        if (v < mejor[j][i] - 1e-9) {
          mejor[j][i] = v
          corte[j][i] = c
        }
      }
  const columnas: number[][] = []
  let i = m
  for (let j = k; j >= 1; j--) {
    const c = corte[j][i]
    columnas.unshift(Array.from({ length: i - c }, (_, t) => c + t))
    i = c
  }
  return columnas
}
