import { describe, expect, it } from 'vitest'
import { Demora } from './demora'

/** Reloj de pruebas: los temporizadores corren solo al llamar a `correr`. */
function reloj() {
  let n = 0
  const vivos = new Map<number, () => void>()
  return {
    poner: (f: () => void) => (vivos.set(++n, f), n),
    quitar: (t: unknown) => vivos.delete(t as number),
    correr: () => {
      const fs = [...vivos.values()]
      vivos.clear()
      for (const f of fs) f()
    },
    pendientes: () => vivos.size
  }
}

describe('Demora', () => {
  it('varias peticiones seguidas hacen una sola, la última, al terminar la espera', () => {
    const r = reloj()
    const hechos: string[] = []
    const d = new Demora(400, r)
    d.pedir(() => hechos.push('inicio'))
    d.pedir(() => hechos.push('simulacion'))
    d.pedir(() => hechos.push('vista'))
    expect(hechos).toEqual([])
    expect(r.pendientes()).toBe(1)
    r.correr()
    expect(hechos).toEqual(['vista'])
  })

  it('vaciar hace ya lo pendiente (al cerrar la ventana) y no lo repite', () => {
    const r = reloj()
    const hechos: string[] = []
    const d = new Demora(400, r)
    d.pedir(() => hechos.push('vista'))
    d.vaciar()
    r.correr()
    d.vaciar()
    expect(hechos).toEqual(['vista'])
  })
})
