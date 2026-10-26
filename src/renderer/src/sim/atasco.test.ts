import { describe, expect, it } from 'vitest'
import { avanzarSinColgarse, ITER_MAX, ITER_MIN, MS_PERDIDOS_POR_LLAMADA, mensajeDeAtasco, PresupuestoDeIteraciones, VigilanteDeProgreso, type MotorAvanzable } from './atasco'

describe('PresupuestoDeIteraciones', () => {
  it('sin medida escala con el tamaño del circuito: más grande, menos iteraciones por llamada', () => {
    const chico = new PresupuestoDeIteraciones(20).iteraciones()
    const grande = new PresupuestoDeIteraciones(2000).iteraciones()
    expect(chico).toBeGreaterThan(grande)
    expect(grande).toBeGreaterThanOrEqual(ITER_MIN)
    expect(chico).toBeLessThanOrEqual(ITER_MAX)
  })

  it('con medida, apunta a un cuarto de segundo de trabajo perdido por llamada y nunca baja de ITER_MIN', () => {
    const p = new PresupuestoDeIteraciones(800)
    // 500 iteraciones perdidas tardaron 100 ms: 0.2 ms cada una, así que en 250 ms caben unas 1,250.
    for (let k = 0; k < 40; k++) p.medir(100, 500)
    expect(p.iteraciones()).toBeGreaterThan(1000)
    expect(p.iteraciones()).toBeLessThan(1500)
    // Si se abarata (0.01 ms por iteración), el presupuesto sube hacia el tope.
    for (let k = 0; k < 80; k++) p.medir(5, 500)
    expect(p.iteraciones()).toBeGreaterThan(10000)
    // Si se encarece mucho (5 ms por iteración), baja pero no de ITER_MIN: un nivel del rescate necesita hasta 100 seguidas.
    for (let k = 0; k < 5; k++) p.medir(2500, 500)
    expect(p.iteraciones()).toBe(ITER_MIN)
    expect(MS_PERDIDOS_POR_LLAMADA).toBe(250)
  })

  it('no se mueve con medidas de pocas iteraciones ni absurdas', () => {
    const p = new PresupuestoDeIteraciones(100)
    const antes = p.iteraciones()
    p.medir(5, 3)
    p.medir(Number.NaN, 500)
    p.medir(-1, 500)
    expect(p.iteraciones()).toBe(antes)
  })
})

describe('VigilanteDeProgreso', () => {
  it('se rinde solo tras 5 s de trabajo del motor sin que el tiempo simulado avance', () => {
    const v = new VigilanteDeProgreso(5000)
    v.observar(0)
    v.gastar(4999)
    expect(v.atascado()).toBe(false)
    v.gastar(2)
    expect(v.atascado()).toBe(true)
  })

  it('un avance real del tiempo simulado reinicia la cuenta', () => {
    const v = new VigilanteDeProgreso(5000)
    v.observar(1e-3)
    v.gastar(4000)
    v.gastar(4000)
    expect(v.atascado()).toBe(true)
    v.observar(2e-3)
    expect(v.atascado()).toBe(false)
    v.gastar(4500)
    expect(v.atascado()).toBe(false)
    v.gastar(600)
    expect(v.atascado()).toBe(true)
  })

  it('el tiempo en pausa no cuenta: solo se suma lo que el motor trabaja, y un cambio de velocidad reinicia', () => {
    const v = new VigilanteDeProgreso(5000)
    v.observar(1e-3)
    // 10 s de pausa: el worker no llama al motor, así que no se gasta nada.
    v.gastar(0)
    v.gastar(3000)
    v.reiniciar()
    v.gastar(3000)
    expect(v.atascado()).toBe(false)
  })

  it('arrastrarse a pasos de nanosegundos no reinicia la cuenta para siempre', () => {
    const v = new VigilanteDeProgreso(5000)
    v.observar(1e-3)
    for (let k = 1; k <= 30; k++) {
      v.observar(1e-3 + k * 1e-12)
      v.gastar(200)
    }
    expect(v.atascado()).toBe(true)
    // Un avance de al menos un nanosegundo desde la última marca sí cuenta.
    v.observar(1e-3 + 1e-9 + 1e-12)
    expect(v.atascado()).toBe(false)
  })
})

/** Un motor que agota su presupuesto `veces` veces seguidas (sin avanzar el tiempo) y luego avanza; cada intento cuesta `msPorIntento` de reloj. */
function motorAtascado(veces: number, reloj: { ms: number }, msPorIntento = 1000) {
  let t = 0
  let intentos = 0
  let presupuestos: number[] = []
  const motor: MotorAvanzable = {
    time: () => t,
    set_iteration_budget: (n) => presupuestos.push(n),
    lost_iterations: () => 400,
    advance_to: (meta) => {
      intentos++
      reloj.ms += msPorIntento
      if (intentos <= veces) throw new Error('se agotó el presupuesto de iteraciones en t = 1.000000e-3 s (elemento 4)')
      t = meta
      return 3
    }
  }
  return { motor, intentos: () => intentos, presupuestos: () => presupuestos }
}

describe('avanzarSinColgarse: un caso que tarda en converger no congela el worker', () => {
  it('devuelve el control con el aviso en vez de lanzar, pone el presupuesto antes de cada llamada y mide lo perdido', () => {
    const reloj = { ms: 0 }
    const { motor, presupuestos } = motorAtascado(1, reloj)
    const p = new PresupuestoDeIteraciones(800)
    const r = avanzarSinColgarse(motor, 1e-3, 200, p, () => reloj.ms)
    expect(r).toEqual({ pasos: 0, atasco: 'no convergió en t = 1.000000e-3 s (elemento 4)', ms: 1000 })
    expect(presupuestos()).toHaveLength(1)
    // 400 iteraciones perdidas en 1,000 ms son 2.5 ms cada una: la siguiente llamada pide menos.
    expect(p.iteraciones()).toBeLessThanOrEqual(presupuestos()[0])
    // La llamada siguiente continúa y avanza.
    expect(avanzarSinColgarse(motor, 1e-3, 200, p, () => reloj.ms)).toEqual({ pasos: 3, atasco: null, ms: 1000 })
  })

  it('con el vigilante, el worker cede el turno entre llamadas y solo se rinde a los 5 s sin avanzar', () => {
    const reloj = { ms: 0 }
    const { motor } = motorAtascado(100, reloj, 1000)
    const p = new PresupuestoDeIteraciones(800)
    const v = new VigilanteDeProgreso(5000)
    let llamadas = 0
    let rendido = false
    while (!rendido && llamadas < 20) {
      const r = avanzarSinColgarse(motor, 1e-3, 200, p, () => reloj.ms)
      llamadas++
      v.observar(motor.time())
      if (r.atasco !== null) v.gastar(r.ms)
      // Entre llamadas el worker vuelve al bucle de mensajes (setTimeout): pausa, detener y cambios en caliente se atienden ahí.
      rendido = r.atasco !== null && v.atascado()
    }
    expect(rendido).toBe(true)
    // Cada llamada atascada cuesta 1 s de motor: a la sexta pasaron más de 5 s.
    expect(llamadas).toBe(6)
  })

  it('un error que no es el presupuesto sí se lanza', () => {
    const motor: MotorAvanzable = { time: () => 0, set_iteration_budget: () => {}, lost_iterations: () => 0, advance_to: () => { throw new Error('matriz singular') } }
    expect(() => avanzarSinColgarse(motor, 1, 1, new PresupuestoDeIteraciones(10), () => 0)).toThrow('matriz singular')
  })
})

describe('mensajeDeAtasco', () => {
  it('convierte el aviso de presupuesto agotado en el mensaje de no convergencia con la pieza sospechosa', () => {
    expect(mensajeDeAtasco('se agotó el presupuesto de iteraciones en t = 1.250000e-3 s (elemento 2)')).toBe('no convergió en t = 1.250000e-3 s (elemento 2)')
    expect(mensajeDeAtasco('se agotó el presupuesto de iteraciones en t = 4.000000e-6 s')).toBe('no convergió en t = 4.000000e-6 s')
  })
  it('reconoce el aviso y no otros mensajes', () => {
    expect(mensajeDeAtasco('matriz singular')).toBeNull()
  })
})
