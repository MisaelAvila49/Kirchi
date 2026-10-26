import { describe, expect, it } from 'vitest'
import { anotacionesVacias, type Anotaciones } from '../../../../../compartido/grafica/anotaciones'
import { cajaDeEtiqueta, medirEstimado, puntoDeValor, puntoGlobal, puntoMasCercano, textoDeEtiqueta, textoValorEje } from './etiquetas'
import { trazaLimpia, type GeometriaFigura } from './geometria'
import { confirmar, cerrarGesto, crearHistorial, deshacer, puedeDeshacer, puedeRehacer, rehacer } from './historial'
import { cajaDeSeleccion, cajaDeTexto, objetoEn, resolverEtiqueta } from './objetos'
import { acotar, ajustar, aFigura, aPantalla, desplazar, zoomEn } from './zoom'

// Una senoidal de 1 V y 1 kHz a 10 ms en una retícula de 400 px de ancho y 200 de alto que empieza en (60, 40).
const N = 201
const px = Float64Array.from({ length: N }, (_, i) => 60 + (i * 400) / (N - 1))
const t = Float64Array.from({ length: N }, (_, i) => (i * 0.01) / (N - 1))
const v = Float64Array.from(t, (s) => Math.sin(2 * Math.PI * 1000 * s))
const py = Float64Array.from(v, (y) => 140 - y * 80)
const geo = (): GeometriaFigura => ({
  ancho: 800,
  alto: 400,
  area: { x: 60, y: 40, w: 400, h: 200 },
  trazas: [trazaLimpia({ id: 'A', etiqueta: 'Canal A', tono: 'canal-a', unidadX: 's', unidadY: 'V' }, px, py, t, v)],
  objetos: [
    { id: 'titulo', tipo: 'fijo', etiqueta: 'Título', rect: { x: 8, y: 6, w: 40, h: 22 } },
    { id: 'eje:x', tipo: 'eje', etiqueta: 'Eje horizontal', rect: { x: 60, y: 10, w: 400, h: 28 } },
    { id: 'eje:A', tipo: 'eje', etiqueta: 'Eje de A', rect: { x: 10, y: 40, w: 50, h: 200 } }
  ]
})
const con = (p: Partial<Anotaciones>): Anotaciones => ({ ...anotacionesVacias(), ...p })

describe('puntos de una traza y etiquetas de valor', () => {
  it('se pega al punto más cercano, no solo al de x más cercana', () => {
    const g = geo().trazas[0]
    // Cresta de la senoidal: t = 0.25 ms, y = 1 V, a 60 + 0.025 * 400 = 70 px.
    const p = puntoMasCercano(g, 70.2, 60)!
    expect(p.y).toBeCloseTo(1, 1)
    expect(p.x).toBeCloseTo(0.00025, 4)
    expect(p.d).toBeLessThan(5)
  })
  it('con el puntero fuera de la traza, elige el punto vertical más cerca entre los de la misma columna', () => {
    const g = geo().trazas[0]
    const p = puntoMasCercano(g, 200, 500)!
    expect(Math.abs(p.py - 500)).toBeLessThan(Math.abs(g.py[0] - 500) + 1)
  })
  it('entre varias trazas elige la del punto más cercano, o solo la pedida', () => {
    const g = geo()
    const otra = trazaLimpia({ id: 'B', etiqueta: 'Canal B', tono: 'canal-b', unidadX: 's', unidadY: 'V' }, px, Float64Array.from(py, (y) => y - 50), t, v)
    const dos = [...g.trazas, otra]
    expect(puntoGlobal(dos, 200, py[100] - 52)!.traza.id).toBe('B')
    expect(puntoGlobal(dos, 200, py[100] + 1)!.traza.id).toBe('A')
    expect(puntoGlobal(dos, 200, py[100] - 52, 'A')!.traza.id).toBe('A')
    expect(puntoGlobal([], 1, 1)).toBeNull()
  })
  it('una etiqueta guardada vuelve a su punto por el valor horizontal', () => {
    const g = geo().trazas[0]
    const p = puntoDeValor(g, 0.0025)!
    expect(p.x).toBeCloseTo(0.0025, 5)
    expect(p.px).toBeCloseTo(60 + 0.25 * 400, 3)
    expect(puntoDeValor(g, -1)!.i).toBe(0)
    expect(puntoDeValor(g, 99)!.i).toBe(N - 1)
  })
  it('escribe x e y en unidades del SI', () => {
    expect(textoDeEtiqueta({ unidadX: 's', unidadY: 'V' }, 0.0025, 0.5)).toEqual(['x: 2.5 ms', 'y: 500 mV'])
    expect(textoDeEtiqueta({ unidadX: 'Hz', unidadY: 'dB' }, 1000, -3.01)).toEqual(['x: 1 kHz', 'y: −3.01 dB'])
  })
  it('el globo cuelga de su punto con su desplazamiento y mide lo que su texto más ancho', () => {
    const caja = cajaDeEtiqueta({ dx: 20, dy: -40 }, { px: 100, py: 100 }, ['x: 2.5 ms', 'y: 500 mV'], medirEstimado)
    expect(caja.x).toBe(120)
    expect(caja.y).toBe(60)
    expect(caja.w).toBeGreaterThan(40)
    expect(caja.h).toBe(2 * 14 + 8)
  })
  it('una traza sin datos finitos queda vacía y nunca revienta', () => {
    const x = trazaLimpia({ id: 'Z', etiqueta: 'Z', tono: 'gris', unidadX: '', unidadY: '' }, [1, Number.NaN, 3], [1, 2, Number.POSITIVE_INFINITY], [1, 2, 3], [1, 2, 3])
    expect(Array.from(x.px)).toEqual([1])
    expect(puntoMasCercano(trazaLimpia({ id: 'E', etiqueta: 'E', tono: 'gris', unidadX: '', unidadY: '' }, [], [], [], []), 1, 1)).toBeNull()
  })
  it('con muchísimos puntos conserva el último y no pasa del tope', () => {
    const n = 50000
    const a = Float64Array.from({ length: n }, (_, i) => i)
    const g = trazaLimpia({ id: 'M', etiqueta: 'M', tono: 'gris', unidadX: '', unidadY: '' }, a, a, a, a, 4000)
    expect(g.px.length).toBeLessThanOrEqual(4001)
    expect(g.px[g.px.length - 1]).toBe(n - 1)
  })
})

describe('qué hay bajo el puntero en la vista previa', () => {
  const base = (anot: Anotaciones, x: number, y: number) => objetoEn({ geo: geo(), anot, medir: medirEstimado, x, y })
  it('una traza se toma a pocos px de su línea y no lejos de ella', () => {
    expect(base(anotacionesVacias(), 160, py[100] + 3)).toEqual({ tipo: 'traza', id: 'A' })
    expect(base(anotacionesVacias(), 90, 238)).toBeNull()
  })
  it('un eje se toma en su banda y un título en su recuadro', () => {
    expect(base(anotacionesVacias(), 200, 20)).toEqual({ tipo: 'eje', id: 'eje:x' })
    expect(base(anotacionesVacias(), 30, 120)).toEqual({ tipo: 'eje', id: 'eje:A' })
    expect(base(anotacionesVacias(), 20, 15)).toEqual({ tipo: 'fijo', id: 'titulo' })
  })
  it('un texto puesto a mano gana a la traza que tiene debajo', () => {
    const anot = con({ textos: [{ id: 't1', texto: 'Pico', fx: 0.2, fy: 0.35, tam: 16, negrita: false, tono: 'negro' }] })
    expect(base(anot, 0.2 * 800 + 10, 0.35 * 400)).toEqual({ tipo: 'texto', id: 't1' })
  })
  it('una flecha se toma sobre su línea y una etiqueta, en su globo o su punto', () => {
    const anot = con({
      flechas: [{ id: 'f1', x1: 0.5, y1: 0.5, x2: 0.8, y2: 0.8, tono: 'negro', grosor: 2 }],
      etiquetas: [{ id: 'e1', traza: 'A', x: 0.0025, dx: 30, dy: -50, tono: null }]
    })
    expect(base(anot, 0.65 * 800, 0.65 * 400)).toEqual({ tipo: 'flecha', id: 'f1' })
    const r = resolverEtiqueta(anot.etiquetas[0], geo(), medirEstimado)!
    expect(base(anot, r.caja.x + 3, r.caja.y + 3)).toEqual({ tipo: 'etiqueta', id: 'e1' })
    expect(base(anot, r.punto.px + 2, r.punto.py)).toEqual({ tipo: 'etiqueta', id: 'e1' })
  })
  it('una etiqueta de una traza que ya no existe se ignora', () => {
    const anot = con({ etiquetas: [{ id: 'e1', traza: 'Z', x: 0, dx: 0, dy: 0, tono: null }] })
    expect(resolverEtiqueta(anot.etiquetas[0], geo(), medirEstimado)).toBeNull()
    expect(base(anot, 5, 5)).toBeNull()
  })
  it('el recuadro de selección de cada tipo existe', () => {
    const anot = con({ textos: [{ id: 't1', texto: 'Hola', fx: 0.5, fy: 0.5, tam: 20, negrita: true, tono: 'negro' }] })
    const g = geo()
    expect(cajaDeSeleccion({ tipo: 'texto', id: 't1' }, g, anot, medirEstimado)).toEqual(cajaDeTexto(anot.textos[0], g, medirEstimado))
    expect(cajaDeSeleccion({ tipo: 'eje', id: 'eje:x' }, g, anot, medirEstimado)).toEqual(g.objetos[1].rect)
    expect(cajaDeSeleccion({ tipo: 'traza', id: 'A' }, g, anot, medirEstimado)!.w).toBeCloseTo(400, 3)
    expect(cajaDeSeleccion({ tipo: 'texto', id: 'nada' }, g, anot, medirEstimado)).toBeNull()
  })
})

describe('historial de deshacer y rehacer', () => {
  it('deshace y rehace en orden y un cambio nuevo borra lo rehacible', () => {
    let h = crearHistorial(0)
    h = confirmar(h, 1)
    h = confirmar(h, 2)
    expect(h.presente).toBe(2)
    h = deshacer(h)
    expect(h.presente).toBe(1)
    expect(puedeRehacer(h)).toBe(true)
    h = rehacer(h)
    expect(h.presente).toBe(2)
    h = deshacer(deshacer(h))
    expect(puedeDeshacer(h)).toBe(false)
    h = confirmar(h, 9)
    expect(puedeRehacer(h)).toBe(false)
  })
  it('los cambios seguidos de un mismo gesto son un solo paso', () => {
    let h = crearHistorial(0)
    for (const x of [1, 2, 3, 4]) h = confirmar(h, x, 'deslizador')
    expect(h.pasado).toEqual([0])
    h = deshacer(h)
    expect(h.presente).toBe(0)
  })
  it('cerrar el gesto hace que el siguiente cambio sea otro paso', () => {
    let h = crearHistorial(0)
    h = confirmar(h, 1, 'g')
    h = cerrarGesto(h)
    h = confirmar(h, 2, 'g')
    expect(h.pasado).toEqual([0, 1])
  })
  it('un estado igual no agrega un paso y el historial tiene tope', () => {
    let h = crearHistorial(0)
    h = confirmar(h, 0)
    expect(h.pasado).toHaveLength(0)
    for (let i = 1; i <= 150; i++) h = confirmar(h, i)
    expect(h.pasado.length).toBe(100)
    expect(h.pasado[0]).toBe(50)
  })
})

describe('zoom y desplazamiento de la vista', () => {
  const caja = { w: 900, h: 500 }
  const fig = { fw: 800, fh: 400 }
  it('ajustar deja toda la figura dentro de la caja, centrada', () => {
    const v = ajustar(caja, fig)
    expect(v.k).toBeCloseTo(Math.min((900 - 48) / 800, (500 - 48) / 400), 6)
    expect(v.tx + fig.fw * v.k).toBeLessThanOrEqual(caja.w)
    expect(v.tx).toBeCloseTo(caja.w - (v.tx + fig.fw * v.k), 6)
  })
  it('acercar con la rueda deja quieto el punto bajo el puntero', () => {
    const v0 = ajustar(caja, fig)
    const [fx, fy] = aFigura(v0, 300, 200)
    const v1 = zoomEn(v0, 2, 300, 200, caja, fig)
    const [px1, py1] = aPantalla(v1, fx, fy)
    expect(px1).toBeCloseTo(300, 6)
    expect(py1).toBeCloseTo(200, 6)
    expect(v1.k).toBeCloseTo(v0.k * 2, 6)
  })
  it('el zoom tiene tope por los dos lados', () => {
    let v = ajustar(caja, fig)
    for (let i = 0; i < 30; i++) v = zoomEn(v, 2, 100, 100, caja, fig)
    expect(v.k).toBe(8)
    for (let i = 0; i < 30; i++) v = zoomEn(v, 0.5, 100, 100, caja, fig)
    expect(v.k).toBe(0.2)
  })
  it('no deja que la figura salga del todo de la caja', () => {
    const v = desplazar(ajustar(caja, fig), 99999, -99999, caja, fig)
    expect(v.tx).toBeLessThanOrEqual(caja.w)
    expect(v.ty + fig.fh * v.k).toBeGreaterThan(0)
    expect(acotar({ k: 1, tx: -5000, ty: 0 }, caja, fig).tx).toBeGreaterThan(-800)
  })
})

import { ajustarDecimalesX, pasoDeEjeX, cambiarAspecto, cambiarRango, agregarEtiqueta, agregarFlecha, agregarTexto, alternarTraza, borrarNota, editarTexto, estiloEje, estiloTitulo, hayLugar, moverNota, type EstadoEditor } from './edicion'
import { listaDeObjetos } from './objetos'
import { ASPECTO_OSCILOSCOPIO } from '../../../../../compartido/grafica/aspecto'
import { MAX_TEXTOS } from '../../../../../compartido/grafica/anotaciones'

const estado = (): EstadoEditor => ({ anot: anotacionesVacias(), aspecto: ASPECTO_OSCILOSCOPIO, trazas: {}, ocultas: [], adornos: { titulo: true, leyenda: true, marco: false, resplandor: false }, rango: null })

describe('operaciones del editor sobre el estado', () => {
  it('agrega, edita y borra sin tocar el estado anterior', () => {
    const s0 = estado()
    const t = agregarTexto(s0, 0.3, 0.2)!
    expect(s0.anot.textos).toHaveLength(0)
    expect(t.estado.anot.textos[0]).toMatchObject({ id: 't1', texto: 'Texto', tam: 16, negrita: false, tono: 'negro' })
    const s1 = editarTexto(t.estado, 't1', { texto: 'Pico', tam: 99, negrita: true, tono: 'naranja' })
    expect(s1.anot.textos[0]).toMatchObject({ texto: 'Pico', tam: 48, negrita: true, tono: 'naranja' })
    expect(t.estado.anot.textos[0].texto).toBe('Texto')
    expect(borrarNota(s1, { tipo: 'texto', id: 't1' }).anot.textos).toHaveLength(0)
    expect(borrarNota(s1, { tipo: 'traza', id: 'A' })).toBe(s1)
  })
  it('la posición se acota al lienzo con un margen y los nombres no se repiten', () => {
    const a = agregarTexto(estado(), 9, -9)!
    expect(a.estado.anot.textos[0].fx).toBe(1.25)
    expect(a.estado.anot.textos[0].fy).toBe(-0.25)
    const b = agregarTexto(a.estado, 0.5, 0.5)!
    expect(b.id).toBe('t2')
  })
  it('no pasa del número máximo de textos, flechas y etiquetas', () => {
    let s = estado()
    for (let i = 0; i < MAX_TEXTOS; i++) s = agregarTexto(s, 0.1, 0.1)!.estado
    expect(hayLugar(s, 'texto')).toBe(false)
    expect(agregarTexto(s, 0.1, 0.1)).toBeNull()
    expect(agregarFlecha(estado(), 0.1, 0.1, 0.5, 0.5)!.estado.anot.flechas[0]).toMatchObject({ grosor: 2, tono: 'negro' })
    expect(agregarEtiqueta(estado(), 'A', Number.NaN)).toBeNull()
  })
  it('mover un texto, una flecha o el globo de una etiqueta usa px de la figura', () => {
    const geoTam = { ancho: 800, alto: 400 }
    let s = agregarTexto(estado(), 0.5, 0.5)!.estado
    s = moverNota(s, { tipo: 'texto', id: 't1' }, 80, -40, geoTam)
    expect(s.anot.textos[0].fx).toBeCloseTo(0.6, 6)
    expect(s.anot.textos[0].fy).toBeCloseTo(0.4, 6)
    s = agregarFlecha(s, 0.2, 0.2, 0.4, 0.4)!.estado
    s = moverNota(s, { tipo: 'flecha', id: 'f1' }, 80, 40, geoTam)
    expect(s.anot.flechas[0]).toMatchObject({ x1: 0.3, x2: 0.5, y1: 0.3, y2: 0.5 })
    s = agregarEtiqueta(s, 'A', 0.002)!.estado
    s = moverNota(s, { tipo: 'etiqueta', id: 'e1' }, 10, 5, geoTam)
    expect(s.anot.etiquetas[0]).toMatchObject({ dx: 28, dy: -39 })
  })
  it('el estilo de un eje o de un título se guarda y, vacío, desaparece', () => {
    let s = estiloEje(estado(), 'x', { titulo: 'Tiempo', tono: 'gris', peso: 'negrita', tam: 40 })
    expect(s.anot.ejes.x).toEqual({ titulo: 'Tiempo', tono: 'gris', peso: 'negrita', tam: 24 })
    s = estiloEje(s, 'x', { titulo: null, tono: null, peso: null, tam: null })
    expect(Object.keys(s.anot.ejes)).toHaveLength(0)
    s = estiloTitulo(estado(), 'titulo', { texto: 'Mi título', tam: 5, negrita: true })
    expect(s.anot.estilos.titulo).toEqual({ texto: 'Mi título', tam: 8, negrita: true })
    s = estiloTitulo(s, 'titulo', { texto: null, tam: null, negrita: null })
    expect(s.anot.estilos.titulo).toBeUndefined()
  })
  it('la última traza encendida no se apaga', () => {
    let s = alternarTraza(estado(), 'A', ['A', 'B'])
    expect(s.ocultas).toEqual(['A'])
    expect(alternarTraza(s, 'B', ['A', 'B'])).toBe(s)
    s = alternarTraza(s, 'A', ['A', 'B'])
    expect(s.ocultas).toEqual([])
  })
  it('la lista de objetos nombra títulos, ejes, trazas y notas, para elegir con teclado', () => {
    let s = agregarTexto(estado(), 0.1, 0.1, 'Satura')!.estado
    s = agregarEtiqueta(s, 'A', 0.0025)!.estado
    const lista = listaDeObjetos(geo(), s.anot)
    expect(lista.map((i) => i.sel.tipo)).toEqual(['fijo', 'eje', 'eje', 'traza', 'texto', 'etiqueta'])
    expect(lista.map((i) => i.etiqueta)).toEqual(['Título', 'Eje horizontal', 'Eje de A', 'Traza Canal A', 'Texto «Satura»', 'Valor 1 de Canal A'])
  })
})

describe('decimales de cada eje en el editor', () => {
  it('la traza y el eje X guardan sus decimales', async () => {
    const { cambiarAspecto, cambiarTraza } = await import('./edicion')
    const e0 = { trazas: {}, aspecto: {} } as never
    const e1 = cambiarTraza(e0, 'V(a)', { decimales: 3 })
    expect((e1 as { trazas: Record<string, { decimales?: unknown }> }).trazas['V(a)'].decimales).toBe(3)
    const e2 = cambiarAspecto(e1, { decimalesX: 'auto' })
    expect((e2 as { aspecto: { decimalesX?: unknown } }).aspecto.decimalesX).toBe('auto')
  })
})

import { acomodarEje } from './edicion'
describe('ejes que se arrastran para acomodarlos', () => {
  const area = { x: 100, y: 20, w: 400, h: 200 }
  it('el eje vertical se pega a la izquierda, en medio o a la derecha según el ancho de la retícula', () => {
    const e0 = estado()
    const medio = acomodarEje(e0, 'eje:A', area, 300, 100, 'A', 'izquierda')
    expect(medio.trazas.A.lado).toBe('centro')
    const der = acomodarEje(medio, 'eje:A', area, 490, 100, 'A', 'centro')
    expect(der.trazas.A.lado).toBe('derecha')
    expect(acomodarEje(e0, 'eje:A', area, 110, 100, 'A', 'izquierda')).toBe(e0)
  })
  it('el eje horizontal sube, queda en medio o baja según el alto', () => {
    const e0 = estado()
    expect(acomodarEje(e0, 'eje:x', area, 300, 120, null, 'izquierda').aspecto.ejeX).toBe('centro')
    expect(acomodarEje(e0, 'eje:x', area, 300, 215, null, 'izquierda').aspecto.ejeX).toBe('abajo')
  })
  it('un eje vertical sin traza dueña no cambia nada', () => {
    const e0 = estado()
    expect(acomodarEje(e0, 'eje:Z', area, 300, 100, null, 'izquierda')).toBe(e0)
  })
})

describe('decimales del eje horizontal con el tramo', () => {
  const dom = (a: number, b: number) => ({ min: a, max: b })
  const paso = (a: number, b: number) => pasoDeEjeX('pantalla', dom(a, b), 's', null)!
  it('el paso de la pantalla sigue al tramo (diez divisiones, una cifra)', () => {
    expect(paso(0, 0.1)).toBeCloseTo(10, 5) // 10 ms por división, en ms
    expect(paso(0, 0.001)).toBeCloseTo(0.1, 5) // 0.1 ms en ms
  })
  it('al angostar el tramo sin elección no se guarda nada (las cifras siguen al paso)', () => {
    const e = estado()
    expect(e.aspecto.decimalesX).toBeUndefined()
    const r = ajustarDecimalesX(cambiarRango(e, { desde: 0, hasta: 0.0004 }), 0.005, 2)
    expect(r.aspecto.decimalesX).toBeUndefined()
  })
  it('un 2 elegido se queda en 2 con un tramo que aún distingue las marcas', () => {
    const e = cambiarAspecto(estado(), { decimalesX: 2 })
    expect(ajustarDecimalesX(e, 0.05, 2)).toBe(e)
  })
  it('«auto» sigue en «auto»', () => {
    const e = cambiarAspecto(estado(), { decimalesX: 'auto' })
    expect(ajustarDecimalesX(e, 0.0005, 2)).toBe(e)
  })
  it('un 2 elegido sube cuando el tramo ya no distingue las marcas', () => {
    const e = cambiarAspecto(estado(), { decimalesX: 2 })
    expect(ajustarDecimalesX(e, 0.005, 2).aspecto.decimalesX).toBe(3)
  })
})

describe('etiqueta de valor con los decimales del eje', () => {
  it('usa el prefijo y los decimales de cada eje de su traza', () => {
    const tr = { unidadX: 's', unidadY: 'V', formatoX: { prefijo: 'm', decimales: 3, omision: 2 }, formatoY: { prefijo: 'base', decimales: 1, omision: 1 } } as never
    expect(textoDeEtiqueta(tr, 0.0012346, 2.345)).toEqual(['x: 1.235 ms', 'y: 2.3 V'])
  })
})

describe('un valor con los decimales de su eje', () => {
  it('escribe el número en el prefijo del eje con sus decimales', () => {
    expect(textoValorEje(0.0123456, 's', { prefijo: 'm', decimales: 3, omision: 2 })).toBe('12.346 ms')
    expect(textoValorEje(1.5, 'V', { prefijo: 'base', omision: 1 })).toBe('1.5 V')
    expect(textoValorEje(-0.002, 'V', { prefijo: 'm', decimales: 0, omision: 1 })).toBe('−2 mV')
  })
  it('«auto» da cuatro cifras significativas y sin formato cae en el SI de siempre', () => {
    expect(textoValorEje(0.0123456, 's', { prefijo: 'm', decimales: 'auto', omision: 2 })).toBe('12.35 ms')
    expect(textoValorEje(0.0123456, 's')).toBe('12.35 ms')
  })
})
