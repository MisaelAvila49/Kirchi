import { describe, expect, it } from 'vitest'
import { MotorTutorial } from './motor'
import { mira } from './pasos'
import type { CapituloDef, CtxTutorial } from './tipos'

const ctx = (extra: Partial<CtxTutorial> = {}): CtxTutorial => ({
  doc: { piezas: {}, cables: {}, etiquetas: {}, notas: {} }, con: {} as CtxTutorial['con'], lib: new Map(), fase: 'detenida', centro: { x: 0, y: 0 }, ...extra
})

/** «Mira», «Haz» y otro «Mira»: el «Haz» se cumple con la fase de la simulación. */
const cap: CapituloDef = {
  id: 'prueba', numero: 9, titulo: 'Prueba', resumen: '', descripcion: 'Una prueba.', minutos: 1, tono: 'azul', totalPasos: 3, zona: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  pasos: [
    mira({ id: 'a', resumen: 'a', texto: 'a', objetivo: () => ({ tipo: 'control', selector: '#a' }) }),
    { id: 'b', resumen: 'b', texto: 'b', cumplido: 'b', objetivo: () => ({ tipo: 'control', selector: '#b' }), hecho: (c) => c.fase === 'corriendo' },
    mira({ id: 'c', resumen: 'c', texto: 'c', objetivo: () => ({ tipo: 'control', selector: '#c' }) })
  ]
}

function motor() {
  const eventos: string[] = []
  const m = new MotorTutorial({
    alCambiar: () => eventos.push('cambio'),
    alAvanzar: (id, paso, terminado) => eventos.push(`avance ${id} ${paso} ${terminado}`),
    alTerminar: (c) => eventos.push(`fin ${c.id}`)
  })
  return { m, eventos }
}

describe('el paso «Mira»', () => {
  it('lleva su tipo, no se da por cumplido y al retomar cuenta como visto', () => {
    const p = cap.pasos[0]
    expect(p.tipo).toBe('mira')
    expect(p.transitorio).toBe(true)
    expect(p.hecho(ctx())).toBe(false)
    expect(p.hecho(ctx({ fase: 'corriendo', eventos: new Set(['zoom-rueda']) }))).toBe(false)
  })

  it('no avanza con lo que haga la persona: solo «Siguiente» (saltar) lo pasa', () => {
    const { m } = motor()
    m.iniciar(cap)
    // Lo que la persona haga (aquí, poner la simulación en marcha) no cumple un «Mira».
    m.evaluar(ctx({ fase: 'corriendo' }))
    expect(m.estado()).toMatchObject({ paso: 0, cumplido: false })
    m.evaluar(ctx())
    m.siguiente()
    expect(m.estado()?.paso).toBe(0)
    m.saltar()
    expect(m.estado()).toMatchObject({ paso: 1, cumplido: false })
  })

  it('después de un «Haz» cumplido se sigue con «Siguiente» hasta terminar el capítulo', () => {
    const { m, eventos } = motor()
    m.iniciar(cap)
    m.saltar()
    m.evaluar(ctx({ fase: 'corriendo' }))
    expect(m.estado()).toMatchObject({ paso: 1, cumplido: true })
    m.siguiente()
    expect(m.estado()?.paso).toBe(2)
    m.saltar()
    expect(m.activo).toBe(false)
    expect(eventos).toContain('avance prueba 3 true')
    expect(eventos).toContain('fin prueba')
  })
})
