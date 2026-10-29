import { describe, expect, it } from 'vitest'
import { CAPITULO_4 } from './capitulo4'
import { pasoSobreDialogo } from './sobreDialogo'

const en = (id: string, cumplido: boolean) => ({ capitulo: CAPITULO_4, paso: CAPITULO_4.pasos.findIndex((p) => p.id === id), cumplido })

describe('el globo sobre el diálogo', () => {
  it('abrir la figura, ya cumplido, sube el globo sobre el diálogo que abrió; sin cumplir no', () => {
    expect(pasoSobreDialogo(en('abrir-figura', false))).toBe(false)
    expect(pasoSobreDialogo(en('abrir-figura', true))).toBe(true)
    expect(pasoSobreDialogo(en('abrir-esquema', true))).toBe(true)
  })
  it('un paso que lo pide por sí mismo siempre va encima; sin estado no', () => {
    expect(pasoSobreDialogo(en('figura-datos', false))).toBe(true)
    expect(pasoSobreDialogo(null)).toBe(false)
    expect(pasoSobreDialogo(en('filtros', true))).toBe(false)
  })
})
