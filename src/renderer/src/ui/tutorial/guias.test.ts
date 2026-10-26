// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_1 } from './capitulo1'
import { CAPITULO_2 } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
import { CAPITULO_5 } from './capitulo5'
import { enSombra, SITIOS, TOLERANCIA_SOMBRA } from './condiciones'
import type { CapituloDef, CtxTutorial } from './tipos'

const lib = libreriaDePrueba().piezas
const ctx = (d: Documento, extra: Partial<CtxTutorial> = {}): CtxTutorial => ({ doc: d, con: calcularConexiones(d, lib), lib, fase: 'detenida', centro: { x: 0, y: 0 }, ...extra })
const pieza = (id: string, tipo: string, x: number, y: number, rot: Pieza['rot'] = 0, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref: id.toUpperCase(), x, y, rot, espejo: false, props })
const paso = (c: CapituloDef, id: string) => c.pasos.find((p) => p.id === id)!
const conPiezas = (...ps: Pieza[]): Documento => {
  const d = documentoVacio()
  for (const p of ps) d.piezas[p.id] = p
  return d
}

describe('la sombra: tolerancia de la colocación', () => {
  it('cae a una unidad o menos en cada eje; el giro solo cuenta si la sombra lo pide', () => {
    const p = pieza('v', 'fuente-dc', 0, 0)
    expect(TOLERANCIA_SOMBRA).toBe(1)
    expect(enSombra({ ...p, x: 1, y: -1 }, { x: 0, y: 0 })).toBe(true)
    expect(enSombra({ ...p, x: 2, y: 0 }, { x: 0, y: 0 })).toBe(false)
    expect(enSombra({ ...p, x: 0, y: 3 }, { x: 0, y: 0 })).toBe(false)
    expect(enSombra({ ...p, rot: 90 }, { x: 0, y: 0 })).toBe(true)
    expect(enSombra({ ...p, rot: 90 }, { x: 0, y: 0, rot: 0 })).toBe(false)
  })
})

describe('capítulo 1: la pieza se cumple sobre su sombra y no en otro lugar', () => {
  it('la fuente de 5 V sobre su sombra cumple; a una celda de distancia, no, y el globo lo dice', () => {
    const f = paso(CAPITULO_1, 'fuente')
    expect(f.hecho(ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0))))).toBe(true)
    expect(f.hecho(ctx(conPiezas(pieza('v', 'fuente-dc', 1, 1))))).toBe(true)
    const lejos = ctx(conPiezas(pieza('v', 'fuente-dc', 2, 0)))
    expect(f.hecho(lejos)).toBe(false)
    expect(f.fueraDeSombra!(lejos)).toBe(true)
    expect(f.fueraDeSombra!(ctx(documentoVacio()))).toBe(false)
    expect(f.fueraDeSombra!(ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0))))).toBe(false)
  })

  it('una fuente de otro voltaje sobre la sombra no cumple ni cuenta como fuera de lugar', () => {
    const c = ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0, 0, { voltaje: '12' })))
    expect(paso(CAPITULO_1, 'fuente').hecho(c)).toBe(false)
    expect(paso(CAPITULO_1, 'fuente').fueraDeSombra!(c)).toBe(false)
  })

  it('la sombra aparece mientras falta la pieza, en su sitio y con su valor, y desaparece al colocarla', () => {
    const vacio = paso(CAPITULO_1, 'resistencia').guia!(ctx(documentoVacio()))
    expect(vacio.piezas).toEqual([{ tipo: 'resistencia', x: SITIOS.resistencia.x, y: SITIOS.resistencia.y, rot: 0, props: { valor: '220' } }])
    expect(paso(CAPITULO_1, 'resistencia').guia!(ctx(conPiezas(pieza('r', 'resistencia', 16, -4, 0, { valor: '220' })))).piezas).toEqual([])
    // Con la pieza en otro lugar la sombra sigue ahí.
    expect(paso(CAPITULO_1, 'resistencia').guia!(ctx(conPiezas(pieza('r', 'resistencia', 30, 10, 0, { valor: '220' })))).piezas).toHaveLength(1)
  })

  it('el LED se cumple con cualquier giro sobre su sombra y el paso de girar muestra la sombra girada', () => {
    expect(paso(CAPITULO_1, 'led').hecho(ctx(conPiezas(pieza('d', 'led', 32, 0, 270))))).toBe(true)
    expect(paso(CAPITULO_1, 'girar').guia!(ctx(conPiezas(pieza('d', 'led', 32, 0, 0)))).piezas).toEqual([{ tipo: 'led', x: 32, y: 0, rot: 90 }])
    expect(paso(CAPITULO_1, 'girar').guia!(ctx(conPiezas(pieza('d', 'led', 32, 0, 90)))).piezas).toEqual([])
  })

  it('los cables esperados se dibujan entre los pines y los ya hechos desaparecen', () => {
    const piezas = [pieza('v', 'fuente-dc', 0, 0), pieza('r', 'resistencia', 16, -4, 0, { valor: '220' }), pieza('d', 'led', 32, 0, 90)]
    const g = paso(CAPITULO_1, 'cables').guia!(ctx(conPiezas(...piezas)))
    expect(g.cables).toEqual([
      [{ x: 0, y: -4 }, { x: 12, y: -4 }],
      [{ x: 20, y: -4 }, { x: 32, y: -4 }],
      [{ x: 32, y: 4 }, { x: 0, y: 4 }]
    ])
    expect(paso(CAPITULO_1, 'cables').guia!(ctx(arranqueDeCapitulo('medir')!)).cables).toEqual([])
    const a = conPiezas(...piezas)
    a.cables.c1 = { id: 'c1', puntos: [{ x: 0, y: -4 }, { x: 12, y: -4 }] }
    expect(paso(CAPITULO_1, 'cables').guia!(ctx(a)).cables).toHaveLength(2)
  })

  it('la tierra: sombra y cable bajo la fuente; al colocarla solo queda el cable por hacer', () => {
    const sola = paso(CAPITULO_1, 'tierra').guia!(ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0))))
    expect(sola.piezas).toEqual([{ tipo: 'tierra', x: 0, y: 12, rot: 0 }])
    expect(sola.cables).toEqual([[{ x: 0, y: 4 }, { x: 0, y: 12 }]])
    const puesta = paso(CAPITULO_1, 'tierra').guia!(ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0), pieza('g', 'tierra', 0, 12))))
    expect(puesta.piezas).toEqual([])
    expect(puesta.cables).toEqual([[{ x: 0, y: 4 }, { x: 0, y: 12 }]])
  })

  it('simular y cambiar el valor dejan a la vista el LED, donde se ve el resultado', () => {
    const c = ctx(arranqueDeCapitulo('medir')!)
    for (const id of ['simular', 'valor']) {
      const f = paso(CAPITULO_1, id).focos!(c)
      expect(f, id).toHaveLength(1)
      expect(f[0].tipo).toBe('zona')
    }
    expect(paso(CAPITULO_1, 'simular').focos!(ctx(documentoVacio()))).toEqual([])
  })
})

describe('capítulos 2, 3 y 5: sombras y focos', () => {
  const ch2 = () => arranqueDeCapitulo('medir')!
  const ch3 = () => arranqueDeCapitulo('senales')!
  const ch4 = () => arranqueDeCapitulo('archivo')!

  it('el multímetro en serie muestra su sombra girada sobre el cable de abajo hasta que se pone', () => {
    const g = paso(CAPITULO_2, 'serie').guia!(ctx(ch2()))
    expect(g.piezas).toEqual([{ tipo: 'multimetro', x: 16, y: 4, rot: 90 }])
    expect(paso(CAPITULO_2, 'serie').guia!(ctx(ch3())).piezas).toEqual([])
  })

  it('al simular se ven juntos el multímetro del circuito y el lugar de la lectura', () => {
    const f = paso(CAPITULO_2, 'simular').focos!(ctx(ch3()))
    expect(f.map((o) => o.tipo)).toEqual(['zona', 'control'])
  })

  it('el generador se muestra girado 180° arriba de la fuente, con el cable del COM, hasta quedar conectado', () => {
    const g = paso(CAPITULO_3, 'generador').guia!(ctx(ch3()))
    expect(g.piezas).toMatchObject([{ tipo: 'generador', x: 0, y: -10, rot: 180 }])
    expect(g.cables).toHaveLength(1)
    expect(paso(CAPITULO_3, 'generador').guia!(ctx(ch4()))).toEqual({ piezas: [], cables: [] })
  })

  it('el capacitor muestra su sombra y sus dos cables; al quedar en el RC no queda nada por dibujar', () => {
    const g = paso(CAPITULO_3, 'capacitor').guia!(ctx(ch3()))
    expect(g.piezas).toMatchObject([{ tipo: 'capacitor', x: 40, y: 0, rot: 90, props: { valor: '100u' } }])
    expect(g.cables).toHaveLength(2)
    expect(paso(CAPITULO_3, 'capacitor').guia!(ctx(ch4()))).toEqual({ piezas: [], cables: [] })
  })

  it('el osciloscopio se cumple sobre su sombra y no en otro lugar', () => {
    const p = paso(CAPITULO_3, 'osciloscopio')
    const d = ch3()
    expect(p.hecho(ctx(d))).toBe(false)
    d.piezas.o = pieza('o', 'osciloscopio', 60, 20)
    expect(p.hecho(ctx(d))).toBe(false)
    expect(p.fueraDeSombra!(ctx(d))).toBe(true)
    // La sombra va dos puntos de rejilla (cuatro unidades) más abajo: a 20 quedaba pegada al cable de la tierra (y = 12).
    expect(SITIOS.osciloscopio).toEqual({ x: 28, y: 24 })
    d.piezas.o = pieza('o', 'osciloscopio', 28, 20)
    expect(p.hecho(ctx(d))).toBe(false)
    d.piezas.o = pieza('o', 'osciloscopio', 28, 24)
    expect(p.hecho(ctx(d))).toBe(true)
  })

  it('el capacitor se pone de pie como su sombra: uno sin girar sobre ella no cumple y el globo lo dice', () => {
    const p = paso(CAPITULO_3, 'capacitor')
    const d = ch3()
    d.piezas.c = pieza('c', 'capacitor', 40, 0, 0, { valor: '100u' })
    expect(p.fueraDeSombra!(ctx(d))).toBe(true)
    d.piezas.c = pieza('c', 'capacitor', 40, 0, 90, { valor: '100u' })
    expect(p.fueraDeSombra!(ctx(d))).toBe(false)
    expect(p.fueraDeSombra!(ctx(ch3()))).toBe(false)
    expect(p.texto).toContain('{tecla:girar}')
  })

  it('cuadrada y simular del osciloscopio señalan además el inspector y la franja', () => {
    expect(paso(CAPITULO_3, 'cuadrada').focos!(ctx(ch4())).map((o) => o.tipo)).toEqual(['control'])
    // Simular y la pestaña Osciloscopio son dos acciones: el botón, el osciloscopio del lienzo y la pantalla, a la vez.
    expect(paso(CAPITULO_3, 'simular').focos!(ctx(ch4()))).toEqual([
      expect.objectContaining({ tipo: 'zona' }),
      { tipo: 'control', selector: '[data-comando="simular"]', pestana: 'inicio', respaldo: '[data-grupo="vista-previa"] .boton-grupo' },
      expect.objectContaining({ tipo: 'control', selector: '#instrumentos-panel' })
    ])
  })

  it('el inspector se señala en el inspector (derecha) y nunca en el panel lateral de la Librería (izquierda)', () => {
    // Falla: el foco del capítulo 3, paso 2, caía en `#panel-lateral`, que es la Librería.
    const focos = paso(CAPITULO_3, 'cuadrada').focos!(ctx(ch4()))
    expect(focos).toEqual([{ tipo: 'control', selector: 'aside.inspector' }])
    for (const c of [CAPITULO_1, CAPITULO_2, CAPITULO_3, CAPITULO_5])
      for (const p of c.pasos) {
        const o = [p.objetivo(ctx(ch4())), ...(p.focos?.(ctx(ch4())) ?? [])]
        const usaLateral = o.some((x) => x.tipo === 'control' && x.selector.includes('#panel-lateral'))
        if (usaLateral) expect(p.abre, `${c.id}/${p.id}`).toBe('libreria')
      }
  })

  it('el capítulo 5 muestra la sombra de la resistencia de 4.7 kΩ a la derecha de todo el circuito', () => {
    const g = paso(CAPITULO_5, 'valor').guia!(ctx(arranqueDeCapitulo('trucos')!))
    expect(g.piezas).toEqual([{ tipo: 'resistencia', x: 70, y: -4, rot: 0, props: { valor: '4k7' } }])
  })
})
