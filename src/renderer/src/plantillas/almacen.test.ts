// @vitest-environment happy-dom
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Sesion } from '../../../main/recuperacion'
import { ServicioArchivos } from '../../../main/servicioArchivos'
import type { ApiPlantillas } from '../../../compartido/plantillas'
import { todo } from '../editor/seleccion'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba, RAIZ_COMPONENTES } from '../prueba/libreria'
import { DEFINICIONES } from '../prueba/definicionesPlantillas'
import { cargarPropias, filtrarPlantillas, LECTURAS_A_LA_VEZ, MAX_PROPIAS, plantillasIncluidas, porCategoria } from './almacen'
import { conDescripcion, empaquetarPlantilla, fragmentoDeSeleccion, LIMITE_PLANTILLA } from './plantilla'

const lib = libreriaDePrueba().piezas
let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-almacen-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** El servicio real de archivos, con la API que ve la interfaz (la misma forma que el preload). */
function api() {
  const raiz = join(dir, 'Plantillas')
  const s = new ServicioArchivos({
    dirDatos: join(dir, 'datos'),
    dialogos: { abrir: async () => null, guardar: async () => null, confirmarReemplazo: async () => false, confirmarRed: async () => false },
    recientes: () => [],
    ponerRecientes: () => {},
    abrirCarpeta: async () => {},
    argv: ['kirchi.exe'],
    sesion: new Sesion(join(dir, 'datos'), '11111111-2222-3333-4444-555555555555', 1),
    plataforma: 'win32',
    plantillas: raiz
  })
  const a: ApiPlantillas = {
    listar: async () => s.listarPlantillas(),
    leer: async (c, n) => s.leerPlantilla(c, n),
    guardar: async (c, n, b, r) => s.guardarPlantilla(c, n, b, r),
    renombrar: async (c, n, x) => s.renombrarPlantilla(c, n, x),
    mover: async (c, n, x) => s.moverPlantilla(c, n, x),
    borrar: async (c, n) => s.borrarPlantilla(c, n),
    borrarCategoria: async (c, ok) => s.borrarCategoria(c, ok),
    mostrar: async (c) => s.mostrarPlantillas(c)
  }
  return { a, raiz }
}

describe('almacén de plantillas', () => {
  it('lo que se guarda desde una selección vuelve de la carpeta con su ficha, su vista y su categoría', async () => {
    const { a } = api()
    const d = divisor()
    const f = fragmentoDeSeleccion(d, todo(d))!
    await a.guardar('Fuentes', 'Divisor mío', empaquetarPlantilla(f, { nombre: 'Divisor mío', descripcion: 'Con mis valores.' }, lib, '0.0.1'), false)
    const r = await cargarPropias(a, lib)
    expect(r.errores).toEqual([])
    expect(r.categorias).toEqual(['Fuentes'])
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ clave: 'Fuentes/Divisor mío', categoria: 'Fuentes', nombre: 'Divisor mío', descripcion: 'Con mis valores.', incluida: false })
    expect(r.items[0].fragmento.piezas).toHaveLength(4)
    expect(r.items[0].vista.lineas.length).toBeGreaterThan(0)
  })

  it('un archivo ajeno o dañado en la carpeta se reporta y no tira la lista', async () => {
    const { a, raiz } = api()
    const d = divisor()
    const f = fragmentoDeSeleccion(d, todo(d))!
    await a.guardar('A', 'buena', empaquetarPlantilla(f, { nombre: 'buena', descripcion: '' }, lib, '0.0.1'), false)
    mkdirSync(join(raiz, 'A'), { recursive: true })
    writeFileSync(join(raiz, 'A', 'rota.kir'), new Uint8Array([80, 75, 3, 4, 1, 2, 3]))
    writeFileSync(join(raiz, 'A', 'texto.kir'), 'esto no es un zip')
    const r = await cargarPropias(a, lib)
    expect(r.items.map((i) => i.nombre)).toEqual(['buena'])
    expect(r.errores).toHaveLength(2)
    expect(r.errores.join(' ')).not.toContain(raiz)
  })

  it('una carpeta vacía da una lista vacía; las categorías vacías se conservan', async () => {
    const { a, raiz } = api()
    expect(await cargarPropias(a, lib)).toMatchObject({ items: [], categorias: [], errores: [] })
    mkdirSync(join(raiz, 'Vacía'))
    expect((await cargarPropias(a, lib)).categorias).toEqual(['Vacía'])
  })
})

describe('administrar desde la interfaz', () => {
  const guardar = async (a: ApiPlantillas, categoria: string, nombre: string, descripcion = '') => {
    const d = divisor()
    const f = fragmentoDeSeleccion(d, todo(d), lib)!
    await a.guardar(categoria, nombre, empaquetarPlantilla(f, { nombre, descripcion }, lib, '0.0.1'), false)
  }
  it('cambiar la descripción de una propia (leer, reescribir solo la ficha y guardar encima) se ve en la lista y no cambia lo demás', async () => {
    const { a } = api()
    await guardar(a, 'Fuentes', 'Divisor', 'Antes.')
    const antes = (await cargarPropias(a, lib)).items[0]
    const leida = await a.leer('Fuentes', 'Divisor')
    if (!leida.ok) throw new Error(leida.error)
    const nuevo = conDescripcion(leida.bytes, 'Ahora dice otra cosa.')
    if (!nuevo.ok) throw new Error(nuevo.error)
    expect(await a.guardar('Fuentes', 'Divisor', nuevo.bytes, true)).toEqual({ ok: true })
    const despues = (await cargarPropias(a, lib)).items
    expect(despues).toHaveLength(1)
    expect(despues[0].descripcion).toBe('Ahora dice otra cosa.')
    expect(despues[0].fragmento).toEqual(antes.fragmento)
    expect(despues[0].vista).toEqual(antes.vista)
  })

  it('borrar una categoría: vacía se va sola, con plantillas pide confirmar y dice cuántas, y la lista ya no la trae', async () => {
    const { a, raiz } = api()
    await guardar(a, 'Filtros', 'Uno')
    await guardar(a, 'Filtros', 'Dos')
    await guardar(a, 'Fuentes', 'Divisor')
    mkdirSync(join(raiz, 'Vacía'))
    expect(await a.borrarCategoria('Vacía', false)).toEqual({ ok: true, borradas: 0 })
    const pedida = await a.borrarCategoria('Filtros', false)
    expect(pedida).toMatchObject({ ok: false, noVacia: 2 })
    expect((await cargarPropias(a, lib)).items).toHaveLength(3)
    expect(await a.borrarCategoria('Filtros', true)).toEqual({ ok: true, borradas: 2 })
    const r = await cargarPropias(a, lib)
    expect(r.categorias).toEqual(['Fuentes'])
    expect(r.items.map((i) => i.clave)).toEqual(['Fuentes/Divisor'])
  })

  it('«Incluidas» no se puede borrar ni crear como carpeta', async () => {
    const { a } = api()
    expect(await a.borrarCategoria('Incluidas', true)).toMatchObject({ ok: false })
    const d = divisor()
    const bytes = empaquetarPlantilla(fragmentoDeSeleccion(d, todo(d), lib)!, { nombre: 'x', descripcion: '' }, lib, '0.0.1')
    expect(await a.guardar('Incluidas', 'x', bytes, false)).toMatchObject({ ok: false })
  })
})

describe('cargarPropias: topes', () => {
  function falsa(n: number, bytesDe: (i: number) => number) {
    let activas = 0, maxActivas = 0, leidas = 0
    const a = {
      listar: async () => ({ categorias: [{ nombre: 'A', plantillas: Array.from({ length: n }, (_, i) => ({ categoria: 'A', nombre: `p${i}`, bytes: bytesDe(i) })) }], omitidas: 0 }),
      leer: async () => {
        leidas++
        maxActivas = Math.max(maxActivas, ++activas)
        await new Promise((r) => setTimeout(r, 1))
        activas--
        return { ok: false as const, error: 'x' }
      }
    } as unknown as ApiPlantillas
    return { a, stats: () => ({ maxActivas, leidas }) }
  }
  it('lee como mucho cuatro a la vez', async () => {
    const { a, stats } = falsa(30, () => 10)
    await cargarPropias(a, lib)
    expect(stats()).toEqual({ maxActivas: LECTURAS_A_LA_VEZ, leidas: 30 })
  })
  it('no lee las de más de 2 MB y lo dice', async () => {
    const { a, stats } = falsa(3, (i) => (i === 1 ? LIMITE_PLANTILLA + 1 : 10))
    const r = await cargarPropias(a, lib)
    expect(stats().leidas).toBe(2)
    expect(r.errores.filter((e) => e.startsWith('p1:'))[0]).toContain('2 MB')
  })
  it('tope global de 500 plantillas; el resto se cuenta como omitido', async () => {
    const { a, stats } = falsa(MAX_PROPIAS + 7, () => 10)
    const r = await cargarPropias(a, lib)
    expect(stats().leidas).toBe(MAX_PROPIAS)
    expect(r.omitidas).toBe(7)
  })
})

describe('plantillas incluidas', () => {
  it('traen trece en «Incluidas», con nombre y descripción, y se leen con las mismas reglas que un .kir', () => {
    const { items, errores } = plantillasIncluidas(lib)
    expect(errores).toEqual([])
    expect(items).toHaveLength(DEFINICIONES.length)
    expect(DEFINICIONES.length).toBe(13)
    expect(items.filter((i) => i.categoria === 'Incluidas')).toHaveLength(13)
    for (const i of items) {
      expect(i.incluida).toBe(true)
      expect(i.categoria).toBe('Incluidas')
      expect(i.descripcion.length).toBeGreaterThan(20)
      expect(i.fragmento.piezas.length).toBeGreaterThan(2)
      expect(i.vista.lineas.length).toBeGreaterThan(5)
    }
  })

  it('un archivo incluido dañado se omite y se dice', () => {
    const r = plantillasIncluidas(lib, { '/x/a.json': '{}', '/x/b.json': 'no es json' })
    expect(r.items).toEqual([])
    expect(r.errores).toHaveLength(2)
  })
})

describe('buscar y agrupar', () => {
  const { items } = plantillasIncluidas(lib)
  it('filtra por nombre y descripción sin acentos ni mayúsculas, todas las palabras', () => {
    expect(filtrarPlantillas(items, '').length).toBe(13)
    expect(filtrarPlantillas(items, 'ASTABLE').map((i) => i.nombre)).toEqual(['555 astable'])
    expect(filtrarPlantillas(items, '555').length).toBe(2)
    expect(filtrarPlantillas(items, 'filtro corte').length).toBe(2)
    expect(filtrarPlantillas(items, 'amplificador lm741').length).toBe(2)
    expect(filtrarPlantillas(items, 'zzz')).toEqual([])
  })

  it('agrupa por categoría: las propias en orden alfabético y las de Kirchi (Incluidas) al final', () => {
    const propias = items.slice(0, 2).map((i) => ({ ...i, categoria: 'Zeta', incluida: false }))
    const otras = items.slice(2, 3).map((i) => ({ ...i, categoria: 'Alfa', incluida: false }))
    const g = porCategoria([...items.slice(3), ...propias, ...otras], ['Vacía'])
    expect(g.map((c) => c.nombre)).toEqual(['Alfa', 'Vacía', 'Zeta', 'Incluidas'])
    expect(g.find((c) => c.nombre === 'Vacía')!.items).toEqual([])
  })
})
