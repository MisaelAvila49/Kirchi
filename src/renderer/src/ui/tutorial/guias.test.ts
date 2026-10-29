// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { arranqueDeCapitulo } from './arranques'
import { CAPITULO_2 } from './capitulo2'
import { CAPITULO_3 } from './capitulo3'
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

describe('capítulo 2: la pieza se cumple sobre su sombra y no en otro lugar', () => {
  it('la fuente de 5 V sobre su sombra cumple; a una celda de distancia, no, y el globo lo dice', () => {
    const f = paso(CAPITULO_2, 'fuente')
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
    expect(paso(CAPITULO_2, 'fuente').hecho(c)).toBe(false)
    expect(paso(CAPITULO_2, 'fuente').fueraDeSombra!(c)).toBe(false)
  })

  it('la sombra aparece mientras falta la pieza, en su sitio y con su valor, y desaparece al colocarla', () => {
    const vacio = paso(CAPITULO_2, 'resistencia').guia!(ctx(documentoVacio()))
    expect(vacio.piezas).toEqual([{ tipo: 'resistencia', x: SITIOS.resistencia.x, y: SITIOS.resistencia.y, rot: 0, props: { valor: '220' } }])
    expect(paso(CAPITULO_2, 'resistencia').guia!(ctx(conPiezas(pieza('r', 'resistencia', 16, -4, 0, { valor: '220' })))).piezas).toEqual([])
    expect(paso(CAPITULO_2, 'resistencia').guia!(ctx(conPiezas(pieza('r', 'resistencia', 30, 10, 0, { valor: '220' })))).piezas).toHaveLength(1)
  })

  it('el LED se arrastra a su sombra, cumple con cualquier giro y el paso de girar muestra la sombra girada', () => {
    expect(paso(CAPITULO_2, 'led').hecho(ctx(conPiezas(pieza('d', 'led', 32, 0, 270))))).toBe(true)
    expect(paso(CAPITULO_2, 'led').texto).toContain('{gesto:arrastrar}')
    expect(paso(CAPITULO_2, 'led').abre).toBe('libreria')
    expect(paso(CAPITULO_2, 'girar').guia!(ctx(conPiezas(pieza('d', 'led', 32, 0, 0)))).piezas).toEqual([{ tipo: 'led', x: 32, y: 0, rot: 90 }])
    expect(paso(CAPITULO_2, 'girar').guia!(ctx(conPiezas(pieza('d', 'led', 32, 0, 90)))).piezas).toEqual([])
  })

  it('los cables esperados se dibujan entre los pines y los ya hechos desaparecen', () => {
    const piezas = [pieza('v', 'fuente-dc', 0, 0), pieza('r', 'resistencia', 16, -4, 0, { valor: '220' }), pieza('d', 'led', 32, 0, 90)]
    const g = paso(CAPITULO_2, 'cables').guia!(ctx(conPiezas(...piezas)))
    expect(g.cables).toEqual([
      [{ x: 0, y: -4 }, { x: 12, y: -4 }],
      [{ x: 20, y: -4 }, { x: 32, y: -4 }],
      [{ x: 32, y: 4 }, { x: 0, y: 4 }]
    ])
    expect(paso(CAPITULO_2, 'cables').guia!(ctx(arranqueDeCapitulo('medir-senales')!)).cables).toEqual([])
    const a = conPiezas(...piezas)
    a.cables.c1 = { id: 'c1', puntos: [{ x: 0, y: -4 }, { x: 12, y: -4 }] }
    expect(paso(CAPITULO_2, 'cables').guia!(ctx(a)).cables).toHaveLength(2)
  })

  it('la tierra: sombra y cable bajo la fuente; al colocarla solo queda el cable por hacer', () => {
    const sola = paso(CAPITULO_2, 'tierra').guia!(ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0))))
    expect(sola.piezas).toEqual([{ tipo: 'tierra', x: 0, y: 12, rot: 0 }])
    expect(sola.cables).toEqual([[{ x: 0, y: 4 }, { x: 0, y: 12 }]])
    const puesta = paso(CAPITULO_2, 'tierra').guia!(ctx(conPiezas(pieza('v', 'fuente-dc', 0, 0), pieza('g', 'tierra', 0, 12))))
    expect(puesta.piezas).toEqual([])
    expect(puesta.cables).toEqual([[{ x: 0, y: 4 }, { x: 0, y: 12 }]])
  })

  it('simular y cambiar el valor dejan a la vista el LED, donde se ve el resultado', () => {
    const c = ctx(arranqueDeCapitulo('medir-senales')!)
    for (const id of ['simular', 'valor']) {
      const f = paso(CAPITULO_2, id).focos!(c)
      expect(f, id).toHaveLength(1)
      expect(f[0].tipo).toBe('zona')
    }
    expect(paso(CAPITULO_2, 'simular').focos!(ctx(documentoVacio()))).toEqual([])
  })
})

describe('capítulo 3: sombras y focos del generador, el capacitor y el osciloscopio', () => {
  const inicio = () => arranqueDeCapitulo('medir-senales')!
  /** El circuito con el generador y el RC ya armados, como lo deja el capítulo. */
  const conSenales = (): Documento => {
    const d = inicio()
    delete d.piezas.v
    d.piezas.xfg = pieza('xfg', 'generador', 0, -10, 180, { forma: 'Cuadrada', frecuencia: '1' })
    d.cables.w2 = { id: 'w2', puntos: [{ x: 0, y: -16 }, { x: -6, y: -16 }, { x: -6, y: 12 }, { x: 0, y: 12 }] }
    d.piezas.c = pieza('c', 'capacitor', 40, 0, 90, { valor: '100u' })
    d.cables.k1 = { id: 'k1', puntos: [{ x: 32, y: -4 }, { x: 40, y: -4 }] }
    d.cables.k2 = { id: 'k2', puntos: [{ x: 40, y: 4 }, { x: 40, y: 12 }, { x: 0, y: 12 }] }
    return d
  }

  it('el generador se muestra girado 180° arriba de la fuente, con el cable del COM, hasta quedar conectado', () => {
    const g = paso(CAPITULO_3, 'generador').guia!(ctx(inicio()))
    expect(g.piezas).toMatchObject([{ tipo: 'generador', x: 0, y: -10, rot: 180 }])
    expect(g.cables).toHaveLength(1)
    expect(paso(CAPITULO_3, 'generador').guia!(ctx(conSenales()))).toEqual({ piezas: [], cables: [] })
  })

  it('el capacitor muestra su sombra y sus dos cables; al quedar en el RC no queda nada por dibujar', () => {
    const g = paso(CAPITULO_3, 'capacitor').guia!(ctx(inicio()))
    expect(g.piezas).toMatchObject([{ tipo: 'capacitor', x: 40, y: 0, rot: 90, props: { valor: '100u' } }])
    expect(g.cables).toHaveLength(2)
    expect(paso(CAPITULO_3, 'capacitor').guia!(ctx(conSenales()))).toEqual({ piezas: [], cables: [] })
  })

  it('un capacitor bien puesto y con sus dos cables cumple el paso, sin importar el giro, el sentido ni el tipo', () => {
    const p = paso(CAPITULO_3, 'capacitor')
    const armado = (c: Pieza): Documento => {
      const d = conSenales()
      delete d.cables.k1
      delete d.cables.k2
      d.piezas.c = c
      // Los pines caen en (40, ∓4) con el giro de pie; los cables van de ahí al LED y a la tierra.
      d.cables.k1 = { id: 'k1', puntos: [{ x: 32, y: -4 }, { x: 40, y: -4 }] }
      d.cables.k2 = { id: 'k2', puntos: [{ x: 40, y: 4 }, { x: 40, y: 12 }, { x: 0, y: 12 }] }
      return d
    }
    for (const rot of [0, 90, 180, 270] as const) {
      // Con el giro de la sombra el pin 1 queda arriba o abajo según el giro: el cable va a donde caiga cada pin.
      const d = armado(pieza('c', 'capacitor', 40, 0, rot, { valor: '100u' }))
      const horizontal = rot === 0 || rot === 180
      expect(p.hecho(ctx(d)), `capacitor ${rot}°`).toBe(!horizontal)
    }
    // El electrolítico (la búsqueda «c 100u» puede traerlo) también forma el RC, con + o − hacia el LED.
    expect(p.hecho(ctx(armado(pieza('c', 'capacitor-electrolitico', 40, 0, 90, { valor: '100u' }))))).toBe(true)
    expect(p.hecho(ctx(armado(pieza('c', 'capacitor-electrolitico', 40, 0, 270, { valor: '100u' }))))).toBe(true)
    // Con otro valor no.
    expect(p.hecho(ctx(armado(pieza('c', 'capacitor', 40, 0, 90, { valor: '10u' }))))).toBe(false)
  })

  it('el paso del capacitor no enmarca la sombra de la pieza: solo sus cables', () => {
    const p = paso(CAPITULO_3, 'capacitor')
    const cajas = [p.objetivo(ctx(inicio())), ...(p.focos?.(ctx(inicio())) ?? [])]
    const sombra = { minX: 39, minY: -3, maxX: 41, maxY: 3 }
    for (const o of cajas) {
      expect(o.tipo).toBe('zona')
      if (o.tipo !== 'zona') continue
      const c = o.caja
      const encima = c.minX < sombra.maxX && c.maxX > sombra.minX && c.minY < sombra.maxY && c.maxY > sombra.minY
      expect(encima, JSON.stringify(c)).toBe(false)
    }
  })

  it('el osciloscopio se cumple sobre su sombra y no en otro lugar', () => {
    const p = paso(CAPITULO_3, 'osciloscopio')
    const d = inicio()
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
    const d = inicio()
    d.piezas.c = pieza('c', 'capacitor', 40, 0, 0, { valor: '100u' })
    expect(p.fueraDeSombra!(ctx(d))).toBe(true)
    d.piezas.c = pieza('c', 'capacitor', 40, 0, 90, { valor: '100u' })
    expect(p.fueraDeSombra!(ctx(d))).toBe(false)
    expect(p.fueraDeSombra!(ctx(inicio()))).toBe(false)
    expect(p.texto).toContain('{codigo:c 100u}')
  })

  it('el inspector se señala en el inspector (derecha) y nunca en el panel lateral de la Librería (izquierda)', () => {
    expect(paso(CAPITULO_3, 'cuadrada').focos!(ctx(conSenales()))).toEqual([{ tipo: 'control', selector: 'aside.inspector' }])
  })

  it('simular con el osciloscopio señala además el botón, la pantalla y el osciloscopio del lienzo', () => {
    const d = conSenales()
    d.piezas.xsc = pieza('xsc', 'osciloscopio', 28, 24)
    expect(paso(CAPITULO_3, 'osciloscopio-simular').focos!(ctx(d))).toEqual([
      expect.objectContaining({ tipo: 'zona' }),
      { tipo: 'control', selector: '[data-comando="simular"]', pestana: 'inicio', respaldo: '[data-grupo="vista-previa"] .boton-grupo' },
      expect.objectContaining({ tipo: 'control', selector: '#instrumentos-panel' })
    ])
  })
})
