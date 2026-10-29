// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'

// El enrutador del editor devuelve la «mejor L» aunque esté bloqueada: aquí se fuerza una recta que cruza todo.
const forzarRutaBloqueada = vi.hoisted(() => ({ activa: false }))
vi.mock('../../editor/enrutar', async (original) => {
  const m = await original<typeof import('../../editor/enrutar')>()
  return { ...m, enrutar: (...a: Parameters<typeof m.enrutar>) => (forzarRutaBloqueada.activa ? [a[2], { x: 10, y: a[2].y }, { x: 10, y: a[3].y }, a[3]] : m.enrutar(...a)) }
})
import { cable, documento, lib, nuevoNucleo, pieza, sinViolaciones } from '../../prueba/ayudaEdicion'
import { calcularConexiones } from '../../conexiones/conexiones'
import { pinesEnMundo } from '../../piezas/transformar'
import type { Pieza } from '../../doc/tipos'
import { esRechazo } from '../plan'
import { reemplazarPieza } from './reemplazar'

const caja = (): Pieza => ({
  ...pieza('x', 'sin-equivalencia', 'X1', 20, 10),
  props: { nombre: 'LM358', origen: 'SPICE' },
  pines: [
    { id: 'p1', nombre: 'OUT', numero: '1', lado: 'der' },
    { id: 'p2', nombre: 'IN-', numero: '2', lado: 'izq' },
    { id: 'p3', nombre: 'IN+', numero: '3', lado: 'izq' },
    { id: 'p4', nombre: 'VEE', numero: '4', lado: 'izq' },
    { id: 'p5', nombre: 'NC', numero: '9', lado: 'der' },
    { id: 'p6', nombre: 'NC2', numero: '10', lado: 'der' }
  ]
})

/** La caja con un cable en cada pin, en las puntas de los pines. */
function escena(modificar: (c: Pieza) => Pieza = (c) => c, vecinas: Pieza[] = []) {
  const c = modificar(caja())
  const pines = pinesEnMundo(c, lib.get('sin-equivalencia')!)
  const p = (id: string) => pines.find((q) => q.id === id)!
  const cables = [
    cable('c1', [p('p1').x, p('p1').y], [p('p1').x + 10, p('p1').y]),
    cable('c2', [p('p2').x, p('p2').y], [p('p2').x - 10, p('p2').y]),
    cable('c3', [p('p3').x, p('p3').y], [p('p3').x - 10, p('p3').y]),
    cable('c5', [p('p5').x, p('p5').y], [p('p5').x + 10, p('p5').y]),
    cable('c6', [p('p6').x, p('p6').y], [p('p6').x + 10, p('p6').y])
  ]
  return nuevoNucleo(documento([c, ...vecinas], cables))
}

describe('reemplazar una pieza', () => {
  it('la pieza nueva toma el lugar y el giro, la caja desaparece y todo es un solo paso de deshacer', () => {
    const n = escena()
    const antes = JSON.stringify(n.doc)
    const r = n.reemplazar('x', 'amp-op')
    expect(r.ok).toBe(true)
    const nueva = Object.values(n.doc.piezas)
    expect(nueva).toHaveLength(1)
    expect(nueva[0]).toMatchObject({ tipo: 'amp-op', x: 20, y: 10, rot: 0 })
    expect(n.doc.piezas.x).toBeUndefined()
    expect(n.deshacer()).toBe(true)
    expect(JSON.stringify(n.doc)).toBe(antes)
    expect(n.deshacer()).toBe(false)
  })

  it('los cables de cada pin pasan al pin con su nombre, sin cruzar cuerpos ni encimarse', () => {
    const n = escena()
    n.reemplazar('x', 'amp-op')
    const nueva = Object.values(n.doc.piezas)[0]
    const pines = new Map(pinesEnMundo(nueva, lib.get('amp-op')!).map((p) => [p.id, p]))
    const termina = (id: string, pin: string) => {
      const c = n.doc.cables[id]
      const q = pines.get(pin)!
      return [c.puntos[0], c.puntos[c.puntos.length - 1]].some((p) => p.x === q.x && p.y === q.y)
    }
    expect(termina('c1', 'OUT')).toBe(true)
    expect(termina('c2', '-')).toBe(true)
    expect(termina('c3', '+')).toBe(true)
    for (const c of Object.values(n.doc.cables)) for (let i = 1; i < c.puntos.length; i++) expect(c.puntos[i].x === c.puntos[i - 1].x || c.puntos[i].y === c.puntos[i - 1].y).toBe(true)
    expect(sinViolaciones(n)).toEqual([])
  })

  it('el cable de un pin sin pareja queda suelto y los pines sin pareja se dicen en los avisos', () => {
    const n = escena()
    const plan = reemplazarPieza(n, 'x', 'amp-op')
    expect(esRechazo(plan)).toBe(false)
    if (esRechazo(plan)) return
    expect(plan.avisos[0]).toContain('LM358 tenía 6 pines y Amp. operacional tiene 5.')
    expect(plan.avisos.join(' ')).toContain('Se desconectan: 10')
    const antes = n.doc.cables.c6.puntos
    n.reemplazar('x', 'amp-op')
    expect(n.doc.cables.c6.puntos).toEqual(antes)
  })

  it('conserva la referencia si el prefijo coincide y toma una nueva si no', () => {
    const a = escena((c) => ({ ...c, ref: 'U1' }))
    a.reemplazar('x', 'amp-op')
    expect(Object.values(a.doc.piezas)[0].ref).toBe('U1')
    const b = escena()
    b.reemplazar('x', 'amp-op')
    expect(Object.values(b.doc.piezas)[0].ref).toBe('U1')
  })

  it('un id que es una propiedad de Object no se toma por una pieza', () => {
    expect(esRechazo(reemplazarPieza(escena(), 'constructor', 'amp-op'))).toBe(true)
  })

  it('rechaza una pieza que no existe, un tipo que no existe y la caja misma como destino', () => {
    const n = escena()
    expect(esRechazo(reemplazarPieza(n, 'zz', 'amp-op'))).toBe(true)
    expect(esRechazo(reemplazarPieza(n, 'x', 'flux'))).toBe(true)
    expect(esRechazo(reemplazarPieza(n, 'x', 'sin-equivalencia'))).toBe(true)
  })

  it('una pieza vecina que estorba mueve a la nueva al lugar libre más cercano', () => {
    const n = escena(undefined, [pieza('v', 'resistencia', 'R1', 20, 10 + 6)])
    const plan = reemplazarPieza(n, 'x', 'amp-op')
    expect(esRechazo(plan)).toBe(false)
  })

  it('si el enrutador solo devuelve una ruta bloqueada, el cable no la toma y no hay violaciones', () => {
    const n = escena(undefined, [pieza('v', 'resistencia', 'R1', 10, 10)])
    forzarRutaBloqueada.activa = true
    try {
      expect(esRechazo(reemplazarPieza(n, 'x', 'amp-op'))).toBe(false)
      n.reemplazar('x', 'amp-op')
    } finally {
      forzarRutaBloqueada.activa = false
    }
    expect(sinViolaciones(n)).toEqual([])
  })
})
