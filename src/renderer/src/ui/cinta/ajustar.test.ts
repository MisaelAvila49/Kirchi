import { describe, expect, it } from 'vitest'
import { crecerMientrasQuepa, ordenDeCrecimiento, ordenDePlegado, plegarHastaCaber } from './ajustar'

describe('plegar grupos por falta de ancho', () => {
  it('primero la prioridad más alta y, entre iguales, el de más a la izquierda', () => {
    expect(ordenDePlegado([3, 2, 1, 1])).toEqual([0, 1, 2, 3])
    expect(ordenDePlegado([1, 2, 1, 3])).toEqual([3, 1, 0, 2])
    expect(ordenDePlegado([])).toEqual([])
  })

  it('pliega de uno en uno hasta que cabe, nada si ya cabía y todos si nunca cabe', () => {
    // Inicio con grupos de 300, 220, 180 y 240 px (940 en total); un grupo plegado mide 60 px.
    const anchos = [300, 220, 180, 240]
    const orden = ordenDePlegado([3, 2, 1, 1])
    const plegar = (disponible: number) => {
      let k = 0
      const n = plegarHastaCaber(orden.length, (x) => (k = x), () => anchos.reduce((s, w, i) => s + (orden.slice(0, k).includes(i) ? 60 : w), 0) <= disponible)
      return { n, k }
    }
    expect(plegar(1000)).toEqual({ n: 0, k: 0 })
    expect(plegar(900)).toEqual({ n: 1, k: 1 })
    expect(plegar(600)).toEqual({ n: 2, k: 2 })
    expect(plegar(100)).toEqual({ n: 4, k: 4 })
  })
})

describe('solo se pliega lo que gana ancho', () => {
  it('un grupo que plegado mide lo mismo o más que abierto (Tema, un solo botón grande) no entra al orden', () => {
    // Vista: Zoom 120, Paneles 300, Tema 50 y Ventana 140 abiertos; plegado, cada uno mide unos 60.
    expect(ordenDePlegado([1, 2, 1, 3], [120, 300, 50, 140], [60, 62, 58, 64])).toEqual([3, 1, 0])
    expect(ordenDePlegado([1, 1], [60, 80], [60, 60])).toEqual([1])
  })
})

describe('crecer grupos cuando sobra ancho («Crecer»)', () => {
  it('crecen del número más bajo al más alto y solo los que tienen número; entre iguales, el de más a la derecha', () => {
    // Inicio: Archivo 4, Editar 3, Girar 2, Colocar 1, al revés del plegado.
    expect(ordenDeCrecimiento([4, 3, 2, 1])).toEqual([3, 2, 1, 0])
    expect(ordenDeCrecimiento([undefined, 1, undefined, 1])).toEqual([3, 1])
    expect(ordenDeCrecimiento([])).toEqual([])
  })

  it('crece de uno en uno mientras cabe y deshace el que desborda; nada si el primero ya no cabe', () => {
    // Grupos chicos de 200, 150, 120 y 180 px que crecidos miden 320, 240, 260 y 300.
    const chicos = [200, 150, 120, 180], grandes = [320, 240, 260, 300]
    const orden = ordenDeCrecimiento([4, 3, 2, 1])
    const crecer = (disponible: number) => {
      let k = 0
      const pasos: number[] = []
      const n = crecerMientrasQuepa(orden.length, (x) => (pasos.push(x), (k = x)), () => chicos.reduce((s, w, i) => s + (orden.slice(0, k).includes(i) ? grandes[i] : w), 0) <= disponible)
      return { n, k, pasos }
    }
    expect(crecer(2000)).toEqual({ n: 4, k: 4, pasos: [1, 2, 3, 4] })
    // 650 de base; Colocar crece a 770, Girar a 910; Editar (1000) ya no cabe en 950 y se deshace.
    expect(crecer(950)).toEqual({ n: 2, k: 2, pasos: [1, 2, 3, 2] })
    expect(crecer(700)).toEqual({ n: 0, k: 0, pasos: [1, 0] })
    expect(crecerMientrasQuepa(0, () => {}, () => true)).toBe(0)
  })
})
