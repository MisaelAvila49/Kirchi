// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { CALCULADORAS, estadoInicial } from './catalogo'
import { leerFormula, partesDeSustitucion, textoDeFormula, type Nodo } from './formula'
import { libreriaDePrueba } from '../prueba/libreria'

const lib = libreriaDePrueba().piezas
const f = (t: string): Nodo[] => {
  const r = leerFormula(t)
  if (!r) throw new Error(`no se lee: ${t}`)
  return r
}

describe('fórmula en árbol', () => {
  it('Vin · R2 / (R1 + R2) es una fracción con el producto arriba y la suma sin paréntesis abajo', () => {
    const n = f('Vsalida = Vin · R2 / (R1 + R2)')
    expect(n.map((x) => x.t)).toEqual(['var', 'op', 'frac'])
    const fr = n[2] as Extract<Nodo, { t: 'frac' }>
    expect(fr.num.map((x) => x.t)).toEqual(['var', 'op', 'var'])
    expect(fr.den.map((x) => x.t)).toEqual(['var', 'op', 'var'])
    expect(fr.den.find((x) => x.t === 'op')).toMatchObject({ op: '+' })
  })

  it('una variable se parte en base y subíndice: Vsalida → V con «salida», R1 → R con «1», Ganancia queda entera', () => {
    const [v, , r] = f('Vsalida = R1')
    expect(v).toEqual({ t: 'var', base: 'V', sub: 'salida' })
    expect(r).toEqual({ t: 'var', base: 'R', sub: '1' })
    expect(f('Ganancia = 1')[0]).toEqual({ t: 'var', base: 'Ganancia' })
    expect(f('fc = 1')[0]).toEqual({ t: 'var', base: 'f', sub: 'c' })
    expect(f('f0 = 1')[0]).toEqual({ t: 'var', base: 'f', sub: '0' })
  })

  it('un número con unidad conserva el prefijo y la unidad; los porcentajes y las cifras sin unidad también', () => {
    const n = f('R = 4.7 kΩ + 100 nF + 60.5 % + 3')
    const nums = n.filter((x) => x.t === 'num')
    expect(nums).toEqual([
      { t: 'num', cifra: '4.7', unidad: 'kΩ' },
      { t: 'num', cifra: '100', unidad: 'nF' },
      { t: 'num', cifra: '60.5', unidad: '%' },
      { t: 'num', cifra: '3' }
    ])
  })

  it('2π es un número y una π pegados; ln 2 es una función con su argumento; √(…) lleva radicando', () => {
    expect(f('fc = 1 / (2π · R · C)').find((x) => x.t === 'frac')).toMatchObject({ den: [{ t: 'num', cifra: '2' }, { t: 'pi' }, { t: 'op', op: '·' }, { t: 'var' }, { t: 'op', op: '·' }, { t: 'var' }] })
    expect(f('T = ln 3 · R')[2]).toEqual({ t: 'fn', nombre: 'ln', arg: { t: 'num', cifra: '3' } })
    const r = f('f0 = √(fL · fH)')[2] as Extract<Nodo, { t: 'raiz' }>
    expect(r.t).toBe('raiz')
    expect(r.hijos.map((x) => x.t)).toEqual(['var', 'op', 'var'])
  })

  it('un menos al principio de un término es un signo, no una resta', () => {
    const n = f('Ganancia = −Rf / Rin')
    const fr = n[2] as Extract<Nodo, { t: 'frac' }>
    expect(fr.num[0]).toEqual({ t: 'op', op: '−', unario: true })
    expect(f('G = 1 + Rf / Rin').filter((x) => x.t === 'op').map((x) => (x as { unario?: boolean }).unario ?? false)).toEqual([false, false])
    expect(f('G = −10 kΩ / 1 kΩ')[2]).toMatchObject({ t: 'frac' })
  })

  it('lo que no se entiende da null y la ficha escribe el texto tal cual', () => {
    expect(leerFormula('Vsalida = ?? / 3')).toBeNull()
    expect(leerFormula('a = (b + c')).toBeNull()
  })

  it('textoDeFormula devuelve el texto plano equivalente (el que se lee en voz alta se arma aparte)', () => {
    for (const t of ['Vsalida = Vin · R2 / (R1 + R2)', 'fc = 1 / (2π · R · C)', 'Ganancia = −Rf / Rin', 'f0 = √(fL · fH)', 'T = ln 3 · R · C']) {
      expect(textoDeFormula(f(t))).toBe(t)
    }
  })

  it('una sustitución se parte en la fórmula con valores y su resultado: «lado = cuenta = resultado»', () => {
    const p = partesDeSustitucion('Vsalida = 9 V · 5.6 kΩ / (4.7 kΩ + 5.6 kΩ) = 4.89 V')!
    expect(p.lado).toEqual([{ t: 'var', base: 'V', sub: 'salida' }])
    expect(p.cuenta.some((x) => x.t === 'frac')).toBe(true)
    expect(p.resultado).toEqual({ t: 'num', cifra: '4.89', unidad: 'V' })
    const g = partesDeSustitucion('Ganancia = −10 kΩ / 1 kΩ = −10')!
    expect(g.resultado).toEqual({ t: 'num', cifra: '10', unidad: undefined, negativo: true })
    expect(partesDeSustitucion('R = 1')).toBeNull()
  })

  it('todas las ecuaciones y sustituciones de las calculadoras se leen (ninguna cae al texto plano)', () => {
    for (const d of CALCULADORAS) {
      const estados: Record<string, string>[] = d.id === 'amplificador' ? [{}, { tipo: 'no-inversor' }] : d.id === 'filtro' ? [{}, { tipo: 'altas' }] : [{}]
      for (const e of estados) {
        const ev = d.evaluar({ ...estadoInicial(d), ...e }, { serie: 'E12', lib })
        expect(ev.salida, `${d.id} ${JSON.stringify(e)}: ${ev.error ?? JSON.stringify(ev.erroresCampo)}`).toBeDefined()
        for (const q of ev.salida!.ecuaciones) {
          expect(leerFormula(q.ecuacion), `${d.id}: ${q.ecuacion}`).not.toBeNull()
          expect(partesDeSustitucion(q.sustitucion), `${d.id}: ${q.sustitucion}`).not.toBeNull()
          expect(textoDeFormula(f(q.ecuacion)), q.ecuacion).toBe(q.ecuacion)
        }
      }
    }
  })
})
