import { describe, expect, it } from 'vitest'
import { recogerBasura } from './recolector'

describe('recogerBasura', () => {
  it('hace una recolección completa: un objeto sin referencias ya no existe después', async () => {
    const ref = (() => new WeakRef({ datos: new Float64Array(1 << 16) }))()
    // Un WeakRef mantiene vivo su objeto hasta que termina la tarea en curso.
    await new Promise((r) => setTimeout(r, 0))
    recogerBasura()
    expect(ref.deref()).toBeUndefined()
    // Una segunda llamada reutiliza la función.
    expect(() => recogerBasura()).not.toThrow()
  })
})
