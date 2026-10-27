import { describe, expect, it } from 'vitest'
import { PESTAÑAS_CONFIG, panelDeConfig, pestañaInicial, pestañasVisibles } from './pestañasConfig'

describe('pestañas de Configuración', () => {
  it('son las cinco de la maqueta, en ese orden', () => {
    expect(PESTAÑAS_CONFIG.map((p) => p.nombre)).toEqual(['General', 'Apariencia', 'Simulación', 'Asistente', 'Atajos'])
  })
  it('sin registro de atajos no hay pestaña Atajos, y sin asistente no hay pestaña Asistente', () => {
    expect(pestañasVisibles(false).map((p) => p.id)).not.toContain('atajos')
    expect(pestañasVisibles(true).map((p) => p.id)).not.toContain('asistente')
    expect(pestañasVisibles(true, true)).toHaveLength(5)
  })
  it('abre en General salvo que se pida otra que exista', () => {
    expect(pestañaInicial(undefined, true)).toBe('general')
    expect(pestañaInicial('atajos', true)).toBe('atajos')
    expect(pestañaInicial('atajos', false)).toBe('general')
    expect(pestañaInicial('asistente', true, true)).toBe('asistente')
    expect(pestañaInicial('asistente', true, false)).toBe('general')
  })
  it('las pedidas viejas (archivos, tutorial) llevan a General', () => {
    expect(pestañaInicial('archivos', true, true)).toBe('general')
    expect(pestañaInicial('tutorial', true, true)).toBe('general')
    expect(pestañaInicial('no-existe', true, true)).toBe('general')
  })
})

describe('aria-controls de las pestañas de Configuración', () => {
  it('solo la pestaña activa apunta a su panel (los demás no existen en el DOM)', () => {
    expect(PESTAÑAS_CONFIG.map((p) => panelDeConfig(p.id, 'asistente'))).toEqual([undefined, undefined, undefined, 'config-panel-asistente', undefined])
  })
})
