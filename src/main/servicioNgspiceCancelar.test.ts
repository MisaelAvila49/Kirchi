import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ServicioNgspice } from './servicioNgspice'

// Cancelar con el ngspice real: un transitorio largo se mata, la petición vuelve como cancelada y no queda carpeta ni proceso.
const EXE = resolve(__dirname, '../../herramientas/ngspice/Spice64/bin/ngspice_con.exe')
const hay = existsSync(EXE)
const LARGO = {
  netlist: { nodes: 3, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'sine', offset: 0, amp: 5, freq: 1000 } }, { type: 'R', a: 1, b: 2, ohms: 1000 }, { type: 'C', a: 2, b: 0, farads: 1e-6 }] },
  analisis: { tipo: 'tran', paso: 1e-9, fin: 0.0019 }
}
let raiz: string
let tmp: string
beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), 'kirchi-cancelar-real-'))
  tmp = join(raiz, 'tmp')
  mkdirSync(tmp)
})
afterAll(() => rmSync(raiz, { recursive: true, force: true }))

describe.skipIf(!hay)('cancelar con ngspice real', () => {
  it('un transitorio largo se cancela rápido, devuelve cancelado y limpia', async () => {
    const s = new ServicioNgspice({ ejecutable: EXE, carpetaTemporal: tmp, limiteMs: 120_000 })
    const p = s.ejecutar(1, LARGO)
    await new Promise((r) => setTimeout(r, 2500))
    const t0 = Date.now()
    s.cancelar(1)
    const r = await p
    expect(r).toMatchObject({ ok: false, cancelado: true })
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(readdirSync(tmp)).toEqual([])
    // La ventana queda libre: otra petición corta corre.
    const otra = await s.ejecutar(1, { netlist: LARGO.netlist, analisis: { tipo: 'op' } })
    expect(otra.ok).toBe(true)
  }, 60_000)
})
