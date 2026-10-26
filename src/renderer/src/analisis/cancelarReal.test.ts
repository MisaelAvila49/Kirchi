// @vitest-environment happy-dom
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import type { ApiNgspice } from '../../../compartido/ngspice'
import { ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { AlmacenAnalisis } from './almacen'
import { armarContexto } from './contexto'
import { SIN_TRAZAS } from './ejecucion'

// De la corrida a la cancelación con el servicio y el ngspice reales (sin Electron): Ejecutar, Cancelar y la corrida queda cancelada.
const EXE = resolve(__dirname, '../../../../herramientas/ngspice/Spice64/bin/ngspice_con.exe')
const lib = libreriaDePrueba().piezas
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const DC = (ref: string, voltaje: string, mas: string): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje }, pines: { '+': mas, '-': '0' } })
const d = conEtiquetas(lib, [DC('V1', '5', 'entrada'), R('R1', '1k', 'entrada', 'salida'), R('R2', '1k', 'salida', '0')])
const r = armarContexto(d, lib, calcularConexiones(d, lib))
if (!r.ok) throw new Error(r.error)
const TRAN: AnalisisDoc = { id: 'a1', nombre: 'Transitorio 1', config: { tipo: 'tran', fin: 1, maximo: 1e-6 } }

const raiz = mkdtempSync(join(tmpdir(), 'kirchi-cancelar-almacen-'))
const tmp = join(raiz, 'tmp')
mkdirSync(tmp)
afterAll(() => rmSync(raiz, { recursive: true, force: true }))

describe.skipIf(!existsSync(EXE))('Cancelar de punta a punta (almacén + servicio + ngspice real)', () => {
  it('un transitorio largo se cancela: corrida cancelada, una línea en el Registro, sin carpetas ni procesos', async () => {
    const servicio = new ServicioNgspice({ ejecutable: EXE, carpetaTemporal: tmp, limiteMs: 120_000 })
    const api: Pick<ApiNgspice, 'ejecutar' | 'cancelar'> = { ejecutar: (p) => servicio.ejecutar(1, p), cancelar: async () => servicio.cancelar(1) }
    const registro: [string, string][] = []
    const almacen = new AlmacenAnalisis({ api: () => api, registrar: (t, n) => registro.push([t, n]) })
    const p = almacen.ejecutar(TRAN, r.ctx, SIN_TRAZAS)
    await new Promise((res) => setTimeout(res, 2500))
    expect(almacen.corriendo).toBe(true)
    const t0 = Date.now()
    almacen.cancelar()
    const c = await p
    expect(Date.now() - t0).toBeLessThan(2500)
    expect(c?.estado).toBe('cancelado')
    expect(almacen.corriendo).toBe(false)
    expect(registro.filter(([t]) => /cancel/i.test(t))).toEqual([['Análisis cancelado.', 'info']])
    expect(readdirSync(tmp)).toEqual([])
  }, 60_000)
})
