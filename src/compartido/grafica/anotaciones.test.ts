import { describe, expect, it } from 'vitest'
import { anotacionesParaDoc, anotacionesVacias, copiarAnotaciones, escribirAnotaciones, hayAnotaciones, idNuevo, leerAnotaciones, LARGO_MAX_NOTAS, MAX_TEXTOS, validarAnotaciones, type Anotaciones } from './anotaciones'

const base = (): Anotaciones => ({
  textos: [{ id: 't1', texto: 'Aquí satura', fx: 0.3, fy: 0.2, tam: 18, negrita: true, tono: 'negro' }],
  flechas: [{ id: 'f1', x1: 0.3, y1: 0.25, x2: 0.5, y2: 0.5, tono: 'naranja', grosor: 3 }],
  etiquetas: [{ id: 'e1', traza: 'A', x: 0.0025, dx: 20, dy: -30, tono: null }],
  estilos: { titulo: { texto: 'Mi título', tam: 22 } },
  ejes: Object.assign(Object.create(null), { x: { titulo: 'Tiempo (s)', tono: 'gris', peso: 'negrita', tam: 12 } })
})

describe('anotaciones: forma y límites', () => {
  it('lo vacío no cuenta como anotación y se guarda como «ninguna»', () => {
    expect(hayAnotaciones(anotacionesVacias())).toBe(false)
    expect(escribirAnotaciones(anotacionesVacias())).toEqual({ ok: true, texto: 'ninguna' })
    expect(anotacionesParaDoc(anotacionesVacias())).toBeUndefined()
  })

  it('escribir y leer dan lo mismo', () => {
    const e = escribirAnotaciones(base())
    expect(e.ok).toBe(true)
    if (e.ok) expect(leerAnotaciones(e.texto)).toEqual(base())
  })

  it('el texto guardado no pasa del tope y lo dice', () => {
    const a = base()
    a.textos = Array.from({ length: MAX_TEXTOS }, (_, i) => ({ id: `t${i + 1}`, texto: 'x'.repeat(120), fx: 0.123456, fy: 0.123456, tam: 16, negrita: false, tono: 'canal-a' as const }))
    a.flechas = Array.from({ length: MAX_TEXTOS }, (_, i) => ({ id: `f${i + 1}`, x1: 0.123456, y1: 0.123456, x2: 0.654321, y2: 0.654321, tono: 'canal-a' as const, grosor: 2.5 }))
    a.etiquetas = Array.from({ length: MAX_TEXTOS }, (_, i) => ({ id: `e${i + 1}`, traza: 'V(una_traza_larga)', x: 0.000123456789, dx: -123, dy: -123, tono: 'canal-a' as const }))
    for (let i = 0; i < 16; i++) a.ejes[`V(una_traza_larga_${i})`] = { titulo: 'y'.repeat(40), tono: 'canal-a', peso: 'negrita', tam: 12 }
    const e = escribirAnotaciones(a)
    expect(e.ok).toBe(false)
    if (!e.ok) expect(e.error).toContain(String(LARGO_MAX_NOTAS))
  })

  it('leer ignora basura sin reventar y descarta solo lo malo', () => {
    expect(leerAnotaciones('{no es json')).toEqual(anotacionesVacias())
    expect(leerAnotaciones('[1,2]')).toEqual(anotacionesVacias())
    const mixto = JSON.stringify({ textos: [{ id: 't1', texto: 'bien', fx: 0.1, fy: 0.1, tam: 16, negrita: false, tono: 'negro' }, { id: 't2', texto: 'mal tono', fx: 0.1, fy: 0.1, tam: 16, negrita: false, tono: '#ff0000' }, 7] })
    const r = leerAnotaciones(mixto)
    expect(r.textos.map((t) => t.id)).toEqual(['t1'])
  })

  it('un color escrito nunca pasa: solo el nombre de un tono', () => {
    const r = validarAnotaciones({ textos: [{ id: 't1', texto: 'x', fx: 0, fy: 0, tam: 16, negrita: false, tono: '#ff0000' }] })
    expect(r.ok).toBe(false)
    const f = validarAnotaciones({ flechas: [{ id: 'f1', x1: 0, y1: 0, x2: 1, y2: 1, tono: 'rgb(1,2,3)', grosor: 2 }] })
    expect(f.ok).toBe(false)
  })

  it('acota tamaños, grosores, posiciones y desplazamientos', () => {
    expect(validarAnotaciones({ textos: [{ id: 't1', texto: 'x', fx: 0, fy: 0, tam: 200, negrita: false, tono: 'negro' }] }).ok).toBe(false)
    expect(validarAnotaciones({ flechas: [{ id: 'f1', x1: 0, y1: 0, x2: 1, y2: 1, tono: 'negro', grosor: 99 }] }).ok).toBe(false)
    expect(validarAnotaciones({ textos: [{ id: 't1', texto: 'x', fx: 9, fy: 0, tam: 16, negrita: false, tono: 'negro' }] }).ok).toBe(false)
    expect(validarAnotaciones({ etiquetas: [{ id: 'e1', traza: 'A', x: 1, dx: 5000, dy: 0, tono: null }] }).ok).toBe(false)
    expect(validarAnotaciones({ etiquetas: [{ id: 'e1', traza: 'A', x: Number.NaN, dx: 0, dy: 0, tono: null }] }).ok).toBe(false)
  })

  it('el número de objetos tiene tope en estricto y se recorta al leer', () => {
    const muchos = Array.from({ length: MAX_TEXTOS + 3 }, (_, i) => ({ id: `t${i + 1}`, texto: 'x', fx: 0.1, fy: 0.1, tam: 16, negrita: false, tono: 'negro' }))
    expect(validarAnotaciones({ textos: muchos }).ok).toBe(false)
    expect(leerAnotaciones(JSON.stringify({ textos: muchos })).textos).toHaveLength(MAX_TEXTOS)
  })

  it('limpia caracteres de control y espacios del texto, y rechaza un texto vacío', () => {
    const r = validarAnotaciones({ textos: [{ id: 't1', texto: ' hola\u0007\n  mundo ', fx: 0, fy: 0, tam: 16, negrita: false, tono: 'negro' }] })
    expect(r.ok && r.valor.textos[0].texto).toBe('hola mundo')
    expect(validarAnotaciones({ textos: [{ id: 't1', texto: '  ', fx: 0, fy: 0, tam: 16, negrita: false, tono: 'negro' }] }).ok).toBe(false)
  })

  it('nombres repetidos se quedan con el primero y __proto__ no entra a los ejes', () => {
    const dos = { id: 't1', texto: 'a', fx: 0.1, fy: 0.1, tam: 16, negrita: false, tono: 'negro' }
    expect(leerAnotaciones(JSON.stringify({ textos: [dos, { ...dos, texto: 'b' }] })).textos).toHaveLength(1)
    const r = leerAnotaciones('{"ejes":{"__proto__":{"tono":"negro"},"A":{"tono":"negro"}}}')
    expect(Object.keys(r.ejes)).toEqual(['A'])
    expect(({} as Record<string, unknown>).tono).toBeUndefined()
  })

  it('un estilo de eje vacío o un título vacío no se guarda', () => {
    const r = validarAnotaciones({ ejes: { A: { titulo: '   ' }, B: { tono: 'negro' } } })
    expect(r.ok && Object.keys(r.valor.ejes)).toEqual(['B'])
  })

  it('copiar no comparte objetos con la original', () => {
    const a = base()
    const c = copiarAnotaciones(a)
    c.textos[0].texto = 'otro'
    c.ejes.x.tam = 20
    expect(a.textos[0].texto).toBe('Aquí satura')
    expect(a.ejes.x.tam).toBe(12)
  })

  it('un nombre nuevo no repite uno usado', () => {
    expect(idNuevo('t', ['t1', 't2'])).toBe('t3')
    expect(idNuevo('f', ['t1'])).toBe('f1')
  })
})

describe('título en blanco', () => {
  it('un texto vacío de un título se conserva como en blanco (no es el automático)', () => {
    const r = validarAnotaciones({ estilos: { subtitulo: { texto: '' } } })
    expect(r.ok && r.valor.estilos.subtitulo).toEqual({ texto: '' })
    expect(validarAnotaciones({ estilos: { subtitulo: {} } }).ok).toBe(true)
  })
})

describe('grosor propio de un eje', () => {
  it('se conserva dentro de rango y se descarta fuera', () => {
    expect(leerAnotaciones(JSON.stringify({ ejes: { x: { grosor: 2 } } })).ejes.x).toEqual({ grosor: 2 })
    expect(leerAnotaciones(JSON.stringify({ ejes: { x: { grosor: 9 } } })).ejes.x).toBeUndefined()
    expect(validarAnotaciones({ ejes: { x: { grosor: 9 } } }).ok).toBe(false)
  })
})
