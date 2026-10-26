import { describe, expect, it } from 'vitest'
import { Sostenidos } from './sostenidos'

describe('Sostenidos: varios botones a la vez', () => {
  it('se pueden sostener dos botones con vías distintas', () => {
    const s = new Sostenidos()
    expect(s.apretar('a', 'enclavado', 'abierto')).toBe('nuevo')
    expect(s.apretar('b', 'puntero', 'abierto')).toBe('nuevo')
    expect(s.ids()).toEqual(['a', 'b'])
  })

  it('apretar uno ya sostenido no lo repite', () => {
    const s = new Sostenidos()
    s.apretar('a', 'Enter', 'abierto')
    expect(s.apretar('a', 'Espacio', 'abierto')).toBe('ya')
    expect(s.soltarVia('Enter').map((x) => x.id)).toEqual(['a'])
  })

  it('un clic en un botón enclavado lo pasa al puntero y se suelta al levantar', () => {
    const s = new Sostenidos()
    s.apretar('a', 'enclavado', 'abierto')
    expect(s.apretar('a', 'puntero', 'abierto')).toBe('del-enclavado')
    expect(s.soltarVia('puntero').map((x) => x.id)).toEqual(['a'])
    expect(s.ids()).toEqual([])
  })

  it('soltar por vía deja los demás', () => {
    const s = new Sostenidos()
    s.apretar('a', 'enclavado', 'x')
    s.apretar('b', 'puntero', 'y')
    expect(s.soltarVia('puntero')).toEqual([{ id: 'b', suelto: 'y', via: 'puntero' }])
    expect(s.ids()).toEqual(['a'])
  })

  it('perder el foco suelta todo salvo lo enclavado; detener lo suelta todo', () => {
    const s = new Sostenidos()
    s.apretar('a', 'enclavado', 'x')
    s.apretar('b', 'puntero', 'y')
    s.apretar('c', 'Enter', 'z')
    expect(s.soltarTransitorios().map((x) => x.id).sort()).toEqual(['b', 'c'])
    expect(s.ids()).toEqual(['a'])
    expect(s.soltarTodos().map((x) => x.id)).toEqual(['a'])
    expect(s.ids()).toEqual([])
  })

  it('soltar un enclavado por id', () => {
    const s = new Sostenidos()
    s.apretar('a', 'enclavado', 'x')
    s.apretar('b', 'enclavado', 'y')
    expect(s.estaEnclavado('a')).toBe(true)
    expect(s.soltarId('a')?.id).toBe('a')
    expect(s.estaEnclavado('a')).toBe(false)
    expect(s.estaEnclavado('b')).toBe(true)
  })
})
