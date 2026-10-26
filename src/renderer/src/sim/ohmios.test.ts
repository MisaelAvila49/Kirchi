import { afterEach, describe, expect, it, vi } from 'vitest'
import { lecturaDeOhmios, medirOhmiosDetenido } from './ohmios'

const pedido = { netlist: {}, h: 1e-6, multimetros: [] } as unknown as Parameters<typeof medirOhmiosDetenido>[0]

describe('lecturaDeOhmios', () => {
  it('en continuidad dice «hay paso» y su aviso nombra la continuidad', () => {
    expect(lecturaDeOhmios({ valor: 20, estado: 'ok', rango: 100 }, true)).toMatchObject({ texto: '20.00 Ω · hay paso', modo: 5 })
    expect(lecturaDeOhmios({ valor: Number.NaN, estado: 'voltaje', rango: 100 }, true).texto).toBe('Apaga las fuentes para medir continuidad')
    expect(lecturaDeOhmios({ valor: Number.NaN, estado: 'voltaje', rango: 1e4 }).texto).toBe('Apaga las fuentes para medir resistencia')
  })
})

describe('medirOhmiosDetenido: cancelación', () => {
  afterEach(() => vi.unstubAllGlobals())

  function falso() {
    const w = { terminate: vi.fn(), postMessage: vi.fn(), onmessage: null as unknown, onerror: null as unknown }
    vi.stubGlobal('Worker', function () {
      return w
    })
    return w
  }

  it('abortar termina el worker de un solo uso y rechaza con AbortError', async () => {
    const w = falso()
    const c = new AbortController()
    const p = medirOhmiosDetenido(pedido, c.signal)
    expect(w.terminate).not.toHaveBeenCalled()
    c.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })

  it('con la señal ya abortada ni siquiera crea el worker', async () => {
    const w = falso()
    const c = new AbortController()
    c.abort()
    await expect(medirOhmiosDetenido(pedido, c.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(w.postMessage).not.toHaveBeenCalled()
  })

  it('al responder se libera una sola vez y abortar después no hace nada', async () => {
    const w = falso()
    const c = new AbortController()
    const p = medirOhmiosDetenido(pedido, c.signal)
    ;(w.onmessage as (e: unknown) => void)({ data: { ok: true, lecturas: [] } })
    await expect(p).resolves.toEqual(new Map())
    c.abort()
    expect(w.terminate).toHaveBeenCalledTimes(1)
  })
})
