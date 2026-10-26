import { describe, expect, it } from 'vitest'
import type { ItemPlantilla } from './almacen'
import { acelerador, aceleradorCategoria, alternarPlegada, filasDelArbol, teclaArbol, type FilaArbol } from './arbol'

const nueva = (categoria: string, nombre: string, incluida = false, descripcion = ''): ItemPlantilla =>
  ({ clave: `${categoria}/${nombre}`, categoria, nombre, descripcion, incluida, fragmento: {} as never, vista: {} as never }) as ItemPlantilla

const items = [nueva('Filtros', 'Paso bajas'), nueva('Filtros', 'Paso altas'), nueva('Fuentes', 'Regulador'), nueva('Incluidas', 'Divisor', true)]
const texto = (x: FilaArbol) => (x.tipo === 'categoria' ? `# ${x.nombre} ${x.total}` : x.item.nombre)

describe('árbol del panel Plantillas', () => {
  it('las filas salen por categoría (propias en orden, Incluidas al final) con sus plantillas debajo', () => {
    const f = filasDelArbol(items, [], new Set(), false)
    expect(f.map(texto)).toEqual(['# Filtros 2', 'Paso altas', 'Paso bajas', '# Fuentes 1', 'Regulador', '# Incluidas 1', 'Divisor'])
  })

  it('una categoría plegada no lista sus plantillas, pero sí cuenta cuántas tiene', () => {
    const f = filasDelArbol(items, [], new Set(['Filtros']), false)
    expect(f.map(texto)).toEqual(['# Filtros 2', '# Fuentes 1', 'Regulador', '# Incluidas 1', 'Divisor'])
    expect(f[0]).toMatchObject({ abierta: false, total: 2 })
  })

  it('al buscar se abren todas las categorías y las vacías no aparecen; sin buscar las vacías sí', () => {
    const buscando = filasDelArbol([nueva('Filtros', 'Paso bajas')], ['Vacía'], new Set(['Filtros']), true)
    expect(buscando.map((x) => x.tipo)).toEqual(['categoria', 'plantilla'])
    const normal = filasDelArbol([nueva('Filtros', 'Paso bajas')], ['Vacía'], new Set(), false)
    expect(normal.map((x) => (x.tipo === 'categoria' ? x.nombre : '-'))).toEqual(['Filtros', '-', 'Vacía'])
    expect(normal[2]).toMatchObject({ total: 0 })
  })

  it('alternar una categoría la agrega o la quita de la lista que se recuerda, sin repetir', () => {
    expect(alternarPlegada([], 'A')).toEqual(['A'])
    expect(alternarPlegada(['A', 'B'], 'A')).toEqual(['B'])
    expect(alternarPlegada(['A'], 'B')).toEqual(['A', 'B'])
  })

  describe('teclado', () => {
    // 0 Filtros (abierta), 1 Paso altas, 2 Paso bajas, 3 Fuentes (plegada), 4 Incluidas (abierta), 5 Divisor
    const f: FilaArbol[] = filasDelArbol(items, [], new Set(['Fuentes']), false)

    it('las filas de la prueba son las que se dice', () => {
      expect(f.map(texto)).toEqual(['# Filtros 2', 'Paso altas', 'Paso bajas', '# Fuentes 1', '# Incluidas 1', 'Divisor'])
    })
    it('flechas abajo y arriba recorren las filas visibles y se detienen en los extremos', () => {
      expect(teclaArbol(f, 0, 'ArrowDown')).toEqual({ indice: 1 })
      expect(teclaArbol(f, 5, 'ArrowDown')).toEqual({ indice: 5 })
      expect(teclaArbol(f, 0, 'ArrowUp')).toEqual({ indice: 0 })
      expect(teclaArbol(f, 4, 'ArrowUp')).toEqual({ indice: 3 })
    })
    it('Inicio y Fin saltan a la primera y la última', () => {
      expect(teclaArbol(f, 2, 'Home')).toEqual({ indice: 0 })
      expect(teclaArbol(f, 2, 'End')).toEqual({ indice: 5 })
    })
    it('derecha abre una categoría plegada y, si ya está abierta, entra a su primera plantilla; en una plantilla no hace nada', () => {
      expect(teclaArbol(f, 3, 'ArrowRight')).toEqual({ indice: 3, alternar: 'Fuentes' })
      expect(teclaArbol(f, 0, 'ArrowRight')).toEqual({ indice: 1 })
      expect(teclaArbol(f, 1, 'ArrowRight')).toEqual({ indice: 1 })
    })
    it('izquierda pliega una categoría abierta, sube de una plantilla a su categoría y no hace nada en una plegada', () => {
      expect(teclaArbol(f, 0, 'ArrowLeft')).toEqual({ indice: 0, alternar: 'Filtros' })
      expect(teclaArbol(f, 2, 'ArrowLeft')).toEqual({ indice: 0 })
      expect(teclaArbol(f, 3, 'ArrowLeft')).toEqual({ indice: 3 })
    })
    it('Enter y espacio alternan una categoría y colocan una plantilla', () => {
      expect(teclaArbol(f, 0, 'Enter')).toEqual({ indice: 0, alternar: 'Filtros' })
      expect(teclaArbol(f, 3, ' ')).toEqual({ indice: 3, alternar: 'Fuentes' })
      expect(teclaArbol(f, 1, 'Enter')).toEqual({ indice: 1, colocar: true })
    })
    it('una tecla que no es del árbol no se atiende', () => {
      expect(teclaArbol(f, 1, 'a')).toBeNull()
    })
    it('F2 renombra y Supr borra solo una plantilla propia; en una incluida o una categoría no hacen nada', () => {
      expect(acelerador(f[1], 'F2')).toBe('renombrar')
      expect(acelerador(f[1], 'Delete')).toBe('borrar')
      expect(acelerador(f[5], 'F2')).toBeNull()
      expect(acelerador(f[5], 'Delete')).toBeNull()
      expect(acelerador(f[0], 'Delete')).toBeNull()
      expect(acelerador(f[1], 'a')).toBeNull()
    })
    it('una lista vacía no se sale de rango', () => {
      expect(teclaArbol([], 0, 'ArrowDown')).toEqual({ indice: 0 })
    })
  })
})

describe('aceleradorCategoria', () => {
  it('Supr sobre una categoría propia pide borrarla; las de Kirchi y las demás teclas no hacen nada', () => {
    const f = filasDelArbol([...items, nueva('Incluidas', 'Regulador 7805', true)], ['Propia'], new Set(), false)
    const propia = f.find((x) => x.tipo === 'categoria' && x.nombre === 'Propia')
    const incluida = f.find((x) => x.tipo === 'categoria' && x.nombre === 'Incluidas')
    expect(aceleradorCategoria(propia, 'Delete')).toBe('borrar')
    expect(aceleradorCategoria(propia, 'F2')).toBeNull()
    expect(aceleradorCategoria(incluida, 'Delete')).toBeNull()
    expect(aceleradorCategoria(f.find((x) => x.tipo === 'plantilla'), 'Delete')).toBeNull()
    expect(aceleradorCategoria(undefined, 'Delete')).toBeNull()
  })
})
