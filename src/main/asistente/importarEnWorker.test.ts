import { EventEmitter } from 'node:events'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { describe, expect, it, vi } from 'vitest'
import { libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { importarEnWorker, type TrabajadorImportar } from './importarEnWorker'

class Falso extends EventEmitter {
  terminado = false
  recibido: unknown
  postMessage(m: unknown): void {
    this.recibido = m
  }
  terminate(): void {
    this.terminado = true
  }
}

describe('importarEnWorker', () => {
  it('si el trabajador no responde a tiempo lo termina y responde con un motivo', async () => {
    const w = new Falso()
    const t0 = Date.now()
    const r = await importarEnWorker('a.cir', new Uint8Array(), new Map(), () => w as unknown as TrabajadorImportar, 50)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(r).toMatchObject({ ok: false, motivo: expect.stringContaining('se canceló') })
    expect(w.terminado).toBe(true)
  })

  it('entrega el resultado del trabajador y lo termina', async () => {
    const w = new Falso()
    const p = importarEnWorker('a.cir', new Uint8Array([1]), new Map(), () => w as unknown as TrabajadorImportar, 5000)
    expect(w.recibido).toMatchObject({ nombre: 'a.cir', lib: [] })
    w.emit('message', { ok: false, motivo: 'x' })
    await expect(p).resolves.toEqual({ ok: false, motivo: 'x' })
    expect(w.terminado).toBe(true)
  })

  it('un error del trabajador o no poder crearlo dan un motivo y no lanzan', async () => {
    const w = new Falso()
    const p = importarEnWorker('a.cir', new Uint8Array(), new Map(), () => w as unknown as TrabajadorImportar, 5000)
    w.emit('error', new Error('boom'))
    await expect(p).resolves.toMatchObject({ ok: false, detalle: 'boom' })
    const r = await importarEnWorker('a.cir', new Uint8Array(), new Map(), vi.fn(() => { throw new Error('sin worker') }), 5000)
    expect(r).toMatchObject({ ok: false, detalle: 'sin worker' })
  })
})

// Con el build hecho, el trabajador empaquetado convierte de verdad (se omite sin `npm run build`).
const salida = join(import.meta.dirname, '..', '..', '..', 'out', 'main')
const empaquetado = existsSync(salida) ? readdirSync(salida).find((n) => /^importarWorker-.*\.js$/.test(n)) : undefined
describe.skipIf(!empaquetado)('el trabajador empaquetado', () => {
  it('convierte un circuito SPICE fuera del hilo principal', async () => {
    const bytes = new Uint8Array(readFileSync(join(import.meta.dirname, '../../renderer/src/importar/__fixtures__/spice/divisor.cir')))
    const r = await importarEnWorker('divisor.cir', bytes, libreriaSinDom(), () => new Worker(join(salida, empaquetado!)) as unknown as TrabajadorImportar)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.doc.piezas).length).toBeGreaterThanOrEqual(3)
  })
})
