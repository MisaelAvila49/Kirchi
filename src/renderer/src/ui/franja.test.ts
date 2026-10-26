// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { TEMAS } from '../../../compartido/ajustes'
import { contraste, hexARgba } from '../lienzo/paleta'
import { coloresDeTema } from './colores'
import { pinturaDe } from './cinta/pintar'
import { abreMedicionesAlSimular, ICONO_PESTAÑA, PESTAÑAS_FRANJA, pestañaAlSimular, pestañaInicialFranja, tonoDePestaña } from './franja'

describe('pestaña que se abre sola al simular', () => {
  const canal = (sonda: number | null) => ({ sonda })
  const osc = (...c: (number | null)[]) => new Map([['o1', { canales: c.map(canal) }]])
  const mm = new Map([['m1', {}]])
  const vacio = new Map<string, never>()

  it('el Osciloscopio gana si alguna entrada está conectada, aunque haya errores', () => {
    expect(pestañaAlSimular({ multimetros: mm, osciloscopios: osc(null, 3, null, null) }, 2)).toBe('osciloscopio')
  })
  it('un osciloscopio sin ninguna entrada conectada no cuenta, y un multímetro no abre la franja (abre Mediciones, a la derecha)', () => {
    expect(pestañaAlSimular({ multimetros: mm, osciloscopios: osc(null, null, null, null) }, 0)).toBeNull()
    expect(pestañaAlSimular({ multimetros: mm, osciloscopios: vacio }, 0)).toBeNull()
    expect(pestañaAlSimular({ multimetros: mm, osciloscopios: vacio }, 1)).toBe('registro')
  })
  it('Mediciones se abre sola solo si hay un multímetro conectado (la netlist no arma uno suelto)', () => {
    expect(abreMedicionesAlSimular({ multimetros: mm, osciloscopios: vacio })).toBe(true)
    expect(abreMedicionesAlSimular({ multimetros: mm, osciloscopios: osc(null, 3, null, null) })).toBe(true)
    expect(abreMedicionesAlSimular({ multimetros: vacio, osciloscopios: osc(null, 3, null, null) })).toBe(false)
    expect(abreMedicionesAlSimular(null)).toBe(false)
    expect(abreMedicionesAlSimular(undefined)).toBe(false)
  })
  it('sin instrumentos y con avisos de conexión: el Registro', () => {
    expect(pestañaAlSimular({ multimetros: vacio, osciloscopios: vacio }, 1)).toBe('registro')
    expect(pestañaAlSimular(null, 3)).toBe('registro')
  })
  it('sin instrumentos ni avisos: nada, la franja queda plegada', () => {
    expect(pestañaAlSimular({ multimetros: vacio, osciloscopios: vacio }, 0)).toBeNull()
    expect(pestañaAlSimular(undefined, 0)).toBeNull()
  })
})

describe('pestañas de la franja de instrumentos', () => {
  it('cada una con el icono y el tono de su instrumento', () => {
    expect(ICONO_PESTAÑA).toEqual({ osciloscopio: 'osciloscopio', graficas: 'graficas', registro: 'registro' })
    expect((['osciloscopio', 'graficas', 'registro'] as const).map(tonoDePestaña)).toEqual(['cian', 'violeta', 'gris'])
  })

  it('Osciloscopio, Gráficas y Registro, sin pestañas Multímetro ni Análisis (su ficha va en el riel derecho); abre en el Osciloscopio, o en el Registro si la librería trae errores', () => {
    expect(PESTAÑAS_FRANJA).toEqual([['osciloscopio', 'Osciloscopio'], ['graficas', 'Gráficas'], ['registro', 'Registro']])
    expect(pestañaInicialFranja(0)).toBe('osciloscopio')
    expect(pestañaInicialFranja(2)).toBe('registro')
  })

  // En la pestaña elegida el color de la orden pasa a su versión de texto (`--h: var(--h-borde)` en styles.css): con el
  // tono de siempre, el Osciloscopio en oscuro quedaba en 3.09:1 sobre su tinte cian.
  it.each(TEMAS)('%s: en la pestaña elegida, cada color de su icono queda en 3.5:1 o más sobre el tinte', (tema) => {
    const C = coloresDeTema(tema)
    for (const p of ['osciloscopio', 'graficas', 'registro'] as const) {
      const pintura = pinturaDe(ICONO_PESTAÑA[p], 'franja')
      const fondo = C[`${tonoDePestaña(p)}-suave`]
      const h = C[`${pintura.h}-texto`]
      // --h pasa al tono de texto; --h2 sigue en su tono (styles.css solo cambia --h).
      const color: Record<string, string> = { h, h2: C[pintura.h2!], borde: h, gris: C['ic-gris'] }
      // Con --h igual a --h-borde, un contorno se fundiría con su relleno: ningún icono de pestaña lleva capa de borde.
      expect((pintura.capas ?? []).some((c) => c.relleno === 'borde' || c.trazo === 'borde'), `${p} sin borde`).toBe(false)
      for (const capa of pintura.capas ?? []) {
        for (const papel of [capa.relleno, capa.trazo])
          // El detalle (contra) va sobre el relleno de la orden y el tinte (tenue) siempre lleva contorno: no tocan el fondo.
          if (papel && papel !== 'contra' && papel !== 'tenue') expect(contraste(hexARgba(color[papel]), hexARgba(fondo)), `${p} ${papel}`).toBeGreaterThanOrEqual(3.5)
        if (capa.relleno === 'contra' || capa.trazo === 'contra') expect(contraste(hexARgba(C['ic-contra']), hexARgba(h)), `${p} contra`).toBeGreaterThanOrEqual(3)
      }
    }
  })
})
