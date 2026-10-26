import { describe, expect, it } from 'vitest'
import type { PantallaSab } from '../../sim/protocoloInstrumentos'
import { NOMBRE_CORTO } from './medidasVista'
import { ayudaEjeTiempo, estadoDelDisparo, textoBarrido, textoEstado } from './panel'

describe('cabecera del osciloscopio', () => {
  const p = { tCaptura: 3.42, estado: 'disparado' } as PantallaSab
  it('dice si está en vivo, en pausa o detenida', () => {
    expect(textoEstado('corriendo', false, p, 'F5')).toBe('En vivo · disparado')
    expect(textoEstado('corriendo', false, { ...p, estado: 'esperando' }, 'F5')).toBe('En vivo · esperando disparo')
    expect(textoEstado('corriendo', false, null, 'F5')).toBe('En vivo · esperando disparo')
    expect(textoEstado('corriendo', false, { ...p, estado: 'sin-disparo' }, 'F5')).toBe('En vivo · sin disparo: ajusta el nivel o usa Auto')
    expect(textoEstado('pausada', true, p, 'F5')).toBe('En pausa · captura de t = 3.420 s')
    expect(textoEstado('detenida', true, p, 'F5')).toBe('Detenida · captura de t = 3.420 s')
    expect(textoEstado('detenida', false, null, 'F5')).toBe('Detenida: pulsa Simular (F5) para ver la señal')
    expect(textoEstado('detenida', false, null, undefined)).toBe('Detenida: pulsa Simular para ver la señal')
  })

  it('con la pantalla en pausa dice que la simulación sigue y de qué instante es lo que se ve', () => {
    expect(textoEstado('corriendo', false, p, 'F5', true)).toBe('Pantalla en pausa · la simulación sigue · captura de t = 3.420 s')
    // Sin congelar, igual que antes.
    expect(textoEstado('corriendo', false, p, 'F5', false)).toBe('En vivo · disparado')
  })

  it('el barrido en curso dice a qué instante de la simulación corresponde, solo en vivo', () => {
    expect(textoBarrido('corriendo', p)).toBe('barrido en t = 3.420 s')
    expect(textoBarrido('pausada', p)).toBeNull()
    expect(textoBarrido('corriendo', null)).toBeNull()
  })

  it('el eje del tiempo explica que con disparo se cuenta desde él', () => {
    expect(ayudaEjeTiempo({ tDisparo: 1 })).toContain('Con disparo, el tiempo se cuenta desde el disparo')
    expect(ayudaEjeTiempo({ tDisparo: Number.NaN })).toContain('tiempo de la simulación')
  })

  it('el estado del disparo junto a su título', () => {
    expect(estadoDelDisparo('corriendo', p)).toBe('Disparado')
    expect(estadoDelDisparo('pausada', p)).toBe('Detenido')
    expect(estadoDelDisparo('corriendo', null)).toBe('Esperando disparo')
  })

  it('las fichas usan el nombre corto', () => {
    expect(NOMBRE_CORTO.prom).toBe('Prom')
    expect(NOMBRE_CORTO.f).toBe('Frec')
    expect(NOMBRE_CORTO.vmax).toBe('Vmáx')
  })
})
