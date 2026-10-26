import { describe, expect, it } from 'vitest'
import { MotorTutorial } from './motor'
import type { CapituloDef, CtxTutorial } from './tipos'

const ctx = (extra: Partial<CtxTutorial> = {}): CtxTutorial => ({
  doc: { piezas: {}, cables: {}, etiquetas: {}, notas: {} }, con: {} as CtxTutorial['con'], lib: new Map(), fase: 'detenida', centro: { x: 0, y: 0 }, ...extra
})

/** Un capítulo de tres pasos que se cumplen según la fase de la simulación. */
const cap: CapituloDef = {
  id: 'prueba', numero: 9, titulo: 'Prueba', resumen: '', minutos: 1, tono: 'azul', totalPasos: 3, zona: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  pasos: [
    { id: 'a', resumen: 'a', texto: 'a', cumplido: 'a', objetivo: () => ({ tipo: 'ninguno' }), hecho: (c) => c.fase === 'corriendo' },
    { id: 'b', resumen: 'b', texto: 'b', cumplido: 'b', objetivo: () => ({ tipo: 'ninguno' }), hecho: (c) => c.fase === 'pausada' },
    { id: 'c', resumen: 'c', texto: 'c', cumplido: 'c', objetivo: () => ({ tipo: 'ninguno' }), hecho: (c) => c.fase === 'detenida' }
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

describe('MotorTutorial', () => {
  it('suma el evento «sim-activa» solo si en el paso se vio la simulación en marcha', () => {
    const { m } = motor()
    const visto: boolean[] = []
    const c: CapituloDef = { ...cap, pasos: [{ ...cap.pasos[0], hecho: (x) => (visto.push(x.eventos?.has('sim-activa') ?? false), false) }] }
    m.iniciar(c)
    m.evaluar(ctx())
    m.evaluar(ctx({ fase: 'pausada' }))
    m.evaluar(ctx())
    expect(visto).toEqual([false, true, true])
  })

  it('al volver a empezar no se evalúa con lo que se vio antes de salir (salir, Ctrl+Z y volver)', () => {
    const { m } = motor()
    m.iniciar(cap)
    m.evaluar(ctx({ fase: 'corriendo' }))
    m.salir()
    m.iniciar(cap)
    expect(m.estado()).toMatchObject({ paso: 0, cumplido: false })
    m.evaluar(ctx())
    expect(m.estado()).toMatchObject({ paso: 0, cumplido: false })
  })

  it('un capítulo sin pasos no arranca', () => {
    const { m } = motor()
    expect(m.iniciar({ ...cap, pasos: [] })).toBe(false)
    expect(m.estado()).toBeNull()
  })

  it('empieza esperando y se cumple solo cuando la acción ocurre', () => {
    const { m } = motor()
    m.iniciar(cap)
    m.evaluar(ctx())
    expect(m.estado()).toMatchObject({ paso: 0, cumplido: false })
    m.evaluar(ctx({ fase: 'corriendo' }))
    expect(m.estado()).toMatchObject({ paso: 0, cumplido: true })
  })

  it('una vez cumplido, el paso no se desmarca aunque la condición deje de valer', () => {
    const { m } = motor()
    m.iniciar(cap)
    m.evaluar(ctx({ fase: 'corriendo' }))
    m.evaluar(ctx({ fase: 'detenida' }))
    expect(m.estado()?.cumplido).toBe(true)
  })

  it('siguiente solo avanza con el paso cumplido; saltar avanza sin cumplir', () => {
    const { m, eventos } = motor()
    m.iniciar(cap)
    m.siguiente()
    expect(m.estado()?.paso).toBe(0)
    m.saltar()
    expect(m.estado()).toMatchObject({ paso: 1, cumplido: false })
    expect(eventos).toContain('avance prueba 1 false')
  })

  it('al avanzar evalúa el paso nuevo con lo último que vio: si ya está cumplido, lo marca', () => {
    const { m } = motor()
    m.iniciar(cap)
    m.evaluar(ctx({ fase: 'pausada' }))
    m.saltar()
    expect(m.estado()).toMatchObject({ paso: 1, cumplido: true })
  })

  it('atrás vuelve un paso y no pasa del primero', () => {
    const { m } = motor()
    m.iniciar(cap, 2)
    m.atras()
    expect(m.estado()?.paso).toBe(1)
    m.atras()
    m.atras()
    expect(m.estado()?.paso).toBe(0)
  })

  it('al cumplir el último paso y pulsar siguiente, el capítulo termina y avisa', () => {
    const { m, eventos } = motor()
    m.iniciar(cap, 2)
    m.evaluar(ctx())
    expect(m.estado()?.cumplido).toBe(true)
    m.siguiente()
    expect(m.estado()).toBeNull()
    expect(eventos).toContain('avance prueba 3 true')
    expect(eventos).toContain('fin prueba')
  })

  it('salir deja el avance en el paso en que iba', () => {
    const { m, eventos } = motor()
    m.iniciar(cap, 1)
    m.salir()
    expect(m.activo).toBe(false)
    expect(eventos.filter((e) => e.startsWith('avance'))).toEqual(['avance prueba 1 false'])
  })

  it('retomar desde un paso fuera de rango se acota', () => {
    const { m } = motor()
    m.iniciar(cap, 40)
    expect(m.estado()?.paso).toBe(2)
  })
})

describe('MotorTutorial: eventos de la aplicación', () => {
  const capEv: CapituloDef = {
    id: 'ev', numero: 9, titulo: 'Eventos', resumen: '', minutos: 1, tono: 'azul', totalPasos: 2, zona: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    pasos: [
      { id: 'g', resumen: 'g', texto: 'g', cumplido: 'g', objetivo: () => ({ tipo: 'ninguno' }), hecho: (c) => !!c.eventos?.has('guardado') },
      { id: 'h', resumen: 'h', texto: 'h', cumplido: 'h', objetivo: () => ({ tipo: 'ninguno' }), hecho: (c) => !!c.eventos?.has('guardado') }
    ]
  }

  it('un evento cumple el paso en que se espera, sin que vuelva a evaluarse el contexto', () => {
    const { m } = motor()
    m.iniciar(capEv)
    m.evaluar(ctx())
    expect(m.estado()?.cumplido).toBe(false)
    m.registrar('guardado')
    expect(m.estado()?.cumplido).toBe(true)
  })

  it('un evento de antes de llegar al paso no lo cumple: al cambiar de paso el registro se vacía', () => {
    const { m } = motor()
    m.iniciar(capEv)
    m.evaluar(ctx())
    m.registrar('guardado')
    m.siguiente()
    expect(m.estado()).toMatchObject({ paso: 1, cumplido: false })
    m.registrar('guardado')
    expect(m.estado()?.cumplido).toBe(true)
  })

  it('un evento sin tutorial en marcha se ignora', () => {
    const { m, eventos } = motor()
    m.registrar('guardado')
    expect(eventos).toEqual([])
  })
})
