import { describe, expect, it } from 'vitest'
import { ERRORES_FAMILIAS, FAMILIAS, parametrosDeFamilia, validarFamilias } from './familias'

const cerca = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b))

describe('familias lógicas', () => {
  it('el archivo incluido no tiene errores y trae las tres familias con 74HC por omisión', () => {
    expect(ERRORES_FAMILIAS).toEqual([])
    expect(Object.keys(FAMILIAS.familias)).toEqual(['74HC', '74LS', 'CD4000B'])
    expect(FAMILIAS.omision).toBe('74HC')
  })

  it('a 5 V la 74HC da los parámetros de digital.lib (tarea 1)', () => {
    const p = parametrosDeFamilia(FAMILIAS.familias['74HC'], 5)
    expect([p.in_low, p.in_high, p.v_lo, p.v_hi]).toEqual([1.5, 3.5, 0, 5])
    expect(cerca(p.rise_delay, 5e-9) && cerca(p.fall_delay, 5e-9)).toBe(true)
    expect(cerca(p.t_rise, 20e-9 / 3) && cerca(p.r_lo, 55) && cerca(p.r_hi, 55)).toBe(true)
    expect(p.z_como).toBe('x')
    expect(p.r_in).toBeUndefined()
  })

  it('la 74LS da sus retardos distintos, su salida en dos resistencias y la carga de su entrada', () => {
    const p = parametrosDeFamilia(FAMILIAS.familias['74LS'], 5)
    expect([p.in_low, p.in_high, p.v_lo, p.v_hi, p.r_lo, p.r_hi]).toEqual([0.8, 2.0, 0.15, 3.42, 25, 68])
    expect(cerca(p.rise_delay, 3e-9) && cerca(p.fall_delay, 7e-9)).toBe(true)
    expect([p.t_rise, p.t_fall, p.r_in, p.v_in, p.z_como]).toEqual([12e-9, 6e-9, 5500, 2.6, 'uno'])
  })

  it('los umbrales de disparo se interpolan entre alimentaciones: la 74HC a 5 V da cerca de 2.8 y 1.7 V, y la 74LS sus dos valores', () => {
    const hc = parametrosDeFamilia(FAMILIAS.familias['74HC'], 5)
    expect([hc.vt_pos!, hc.vt_neg!].map((v) => Math.round(v * 100) / 100)).toEqual([2.77, 1.73])
    expect(parametrosDeFamilia(FAMILIAS.familias['74HC'], 9 as number).vt_pos).toBe(3.3)
    const ls = parametrosDeFamilia(FAMILIAS.familias['74LS'], 5)
    expect([ls.vt_pos, ls.vt_neg]).toEqual([1.7, 0.9])
    for (const f of Object.values(FAMILIAS.familias)) for (const p of f.entrada.schmitt ?? []) expect(p.vt_neg).toBeLessThan(p.vt_pos)
  })

  it('un punto de disparo con vt_neg mayor que vt_pos se rechaza', () => {
    const f = JSON.parse(JSON.stringify(FAMILIAS)) as typeof FAMILIAS
    f.familias['74HC'].entrada.schmitt = [{ vcc: 5, vt_pos: 1, vt_neg: 2 }]
    const r = validarFamilias(f)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores[0]).toContain('familias.74HC.entrada.schmitt[0]')
  })

  it('la CD4000B a 12 V interpola entre 10 y 15 V', () => {
    const p = parametrosDeFamilia(FAMILIAS.familias.CD4000B, 12)
    expect(cerca(p.in_low, 3.6) && cerca(p.in_high, 8.4) && p.v_hi === 12).toBe(true)
    expect(cerca(p.rise_delay, 31e-9) && cerca(p.t_rise, 46e-9) && cerca(p.r_lo, 170)).toBe(true)
  })

  it('fuera de sus puntos toma el más cercano y nunca da un retardo de cero', () => {
    const cd = FAMILIAS.familias.CD4000B
    expect(parametrosDeFamilia(cd, 3).t_rise).toBe(100e-9)
    expect(parametrosDeFamilia(cd, 18).t_rise).toBe(40e-9)
    const rara = { ...cd, puntos: [{ vcc: 5, tplh: 1e-9, tphl: 1e-9, t_rise: 10e-9, t_fall: 10e-9, r_lo: 1, r_hi: 1 }] }
    expect(parametrosDeFamilia(rara, 5).rise_delay).toBe(1e-12)
  })

  it('un archivo con errores dice el campo', () => {
    const r = validarFamilias({ omision: 'X', familias: { A: { nombre: 'A', alimentacion: { min: 5, max: 2, omision: 3 }, entrada: {}, salida: {}, puntos: [] } } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores).toContain('familias-logicas.json: omision debe ser el nombre de una familia')
      expect(r.errores.some((e) => e.startsWith('familias-logicas.json: familias.A.alimentacion'))).toBe(true)
      expect(r.errores.some((e) => e.startsWith('familias-logicas.json: familias.A.puntos'))).toBe(true)
    }
    expect(validarFamilias(null).ok).toBe(false)
  })

  it('un campo desconocido se rechaza con la sugerencia más cercana; los relativos van de 0 a 1 y v_in pide r_in', () => {
    const base = structuredClone(FAMILIAS) as unknown as { familias: Record<string, Record<string, Record<string, unknown>>> }
    const hc = base.familias['74HC']
    hc.entrada.vhi = 0.7
    hc.salida.voh = 1.2
    base.familias['74LS'].entrada = { vil: 0.8, vih: 2, relativa: false, al_aire: '1', v_in: 2.6 }
    const r = validarFamilias(base)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores).toContain('familias-logicas.json: familias.74HC.entrada.vhi no es un campo conocido (¿vih?)')
      expect(r.errores).toContain('familias-logicas.json: familias.74HC.salida con relativa: true lleva vol y voh entre 0 y 1')
      expect(r.errores).toContain('familias-logicas.json: familias.74LS.entrada v_in necesita r_in')
    }
  })
})
