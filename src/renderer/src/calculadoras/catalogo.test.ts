// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { motivoNombreInvalido } from '../../../compartido/plantillas'
import { libreriaDePrueba } from '../prueba/libreria'
import { CALCULADORAS, estadoInicial, resumenParaLector, type Contexto, type EstadoCalc } from './catalogo'

const lib = libreriaDePrueba().piezas
const ctx = (serie: Contexto['serie'] = 'E12'): Contexto => ({ serie, lib })
const def = (id: string) => CALCULADORAS.find((d) => d.id === id)!

describe('catálogo de calculadoras', () => {
  it.each(CALCULADORAS.map((d) => [d.id, d] as const))('%s: con sus valores de inicio da un resultado con circuito, sin errores', (_id, d) => {
    const ev = d.evaluar(estadoInicial(d), ctx())
    expect(ev.erroresCampo).toEqual({})
    expect(ev.error).toBeUndefined()
    expect(ev.salida!.valores.length).toBeGreaterThan(0)
    expect(ev.salida!.reales.length).toBeGreaterThan(0)
    expect(ev.salida!.armado.def.partes.length).toBeGreaterThan(3)
  })

  it('los textos no llevan rayas largas y los campos tienen valor de inicio, rótulo y id únicos', () => {
    for (const d of CALCULADORAS) {
      expect(new Set(d.campos.map((c) => c.id)).size, d.id).toBe(d.campos.length)
      for (const c of d.campos) {
        expect(c.rotulo, `${d.id}.${c.id}`).not.toMatch(/—/)
        expect(c.defecto, `${d.id}.${c.id}`).not.toBe('')
      }
      expect(`${d.nombre}${d.resumen}`).not.toMatch(/—/)
      const ev = d.evaluar(estadoInicial(d), ctx())
      const textos = [...(ev.salida?.avisos ?? []), ...(ev.salida?.reales.map((r) => r.valor + (r.detalle ?? '')) ?? [])]
      for (const t of textos) expect(t).not.toMatch(/—/)
    }
  })

  it('divisor: 9 V a 5 V con 10 kΩ muestra el exacto, el comercial y el desvío', () => {
    const ev = def('divisor').evaluar(estadoInicial(def('divisor')), ctx())
    const [r1, r2] = ev.salida!.valores
    expect(r1).toMatchObject({ rotulo: 'R1', exacto: '4.44 kΩ', comercial: '4.7 kΩ', desvio: '+5.8 %' })
    expect(r1.desvioNum).toBeCloseTo(0.058, 3)
    expect(r2.comercial).toBe('5.6 kΩ')
    expect(ev.salida!.reales[0].valor).toBe('4.89 V')
    expect(ev.salida!.reales[0].detalle).toBe('−2.1 % de lo pedido')
  })

  it('con la serie libre solo se muestra el valor exacto', () => {
    const ev = def('divisor').evaluar(estadoInicial(def('divisor')), ctx('libre'))
    expect(ev.salida!.valores[0]).toEqual({ rotulo: 'R1', exacto: '4.44 kΩ' })
    expect(ev.salida!.reales[0].valor).toBe('5 V')
  })

  it('la serie cambia lo comercial: E24 da otra pareja que E12', () => {
    const e12 = def('divisor').evaluar(estadoInicial(def('divisor')), ctx('E12'))
    const ev = def('divisor').evaluar(estadoInicial(def('divisor')), ctx('E24'))
    expect(ev.salida!.valores[0].comercial).toBe('4.3 kΩ')
    expect(ev.salida!.valores[0].comercial).not.toBe(e12.salida!.valores[0].comercial)
    expect(Math.abs(parseFloat(ev.salida!.reales[0].valor) - 5)).toBeLessThan(0.1)
  })

  it('un campo que no se lee da su error y no calcula', () => {
    const e: EstadoCalc = { ...estadoInicial(def('divisor')), vin: 'nueve', vout: '5 A' }
    const ev = def('divisor').evaluar(e, ctx())
    expect(ev.salida).toBeUndefined()
    expect(ev.erroresCampo.vin).toMatch(/voltios/)
    expect(ev.erroresCampo.vout).toMatch(/voltios/)
    expect(def('divisor').evaluar({ ...estadoInicial(def('divisor')), rtotal: '-5' }, ctx()).erroresCampo.rtotal).toMatch(/mayor que cero/)
    expect(def('astable').evaluar({ ...estadoInicial(def('astable')), d: '120' }, ctx()).erroresCampo.d).toMatch(/entre 0 y 100/)
  })

  it('una fórmula sin resultado da su explicación y no un campo con error', () => {
    const ev = def('divisor').evaluar({ ...estadoInicial(def('divisor')), vout: '12' }, ctx())
    expect(ev.erroresCampo).toEqual({})
    expect(ev.error).toMatch(/menor que Vin/)
    const astable = def('astable').evaluar({ ...estadoInicial(def('astable')), d: '30' }, ctx())
    expect(astable.error).toMatch(/diodo/)
  })

  it('el divisor por corriente y el filtro eligiendo R usan sus campos propios', () => {
    const porCorriente = def('divisor').evaluar({ ...estadoInicial(def('divisor')), modo: 'corriente', corriente: '1m', vin: '12', vout: '3.3' }, ctx('libre'))
    expect(porCorriente.salida!.valores.map((v) => v.exacto)).toEqual(['8.7 kΩ', '3.3 kΩ'])
    const porR = def('filtro').evaluar({ ...estadoInicial(def('filtro')), dado: 'R', r: '1k' }, ctx('libre'))
    expect(porR.salida!.valores[0]).toEqual({ rotulo: 'Capacitor', exacto: '159 nF' })
  })

  it('LED: la fuente corta explica por qué y una azul con 5 V da una resistencia', () => {
    const corto = def('led').evaluar({ ...estadoInicial(def('led')), color: 'azul', vs: '3' }, ctx())
    expect(corto.error).toMatch(/no alcanza/)
    const azul = def('led').evaluar({ ...estadoInicial(def('led')), color: 'azul', vs: '9' }, ctx())
    expect(azul.salida!.valores[0].comercial).toBe('560 Ω')
  })

  it('amplificador: con la fuente corta la salida se rotula recortada y el aviso da la entrada máxima', () => {
    const ev = def('amplificador').evaluar({ ...estadoInicial(def('amplificador')), vs: '5', vin: '1' }, ctx())
    const salida = ev.salida!.reales[1]
    expect(salida.valor).toBe('−4 V (recortada)')
    expect(salida.detalle).toBe('pedía −10 V')
    expect(ev.salida!.reales[0].detalle).toBe('0.0 % de lo pedido')
    expect(ev.salida!.avisos[0]).toMatch(/se recorta/)
    const bien = def('amplificador').evaluar(estadoInicial(def('amplificador')), ctx())
    expect(bien.salida!.reales[1].valor).toBe('−5 V')
  })

  it('el modelo del amplificador cambia el límite: el LM358 llega más abajo que el LM741', () => {
    const e = { ...estadoInicial(def('amplificador')), vs: '5', vin: '0.45' }
    const a741 = def('amplificador').evaluar({ ...e, modelo: 'LM741' }, ctx())
    const a358 = def('amplificador').evaluar({ ...e, modelo: 'LM358' }, ctx())
    expect(a741.salida!.reales[1].valor).toMatch(/recortada/)
    expect(a358.salida!.reales[1].valor).not.toMatch(/recortada/)
  })

  it('las listas de color y de modelo salen de la librería', () => {
    const colores = def('led').campos.find((c) => c.id === 'color')
    expect(colores?.tipo === 'lista' && colores.opciones(ctx()).map((o) => o.valor)).toEqual(['rojo', 'verde', 'azul', 'amarillo', 'blanco'])
    const modelos = def('amplificador').campos.find((c) => c.id === 'modelo')
    expect(modelos?.tipo === 'lista' && modelos.opciones(ctx()).map((o) => o.valor)).toContain('TLV9002')
  })

  it('el resumen para el lector es una frase corta: el resultado, el error de la fórmula o cuántos campos fallan', () => {
    const d = def('divisor')
    expect(resumenParaLector(d.evaluar(estadoInicial(d), ctx()))).toMatch(/^R1 .*R2 .*Vout real .* V$/)
    expect(resumenParaLector(d.evaluar({ ...estadoInicial(d), vout: '12' }, ctx()))).toMatch(/menor que Vin/)
    expect(resumenParaLector(d.evaluar({ ...estadoInicial(d), vin: 'x' }, ctx()))).toBe('Hay un campo con error.')
    expect(resumenParaLector(d.evaluar({ ...estadoInicial(d), vin: 'x', vout: 'y' }, ctx()))).toBe('Hay 2 campos con error.')
  })

  it('los valores fuera de lo razonable se rechazan con un mensaje claro y sin circuito', () => {
    const casos: [string, string, string][] = [
      ['divisor', 'rtotal', '1G'],
      ['divisor', 'rtotal', '0.5'],
      ['filtro', 'cap', '2'],
      ['filtro', 'cap', '0.1p'],
      ['filtro', 'fc', '1G'],
      ['filtro', 'fc', '1u'],
      ['astable', 'f', '1G'],
      ['led', 'i', '1000'],
      ['amplificador', 'vs', '1M'],
      ['amplificador', 'g', '1M']
    ]
    for (const [id, campo, texto] of casos) {
      const d = def(id)
      const ev = d.evaluar({ ...estadoInicial(d), [campo]: texto }, ctx())
      expect(ev.erroresCampo[campo], `${id}.${campo}=${texto}`).toMatch(/^Fuera de rango: va de .* a .*\.$/)
      expect(ev.salida).toBeUndefined()
    }
    // Los extremos de lo admitido sí se aceptan.
    const f = def('filtro')
    expect(f.evaluar({ ...estadoInicial(f), cap: '1p' }, ctx()).erroresCampo).toEqual({})
    expect(f.evaluar({ ...estadoInicial(f), cap: '1' }, ctx()).erroresCampo).toEqual({})
  })

  it('«Calculadoras» sirve como categoría libre de plantilla y los nombres propuestos sirven como nombre', () => {
    expect(motivoNombreInvalido('Calculadoras', 'categoría')).toBeNull()
    for (const d of CALCULADORAS) {
      const nombre = d.evaluar(estadoInicial(d), ctx()).salida!.armado.nombre
      expect(motivoNombreInvalido(nombre), nombre).toBeNull()
    }
    const amp = def('amplificador')
    expect(motivoNombreInvalido(amp.evaluar(estadoInicial(amp), ctx()).salida!.armado.nombre)).toBeNull()
  })
})

describe('ecuación y sustitución', () => {
  it('divisor: la ecuación con letras y debajo la sustitución con los valores comerciales y el resultado, en formato SI', () => {
    const ev = def('divisor').evaluar(estadoInicial(def('divisor')), ctx())
    expect(ev.salida!.ecuaciones).toEqual([
      { ecuacion: 'Vsalida = Vin · R2 / (R1 + R2)', sustitucion: 'Vsalida = 9 V · 5.6 kΩ / (4.7 kΩ + 5.6 kΩ) = 4.89 V' }
    ])
  })
  it('cada calculadora trae al menos una pareja, la sustitución repite el lado izquierdo, termina en un resultado con unidad y no lleva rayas largas', () => {
    for (const d of CALCULADORAS) {
      const ev = d.evaluar(estadoInicial(d), ctx())
      const eqs = ev.salida!.ecuaciones
      expect(eqs.length, d.id).toBeGreaterThan(0)
      for (const q of eqs) {
        const izq = q.ecuacion.split(' = ')[0]
        expect(q.sustitucion.startsWith(`${izq} = `), `${d.id}: ${q.sustitucion}`).toBe(true)
        expect(q.sustitucion, d.id).toMatch(/= [−\d.]+( ?(%|[kMGmµnp]?(Ω|F|Hz|V|A|s|W)))?$/)
        expect(`${q.ecuacion}${q.sustitucion}`, d.id).not.toMatch(/—|NaN|undefined/)
      }
    }
  })
  it('el amplificador inversor lleva el menos tipográfico en la ganancia y en la salida', () => {
    const ev = def('amplificador').evaluar(estadoInicial(def('amplificador')), ctx())
    expect(ev.salida!.ecuaciones[0].sustitucion).toBe('Ganancia = −10 kΩ / 1 kΩ = −10')
    expect(ev.salida!.ecuaciones[1].sustitucion).toBe('Vsalida = −10 · 500 mV = −5 V')
  })
  it('astable: dos fórmulas, frecuencia y ciclo, con el resultado de la ficha', () => {
    const ev = def('astable').evaluar(estadoInicial(def('astable')), ctx())
    const [f, d] = ev.salida!.ecuaciones
    expect(f.ecuacion).toBe('f = 1 / (ln 2 · (R1 + 2 · R2) · C)')
    expect(f.sustitucion.endsWith(` = ${ev.salida!.reales[0].valor}`)).toBe(true)
    expect(d.sustitucion.endsWith(` = ${ev.salida!.reales[1].valor}`)).toBe(true)
  })
})

describe('calculadora de filtros: un selector de tipo', () => {
  const filtros = (tipo: string, extra: Record<string, string> = {}) => def('filtro').evaluar({ ...estadoInicial(def('filtro')), tipo, ...extra }, ctx())
  it('hay una sola calculadora de filtros con los cinco tipos', () => {
    expect(CALCULADORAS.map((d) => d.id)).toEqual(['divisor', 'led', 'filtro', 'astable', 'monoestable', 'amplificador'])
    const tipo = def('filtro').campos.find((k) => k.id === 'tipo')!
    expect(tipo.tipo === 'lista' && tipo.opciones({ serie: 'E12', lib }).map((o) => o.valor)).toEqual(['bajas', 'altas', 'pasabanda', 'rechazabanda', 'notch'])
  })
  it('cada tipo muestra solo sus campos', () => {
    const visibles = (tipo: string) => def('filtro').campos.filter((k) => !k.visible || k.visible({ ...estadoInicial(def('filtro')), tipo })).map((k) => k.id)
    expect(visibles('bajas')).toEqual(['tipo', 'fc', 'dado', 'cap'])
    expect(visibles('pasabanda')).toEqual(['tipo', 'fl', 'fh', 'cap'])
    expect(visibles('rechazabanda')).toEqual(['tipo', 'flr', 'fhr', 'cap'])
    expect(visibles('notch')).toEqual(['tipo', 'f0', 'cap'])
  })
  it('con sus valores de inicio y E12 dan R y C comerciales, los cortes reales y su ecuación', () => {
    const pb = filtros('pasabanda').salida!
    expect(pb.valores.map((v) => v.rotulo)).toEqual(['R1', 'C1', 'R2', 'C2'])
    expect(pb.reales[2].rotulo).toBe('Frecuencia central')
    expect(pb.ecuaciones.map((q) => q.ecuacion)).toEqual(['fL = 1 / (2π · R1 · C1)', 'fH = 1 / (2π · R2 · C2)', 'f0 = √(fL · fH)'])
    const nt = filtros('notch').salida!
    expect(nt.ecuaciones[0].ecuacion).toBe('f0 = 1 / (2π · R · C)')
    expect(nt.reales[1]).toMatchObject({ rotulo: 'Q de la doble T', valor: '0.25' })
    const rb = filtros('rechazabanda').salida!
    expect(rb.valores.at(-1)!.rotulo).toBe('Sumador')
  })
  it('un corte superior menor que el inferior no calcula y lo explica', () => {
    const ev = filtros('pasabanda', { fl: '5k', fh: '1k' })
    expect(ev.salida).toBeUndefined()
    expect(ev.error).toMatch(/mayor que el inferior/)
  })
  it('el rechaza banda lee sus propios cortes y los errores van a sus campos', () => {
    expect(filtros('rechazabanda', { flr: '1k', fhr: '100' }).error).toBeDefined()
    const ev = filtros('rechazabanda', { flr: 'abc' })
    expect(Object.keys(ev.erroresCampo)).toEqual(['flr'])
    // Los cortes del pasa banda no cambian lo del rechaza banda.
    expect(filtros('rechazabanda', { fl: '5k', fh: '1k' }).salida).toBeDefined()
  })
})

describe('calculadora de amplificadores: un selector de tipo', () => {
  const amp = (tipo: string, extra: Record<string, string> = {}, serie: Contexto['serie'] = 'E12') => def('amplificador').evaluar({ ...estadoInicial(def('amplificador')), tipo, ...extra }, ctx(serie))
  const visibles = (tipo: string, extra: Record<string, string> = {}) =>
    def('amplificador').campos.filter((k) => !k.visible || k.visible({ ...estadoInicial(def('amplificador')), tipo, ...extra })).map((k) => k.id)

  it('el nombre, el resumen y las palabras de búsqueda cubren los seis tipos', () => {
    const d = def('amplificador')
    expect(d.nombre).toBe('Amplificadores con operacional')
    for (const p of ['inversor', 'no inversor', 'integrador', 'derivador', 'instrumentacion', 'sumador']) expect(d.palabras).toContain(p)
    const tipo = d.campos.find((k) => k.id === 'tipo')!
    expect(tipo.tipo === 'lista' && tipo.opciones({ serie: 'E12', lib }).map((o) => o.valor)).toEqual(['inversor', 'no-inversor', 'integrador', 'derivador', 'instrumentacion', 'sumador'])
  })
  it('cada tipo muestra solo sus campos', () => {
    expect(visibles('inversor')).toEqual(['tipo', 'g', 'rin', 'vs', 'vin', 'modelo'])
    expect(visibles('integrador')).toEqual(['tipo', 'rin', 'fu', 'conrf', 'gdc', 'fsen', 'vs', 'vin', 'modelo'])
    expect(visibles('integrador', { conrf: 'no' })).toEqual(['tipo', 'rin', 'fu', 'conrf', 'fsen', 'vs', 'vin', 'modelo'])
    expect(visibles('derivador')).toEqual(['tipo', 'fu', 'cap', 'cons', 'rs', 'fsen', 'vs', 'vin', 'modelo'])
    expect(visibles('derivador', { cons: 'no' })).toEqual(['tipo', 'fu', 'cap', 'cons', 'fsen', 'vs', 'vin', 'modelo'])
    expect(visibles('instrumentacion')).toEqual(['tipo', 'g', 'r', 'rd', 'vd', 'vcm', 'vs', 'modelo'])
    expect(visibles('sumador')).toEqual(['tipo', 'n', 'rf', 'g1', 'e1', 'g2', 'e2', 'vs', 'modelo'])
    expect(visibles('sumador', { n: '4' })).toEqual(['tipo', 'n', 'rf', 'g1', 'e1', 'g2', 'e2', 'g3', 'e3', 'g4', 'e4', 'vs', 'modelo'])
  })
  it('con sus valores de inicio y E12 cada tipo da sus valores, sus ecuaciones y su circuito', () => {
    const integ = amp('integrador').salida!
    expect(integ.valores.map((v) => v.rotulo)).toEqual(['Capacitor', 'Rf'])
    expect(integ.ecuaciones.map((q) => q.ecuacion)).toEqual(['fu = 1 / (2π · Rin · C)', 'fp = 1 / (2π · Rf · C)', 'Vsalida = Vin · Rf / (Rin · √(1 + (f / fp) · (f / fp)))'])
    expect(integ.ecuaciones[0].sustitucion).toBe('fu = 1 / (2π · 1 kΩ · 150 nF) = 1.06 kHz')
    expect(amp('integrador', { conrf: 'no' }).salida!.ecuaciones[1].sustitucion).toBe('Vsalida = 500 mV · 1.06 kHz / 1 kHz = 531 mV')
    const deriv = amp('derivador').salida!
    expect(deriv.valores.map((v) => v.rotulo)).toEqual(['Rf', 'Capacitor', 'Rs'])
    expect(deriv.ecuaciones.map((q) => q.ecuacion)).toEqual(['fu = 1 / (2π · Rf · C)', 'fs = 1 / (2π · Rs · C)', 'Vsalida = Vin · (f / fu) / √(1 + (f / fs) · (f / fs))'])
    const suma = amp('sumador').salida!
    expect(suma.valores.map((v) => v.rotulo)).toEqual(['Rf', 'R1', 'R2'])
    expect(suma.ecuaciones[0].ecuacion).toBe('Vsalida = −(Rf / R1 · V1 + Rf / R2 · V2)')
    expect(suma.ecuaciones[0].sustitucion).toBe('Vsalida = −(10 kΩ / 10 kΩ · 1 V + 10 kΩ / 4.7 kΩ · 500 mV) = −2.06 V')
    const instr = amp('instrumentacion').salida!
    expect(instr.ecuaciones[0].sustitucion).toBe('Ganancia = 1 + 2 · 10 kΩ / 2.2 kΩ = 10.1')
    expect(instr.ecuaciones[1].sustitucion).toBe('Vsalida = 10.1 · 10 mV = 101 mV')
    expect(instr.nota).toMatch(/rechazo del modo común/)
  })
  it('la saturación usa las caídas del modelo y rotula la salida recortada', () => {
    const integ = amp('integrador', { conrf: 'no', vin: '20' })
    expect(integ.salida!.reales[2].valor).toBe('14 V (recortada)')
    expect(integ.salida!.avisos.some((a) => /se recorta/.test(a))).toBe(true)
    const suma = amp('sumador', { e1: '5', e2: '5', vs: '5' })
    expect(suma.salida!.reales[1].valor).toBe('−4 V (recortada)')
    const lm358 = amp('sumador', { e1: '2', e2: '2', vs: '5', modelo: 'LM358' })
    expect(lm358.salida!.reales[1].valor).toBe('−5 V (recortada)')
    expect(amp('instrumentacion', { vcm: '13.8', vd: '100m' }).salida!.avisos[0]).toMatch(/amplificador de entrada/)
  })
  it('los errores van a su campo y los de la fórmula explican', () => {
    expect(Object.keys(amp('integrador', { fu: 'abc' }).erroresCampo)).toEqual(['fu'])
    expect(Object.keys(amp('derivador', { cap: '0' }).erroresCampo)).toEqual(['cap'])
    expect(amp('integrador', { gdc: '0.5' }).error).toMatch(/1 o más/)
    expect(amp('instrumentacion', { g: '1' }).error).toMatch(/mayor que 1/)
    expect(Object.keys(amp('sumador', { g2: '0' }).erroresCampo)).toEqual(['g2'])
    // Las entradas que no se ven no se leen: un error en la cuarta no estorba al sumador de dos.
    expect(amp('sumador', { e4: 'abc' }).erroresCampo).toEqual({})
  })
  it('las señales del sumador y el modo común aceptan negativos y los demás campos no', () => {
    expect(amp('sumador', { e2: '-0.5' }).salida!.reales[1].valor).toBe('63.8 mV')
    expect(amp('instrumentacion', { vcm: '-2' }).erroresCampo).toEqual({})
    expect(Object.keys(amp('instrumentacion', { vd: '-1m' }).erroresCampo)).toEqual(['vd'])
    expect(Object.keys(amp('inversor', { vin: '-1' }).erroresCampo)).toEqual(['vin'])
  })
  it('cada tipo genera un circuito con nombre y descripción válidos como plantilla', () => {
    for (const tipo of ['inversor', 'no-inversor', 'integrador', 'derivador', 'instrumentacion', 'sumador']) {
      const a = amp(tipo).salida!.armado
      expect(motivoNombreInvalido(a.nombre), a.nombre).toBeNull()
      expect(`${a.nombre}${a.descripcion}`).not.toMatch(/—/)
    }
  })
})
