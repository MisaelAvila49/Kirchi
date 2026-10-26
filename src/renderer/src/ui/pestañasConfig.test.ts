import { describe, expect, it } from 'vitest'
import { PESTAÑAS_CONFIG, panelDeConfig, pestañaInicial, pestañasVisibles } from './pestañasConfig'

describe('pestañas de Configuración', () => {
  it('son las seis del pedido, en ese orden', () => {
    expect(PESTAÑAS_CONFIG.map((p) => p.nombre)).toEqual(['General', 'Apariencia', 'Simulación', 'Archivos', 'Atajos', 'Tutorial'])
  })
  it('sin registro de atajos no hay pestaña Atajos', () => {
    expect(pestañasVisibles(false).map((p) => p.id)).not.toContain('atajos')
    expect(pestañasVisibles(true)).toHaveLength(6)
  })
  it('abre en General salvo que se pida otra que exista', () => {
    expect(pestañaInicial(undefined, true)).toBe('general')
    expect(pestañaInicial('atajos', true)).toBe('atajos')
    expect(pestañaInicial('atajos', false)).toBe('general')
  })
})

describe('aria-controls de las pestañas de Configuración', () => {
  it('solo la pestaña activa apunta a su panel (los demás no existen en el DOM)', () => {
    expect(PESTAÑAS_CONFIG.map((p) => panelDeConfig(p.id, 'archivos'))).toEqual([undefined, undefined, undefined, 'config-panel-archivos', undefined, undefined])
  })
})
