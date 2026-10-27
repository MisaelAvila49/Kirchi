// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { patillasDeUnidad, unidadesDe } from '../doc/paquetes'
import type { Pieza } from '../doc/tipos'
import { numerosDePieza } from '../lienzo/numerosPatilla'
import { libreriaDePrueba } from '../prueba/libreria'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, props: Record<string, string>): Pieza => ({ id: 'p', tipo, ref: 'U1A', x: 0, y: 0, rot: 0, espejo: false, props })

describe('chips de varias unidades', () => {
  it('el búfer de tres estados trae sus cuatro unidades y sus pines siguen siendo A, OE e Y', () => {
    const def = lib.get('buffer-3-estados')!
    expect(def.pines.map((p) => p.id)).toEqual(['A', 'OE', 'Y'])
    for (const familia of ['74HC', '74LS']) {
      const u = unidadesDe(def, { familia })
      expect(u).toEqual({ nombres: ['A', 'B', 'C', 'D'], compartidos: [] })
      expect(patillasDeUnidad(def, { familia }, 'A')).toEqual({ A: '2', OE: '1', Y: '3' })
      expect(patillasDeUnidad(def, { familia }, 'B')).toEqual({ A: '5', OE: '4', Y: '6' })
      expect(patillasDeUnidad(def, { familia }, 'C')).toEqual({ A: '9', OE: '10', Y: '8' })
      expect(patillasDeUnidad(def, { familia }, 'D')).toEqual({ A: '12', OE: '13', Y: '11' })
    }
  })

  it('cada unidad del búfer muestra en el lienzo las patillas de su compuerta', () => {
    const def = lib.get('buffer-3-estados')!
    expect(numerosDePieza(pieza('buffer-3-estados', { familia: '74HC', paquete: 'U1', unidad: 'C' }), def)).toEqual({ A: '9', OE: '10', Y: '8' })
    expect(numerosDePieza(pieza('buffer-3-estados', { familia: '74LS', paquete: 'U1', unidad: 'D' }), def)).toEqual({ A: '12', OE: '13', Y: '11' })
  })

  it('el doble decodificador 139 trae dos unidades con las patillas de su mitad del encapsulado', () => {
    const def = lib.get('decodificador-139')!
    for (const familia of ['74HC', '74LS']) {
      expect(unidadesDe(def, { familia })).toEqual({ nombres: ['A', 'B'], compartidos: [] })
      expect(patillasDeUnidad(def, { familia }, 'A')).toEqual({ G: '1', A: '2', B: '3', Y0: '4', Y1: '5', Y2: '6', Y3: '7' })
      expect(patillasDeUnidad(def, { familia }, 'B')).toEqual({ G: '15', A: '14', B: '13', Y0: '12', Y1: '11', Y2: '10', Y3: '9' })
    }
  })

  it.each(['decodificador-138', 'decodificador-7447', 'decodificador-4028', 'multiplexor-151', 'multiplexor-153', 'multiplexor-157', 'codificador-148', 'sumador-283', 'comparador-magnitud-85', 'bufer-244', 'transceptor-245'])(
    '%s es una sola unidad con todas sus patillas en la presentación',
    (id) => {
      const def = lib.get(id)!
      const familia = def.props.find((p) => p.id === 'familia')!.defecto
      expect(unidadesDe(def, { familia })).toBeNull()
      const numeros = numerosDePieza(pieza(id, { familia }), def)!
      expect(Object.keys(numeros).sort()).toEqual(def.pines.map((p) => p.id).sort())
      // Una patilla por pin, sin repetir.
      expect(new Set(Object.values(numeros)).size).toBe(def.pines.length)
    }
  )
})
