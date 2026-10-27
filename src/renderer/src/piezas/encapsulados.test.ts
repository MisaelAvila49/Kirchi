import { describe, expect, it } from 'vitest'
import { ENCAPSULADOS, ERRORES_ENCAPSULADOS, validarEncapsulados } from './encapsulados'

const ok = { nombre: 'DIP de 8 patillas', patillas: 8, numerada: true, montaje: 'THT', paso: 2.54, filas: 2, separacion: 7.62, huella: 'Package_DIP:DIP-8_W7.62mm' }
const errores = (e: unknown) => {
  const v = validarEncapsulados({ encapsulados: { x: e } })
  return v.ok ? [] : v.errores
}

describe('encapsulados', () => {
  it('el archivo incluido carga sin errores y trae los de las piezas actuales', () => {
    expect(ERRORES_ENCAPSULADOS).toEqual([])
    for (const id of ['TO-92', 'TO-18', 'TO-220', 'DIP-8', 'DIP-14', 'DIP-16']) expect(ENCAPSULADOS.has(id)).toBe(true)
    expect(ENCAPSULADOS.get('DIP-14')).toMatchObject({ patillas: 14, filas: 2, separacion: 7.62, montaje: 'THT' })
  })

  it('acepta un encapsulado válido', () => {
    expect(errores(ok)).toEqual([])
  })

  it('rechaza una clave desconocida y sugiere la parecida', () => {
    expect(errores({ ...ok, separcion: 7.62 })).toEqual(['encapsulados.json: encapsulados.x.separcion clave desconocida, ¿quisiste decir «separacion»?'])
  })

  it('exige patillas enteras positivas y numerada booleana', () => {
    expect(errores({ ...ok, patillas: 0 })).toHaveLength(1)
    expect(errores({ ...ok, patillas: 2.5 })).toHaveLength(1)
    expect(errores({ ...ok, numerada: 'sí' })).toHaveLength(1)
  })

  it('el montaje es THT o SMD', () => {
    expect(errores({ ...ok, montaje: 'SMD' })).toEqual([])
    expect(errores({ ...ok, montaje: 'BGA' })).toEqual(['encapsulados.json: encapsulados.x.montaje debe ser «THT» o «SMD»'])
  })

  it('la huella debe ser un id de KiCad', () => {
    expect(errores({ ...ok, huella: 'DIP-8' })).toEqual(['encapsulados.json: encapsulados.x.huella debe ser un id de KiCad «Biblioteca:Nombre»'])
  })
})
