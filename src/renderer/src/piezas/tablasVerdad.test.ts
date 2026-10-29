// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarTabla, tablaHoja, type TablaDef } from './tablaVerdad'
import { retardoDe, tablaDelModelo } from './validarMsi'

// La tabla de cada chip, escrita en su pieza, contra la tabla de función de la hoja transcrita aparte: la misma salida
// en cada combinación de entradas. Los retardos de la pieza deben salir de los valores de la hoja.

const lib = libreriaDePrueba().piezas
const hojas = import.meta.glob('./__fixtures__/funciones/*.json', { eager: true, import: 'default' }) as Record<string, any>
const retardosHoja = import.meta.glob('./__fixtures__/retardos/*.json', { eager: true, import: 'default' }) as Record<string, any>
const hoja = (id: string) => hojas[`./__fixtures__/funciones/${id}.json`]
const hojaRetardos = (id: string) => retardosHoja[`./__fixtures__/retardos/${id}.json`]

/** La tabla del modelo de la pieza compilada: nombres, bits de entrada y una fila de dos bits por salida en cada combinación. */
function delModelo(id: string) {
  const m = lib.get(id)!.modelo as any
  const tabla = tablaDelModelo(m) as TablaDef
  const r = compilarTabla(tabla, [...tabla.columnas, ...tabla.salidas], { bidireccionales: m.bidireccionales ?? [] })
  expect(r.errores, id).toEqual([])
  return { m, tabla, filas: (r.filas as (number | bigint)[]).map(BigInt) }
}
const nivel = (fila: bigint, j: number) => Number((fila >> BigInt(2 * j)) & 3n)
/** Los bits de una combinación, la primera columna como el más significativo. */
const bitsDe = (i: number, n: number) => Array.from({ length: n }, (_, k) => (i >> (n - 1 - k)) & 1)

describe('la tabla de la pieza es la de la hoja', () => {
  it.each([
    'decodificador-138', 'decodificador-139', 'decodificador-4028', 'multiplexor-151', 'multiplexor-153', 'multiplexor-157',
    'codificador-148', 'sumador-283', 'bufer-244'
  ])('%s: mismas columnas, mismas salidas y el mismo valor en cada combinación', (id) => {
    const { tabla, filas } = delModelo(id)
    const h = hoja(id)
    expect(tabla.columnas).toEqual(h.columnas)
    expect(tabla.salidas).toEqual(h.salidas)
    const r = compilarTabla(tablaHoja(h), [...h.columnas, ...h.salidas])
    expect(r.errores).toEqual([])
    expect(filas).toEqual((r.filas as (number | bigint)[]).map(BigInt))
  })

  it('decodificador-7447: segmentos y salida BI/RBO de la hoja, con la AND cableada de BI/RBO', () => {
    const { tabla, filas } = delModelo('decodificador-7447')
    const h = hoja('decodificador-7447')
    // La hoja da el nivel de la patilla BI/RBO (columna BIRBO como entrada y como salida); el modelo solo la baja con LT alto,
    // RBI bajo y 0000, y la AND cableada con quien la fuerce desde fuera da el nivel de la hoja.
    expect(tabla.columnas.map((c) => c.replace('/', ''))).toEqual(h.columnas)
    expect(tabla.salidas.map((c) => c.replace('/', ''))).toEqual(h.salidas)
    const r = compilarTabla(tablaHoja(h), [...h.columnas, ...h.salidas])
    expect(r.errores).toEqual([])
    const hojaFilas = (r.filas as (number | bigint)[]).map(BigInt)
    const columnaBi = h.columnas.indexOf('BIRBO')
    const salidaBi = h.salidas.indexOf('BIRBO')
    for (let i = 0; i < 128; i++) {
      const bi = bitsDe(i, 7)[columnaBi]
      for (let j = 0; j < h.salidas.length; j++) {
        const m = nivel(filas[i], j)
        const esperado = nivel(hojaFilas[i], j)
        expect(j === salidaBi ? (bi ? m : 0) : m, `combinación ${i} salida ${h.salidas[j]}`).toBe(esperado)
      }
    }
    // Todas las salidas son de colector abierto.
    expect((lib.get('decodificador-7447')!.modelo as any).abiertas).toEqual(tabla.salidas)
  })

  it('transceptor-245: el lado emisor pasa al otro y el receptor queda en alta impedancia', () => {
    const { tabla, filas } = delModelo('transceptor-245')
    const h = hoja('transceptor-245')
    expect(tabla.columnas).toEqual(['OE', 'DIR', 'A', 'B'])
    for (let i = 0; i < 16; i++) {
      const [oe, dir, a, b] = bitsDe(i, 4)
      // Y de la hoja: OE alto aísla, DIR bajo va de B a A, DIR alto de A a B.
      const operacion = h.filas.map((f: string) => f.split(' > ').map((s) => s.trim())).find(([e]: string[]) => {
        const [eoe, edir] = e.split(' ')
        return (eoe === 'X' || +eoe === oe) && (edir === 'X' || +edir === dir)
      })[1]
      const esperado = operacion === 'aislado' ? [2, 2] : operacion === 'B->A' ? [b, 2] : [2, a]
      expect([nivel(filas[i], 0), nivel(filas[i], 1)], `OE ${oe} DIR ${dir} A ${a} B ${b}`).toEqual(esperado)
    }
  })

  it('comparador-magnitud-85: las 2,048 combinaciones siguen las condiciones y la cascada de la hoja', () => {
    const { tabla, filas } = delModelo('comparador-magnitud-85')
    const h = hoja('comparador-magnitud-85')
    expect(tabla.columnas).toEqual(['A0', 'A1', 'A2', 'A3', 'B0', 'B1', 'B2', 'B3', 'IA<B', 'IA=B', 'IA>B'])
    expect(tabla.salidas).toEqual(['OA<B', 'OA=B', 'OA>B'])
    const celdas = (s: string) => s.trim().split(/\s+/)
    // Una celda de condición puede ser el signo > : el separador es el último « > ».
    const reglas = h.filas.map((f: string) => [f.slice(0, f.lastIndexOf(' > ')), f.slice(f.lastIndexOf(' > ') + 3)].map(celdas))
    for (let i = 0; i < 2048; i++) {
      const v = bitsDe(i, 11)
      const a = [v[3], v[2], v[1], v[0]] // A3 a A0
      const b = [v[7], v[6], v[5], v[4]]
      const [menor, igual, mayor] = [v[8], v[9], v[10]]
      // Columnas de la hoja: A3:B3 a A0:B0 con >, < o =, y luego IA>B, IA<B, IA=B.
      const relacion = (k: number) => (a[k] > b[k] ? '>' : a[k] < b[k] ? '<' : '=')
      const dato = [relacion(0), relacion(1), relacion(2), relacion(3), String(mayor), String(menor), String(igual)]
      const regla = reglas.find(([entradas]: string[][]) => entradas.every((c, k) => c === 'X' || c === dato[k]))
      expect(regla, `combinación ${i}`).toBeDefined()
      const [og, ol, oe] = regla[1].map(Number)
      expect([nivel(filas[i], 0), nivel(filas[i], 1), nivel(filas[i], 2)], `combinación ${i}`).toEqual([ol, oe, og])
    }
  })
})

/** Las celdas de una fila de la hoja ("0-14", "X", "1") como lista de valores para una columna de `ancho` bits. */
function valoresDe(celda: string, ancho: number): number[] {
  const todos = Array.from({ length: 2 ** ancho }, (_, v) => v)
  if (celda === 'X') return todos
  const r = /^(\d+)-(\d+)$/.exec(celda)
  return r ? todos.filter((v) => v >= +r[1] && v <= +r[2]) : [+celda]
}

describe('las tablas de salida de los contadores son las de la hoja', () => {
  const contadores = ['contador-161', 'contador-163', 'contador-190', 'contador-193', 'contador-4017']
  it.each(contadores)('%s: cada fila de la hoja da el mismo valor en la tabla de la pieza', (id) => {
    const m = lib.get(id)!.modelo as any
    const tabla = tablaDelModelo(m) as TablaDef
    const bits = m.nucleo.bits as number
    const c = compilarTabla(tabla, [...tabla.columnas, ...tabla.salidas], { bitsEstado: bits })
    expect(c.errores, id).toEqual([])
    const filas = (c.filas as (number | bigint)[]).map(BigInt)
    const ancho = (col: string) => (col === 'estado' ? bits : 1)
    /** La salida `j` de la tabla de la pieza para un valor de cada columna. */
    const evaluar = (v: Record<string, number>) => {
      const indice = tabla.columnas.reduce((a, col) => a * 2 ** ancho(col) + v[col], 0)
      return tabla.salidas.map((_, j) => nivel(filas[indice], j))
    }
    const adicionales = hoja(id).adicionales as { columnas: string[]; salidas: string[]; filas: string[] }[]
    expect(adicionales.length, 'la hoja trae alguna tabla de salida').toBeGreaterThan(0)
    for (const a of adicionales) {
      // Las columnas de la hoja que son salidas de la pieza (MAX/MIN en el RCO del 190) filtran las combinaciones.
      const comoEntrada = a.columnas.filter((col) => tabla.columnas.includes(col))
      const comoFiltro = a.columnas.filter((col) => tabla.salidas.includes(col))
      expect(comoEntrada.length + comoFiltro.length, `${id}: columnas de la hoja ${a.columnas}`).toBe(a.columnas.length)
      for (const f of a.filas) {
        const [izq, der] = f.split(' > ').map((s) => s.trim().split(/\s+/))
        const libres = tabla.columnas.filter((col) => !a.columnas.includes(col))
        const rangos = tabla.columnas.map((col) => {
          const k = a.columnas.indexOf(col)
          return k >= 0 ? valoresDe(izq[k], ancho(col)) : libres.includes(col) ? valoresDe('X', ancho(col)) : []
        })
        let comparadas = 0
        const recorrer = (k: number, v: Record<string, number>) => {
          if (k === tabla.columnas.length) {
            const sal = evaluar(v)
            if (!comoFiltro.every((col) => izq[a.columnas.indexOf(col)] === 'X' || sal[tabla.salidas.indexOf(col)] === +izq[a.columnas.indexOf(col)])) return
            comparadas++
            a.salidas.forEach((s, j) => {
              if (tabla.salidas.includes(s)) expect(sal[tabla.salidas.indexOf(s)], `${id} fila «${f}» ${JSON.stringify(v)} salida ${s}`).toBe(+der[j])
            })
            return
          }
          for (const x of rangos[k]) recorrer(k + 1, { ...v, [tabla.columnas[k]]: x })
        }
        recorrer(0, {})
        expect(comparadas, `${id} fila «${f}»`).toBeGreaterThan(0)
      }
    }
  })
})

describe('los retardos de la pieza salen de los de la hoja', () => {
  /** Los números de la hoja de una familia: los típicos y los máximos de todos sus caminos (sin los de otro rango de temperatura). */
  function numeros(o: unknown, acc = { tip: [] as number[], max: [] as number[] }, clave = '') {
    if (typeof o === 'number') {
      if (/tip/i.test(clave) && !/vdd|vcc/i.test(clave)) acc.tip.push(o)
      else if (/max/i.test(clave) && !/85/.test(clave)) acc.max.push(o)
    } else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) numeros(v, acc, /^(tip|max)/.test(k) || k === 'vdd' ? k : clave)
    return acc
  }

  const ids = [
    'decodificador-138', 'decodificador-139', 'decodificador-7447', 'decodificador-4028', 'multiplexor-151', 'multiplexor-153',
    'multiplexor-157', 'codificador-148', 'sumador-283', 'comparador-magnitud-85', 'bufer-244', 'transceptor-245', 'contador-161', 'contador-163', 'contador-190', 'contador-193', 'contador-4017',
    'registro-164', 'registro-165', 'registro-595'
  ]
  const casos = ids.flatMap((id) => Object.keys((lib.get(id)!.modelo as any).retardos).map((familia) => [id, familia] as const))

  it.each(casos)('%s en %s: cada retardo es un típico de la hoja (o su máximo si no trae típico) y no pasa del máximo', (id, familia) => {
    const m = lib.get(id)!.modelo as any
    const juego = m.retardos[familia]
    const { tip, max } = numeros(hojaRetardos(id).familias[familia].caminos)
    expect(max.length, 'la hoja trae algún máximo').toBeGreaterThan(0)
    const tabla = tablaDelModelo(m) as TablaDef
    for (const salida of m.tipo === 'msi' ? Object.keys(m.salidas) : tabla.salidas) {
      const [subida, bajada] = retardoDe(juego, salida)!
      for (const d of [subida, bajada].map((s) => s * 1e9)) {
        expect(tip.length ? tip.some((t) => Math.abs(t - d) < 1e-6) : max.some((x) => Math.abs(x - d) < 1e-6), `${salida}: ${d} ns`).toBe(true)
        expect(d).toBeLessThanOrEqual(Math.max(...max) + 1e-6)
      }
    }
  })
})

describe('registro-595: las salidas pasan por OE', () => {
  it('con OE en alto las ocho salidas quedan en alta impedancia y con OE en bajo siguen al registro de almacenamiento', () => {
    const m = lib.get('registro-595')!.modelo as any
    const tabla = tablaDelModelo(m) as TablaDef
    expect(tabla.columnas).toEqual(['OE', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'])
    expect(tabla.salidas).toEqual(['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'])
    const r = compilarTabla(tabla, [...tabla.columnas, ...tabla.salidas, "QH'"], { bitsEstado: 8 })
    expect(r.errores).toEqual([])
    const filas = (r.filas as (number | bigint)[]).map(BigInt)
    for (let i = 0; i < 512; i++) {
      const [oe, ...a] = bitsDe(i, 9)
      for (let j = 0; j < 8; j++) expect(nivel(filas[i], j), `OE ${oe} almacén ${a.join('')} salida ${j}`).toBe(oe ? 2 : a[j])
    }
  })
})
