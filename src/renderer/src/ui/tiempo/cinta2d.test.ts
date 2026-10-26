import { describe, expect, it } from 'vitest'
import { estadoCintaDePrueba } from '../../prueba/cinta'
import { ANIMACIONES_DEL_SISTEMA, iconoDe, marcado, nombreAccesible, RAZON_MAS_LENTO, RAZON_MAS_RAPIDO, razonDeshabilitado, textoDe } from '../cinta/estado'
import { AYUDA_SIN_LIMITE, menuAvanzar, menuVelocidad, type ItemMenu } from '../menus'
import { LO_MAS_RAPIDO } from './velocidades'

const sinTecla = () => undefined
const items = (m: { entradas: { tipo: string }[] }) => m.entradas.filter((e): e is ItemMenu => e.tipo === 'item')

describe('la cinta de la 2D', () => {
  it('Más lento y Más rápido se deshabilitan en los extremos de la serie con su razón; Avanzar no actúa arrancando', () => {
    expect(razonDeshabilitado('mas-lento', estadoCintaDePrueba({ velocidad: 0.001 }), sinTecla)).toBe(RAZON_MAS_LENTO)
    expect(RAZON_MAS_LENTO).toBe('Ya está en la velocidad más lenta (0.001×).')
    expect(razonDeshabilitado('mas-rapido', estadoCintaDePrueba({ velocidad: LO_MAS_RAPIDO }), sinTecla)).toBe(RAZON_MAS_RAPIDO)
    expect(razonDeshabilitado('mas-rapido', estadoCintaDePrueba({ velocidad: 10 }), sinTecla)).toBeNull()
    expect(razonDeshabilitado('avanzar', estadoCintaDePrueba({ fase: 'arrancando' }), sinTecla)).toBe('La vista previa está arrancando.')
    // Detenida, F6 arranca en pausa: actúa.
    expect(razonDeshabilitado('avanzar', estadoCintaDePrueba(), sinTecla)).toBeNull()
  })

  it('Velocidad dice la vigente; Corriente, Animaciones y Sonido son botones de dos estados; el sonido tachado al silenciar', () => {
    expect(textoDe('velocidad', estadoCintaDePrueba({ velocidad: 0.001 }))).toBe('Velocidad 0.001×')
    expect(marcado('corriente', estadoCintaDePrueba({ corriente: true }))).toBe(true)
    expect(marcado('animaciones', estadoCintaDePrueba({ animaciones: false }))).toBe(false)
    expect(marcado('sonido', estadoCintaDePrueba())).toBe(true)
    expect(iconoDe('sonido', estadoCintaDePrueba({ sonido: false }))).toBe('sonidoApagado')
    expect(iconoDe('sonido', estadoCintaDePrueba())).toBe('sonido')
  })

  it('con el sistema pidiendo menos movimiento, Animaciones dice por qué está en pausa (el nombre contiene el texto visible)', () => {
    const e = estadoCintaDePrueba({ animaciones: false, movimientoReducido: true })
    expect(nombreAccesible('animaciones', e)).toBe(`Animaciones (${ANIMACIONES_DEL_SISTEMA.charAt(0).toLowerCase()}${ANIMACIONES_DEL_SISTEMA.slice(1)})`)
    expect(nombreAccesible('animaciones', e)).toContain(textoDe('animaciones', e))
    expect(nombreAccesible('animaciones', estadoCintaDePrueba({ animaciones: true, movimientoReducido: true }))).toBe('Animaciones')
  })

  it('el menú de Velocidad trae las ocho velocidades y «Sin límite de tiempo real», con la más cercana marcada si la vigente ya no existe', () => {
    const m = items(menuVelocidad(0.002))
    expect(m.map((x) => x.texto)).toEqual([
      '×10 (1 s = 10 s simulados)', '×5 (1 s = 5 s simulados)', '×2 (1 s = 2 s simulados)', '×1 (1 s = 1 s simulado)', '×0.5 (1 s = 500 ms simulados)',
      '×0.1 (1 s = 100 ms simulados)', '×0.01 (1 s = 10 ms simulados)', '×0.001 (1 s = 1 ms simulado)', 'Sin límite de tiempo real'
    ])
    expect(m.filter((x) => x.marcado).map((x) => x.id)).toEqual(['velocidad:0.001'])
    expect(m.every((x) => x.rol === 'opcion')).toBe(true)
    // Solo «Sin límite de tiempo real» lleva globo, y explica sin jerga qué hace.
    expect(m.filter((x) => x.ayuda).map((x) => x.texto)).toEqual(['Sin límite de tiempo real'])
    expect(m.find((x) => x.ayuda)!.ayuda).toBe(AYUDA_SIN_LIMITE)
    expect(AYUDA_SIN_LIMITE.split(' ').length).toBeLessThanOrEqual(30)
    expect(items(menuVelocidad(LO_MAS_RAPIDO)).find((x) => x.marcado)?.id).toBe('velocidad:Infinity')
  })

  it('el menú de Avanzar en el tiempo elige qué avanza (una división, un paso de cálculo, un tiempo fijo) y trae Avanzar hasta…', () => {
    const m = items(menuAvanzar(2e-3, 1, null, 2e-5))
    expect(m.map((x) => [x.id, x.texto, x.marcado])).toEqual([
      ['delta:automatico', 'Una división (100 ms)', false],
      ['delta:paso', 'Un paso de cálculo (20 µs)', false],
      ['delta:escrito', 'Tiempo fijo: 2 ms…', true],
      ['avanzar-hasta', 'Avanzar hasta…', undefined]
    ])
    // Las tres primeras son opciones (radio) y «Avanzar hasta…» una orden; cada una lleva su icono R1.
    expect(m.map((x) => x.rol)).toEqual(['opcion', 'opcion', 'opcion', undefined])
    expect(m.map((x) => [x.id, x.icono])).toEqual([['delta:automatico', 'reloj'], ['delta:paso', 'paso'], ['delta:escrito', 'tiempoAvanza'], ['avanzar-hasta', 'hastaT']])
    // Sin el paso a la mano, el texto no inventa una cifra; sin un tiempo escrito, «Tiempo fijo…» solo.
    expect(items(menuAvanzar('paso', 1, null))[1].texto).toBe('Un paso de cálculo')
    expect(items(menuAvanzar('paso', 1, null))[2].texto).toBe('Tiempo fijo…')
    expect(items(menuAvanzar('automatico', 0.01, 5e-4))[0].texto).toBe('Una división (500 µs)')
  })
})
