// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { analisisNuevo } from '../analisis/fichas'
import { armarContexto } from '../analisis/contexto'
import type { Documento } from '../doc/tipos'
import { libreriaSinDom, sesionDePrueba } from '../prueba/pasoVista'
import type { SesionSinVentana } from './sesion'

// Con ngspice 47 real; sin `herramientas/ngspice` la prueba se omite, como las demás que lo usan.
const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()

const lib = libreriaSinDom()
const plantilla = (id: string): Documento => JSON.parse(readFileSync(join(raiz, 'componentes/plantillas', `${id}.json`), 'utf8')).circuito
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })

let s: SesionSinVentana
beforeAll(async () => {
  s = await sesionDePrueba((p) => servicio.ejecutar(0, p))
})

function nuevo(tipo: 'op' | 'ac', ses: SesionSinVentana = s) {
  const r = armarContexto(ses.doc, lib, ses.nucleo.con)
  if (!r.ok) throw new Error(r.error)
  const n = analisisNuevo(tipo, r.ctx, 'a1', [])
  if (!n.ok) throw new Error(n.error)
  return n.analisis
}

describe('análisis por el ejecutor inyectado', () => {
  it('sin ejecutor devuelve el motivo y no lanza', async () => {
    const sin = await sesionDePrueba()
    sin.abrirDocumento(plantilla('divisor-de-voltaje'))
    const r = await sin.analizar(nuevo('op', sin))
    expect(r.ok).toBe(false)
  })

  it.skipIf(!hay)('el punto de operación del divisor da 2.878 V en la salida', async () => {
    s.abrirDocumento(plantilla('divisor-de-voltaje'))
    const r = await s.analizar(nuevo('op'))
    if (!r.ok) throw new Error(r.error)
    expect(r.tabla).not.toBeNull()
    const volts = r.tabla!.redes.map((x) => x.voltaje)
    expect(volts.some((v) => Math.abs(v - 2.878) < 0.01)).toBe(true)
  })

  it.skipIf(!hay)('la CA del RC paso bajas cae 3 dB cerca de 1.59 kHz y limita a 2000 puntos', async () => {
    s.abrirDocumento(plantilla('filtro-rc-paso-bajas'))
    const r = await s.analizar(nuevo('ac'))
    if (!r.ok) throw new Error(r.error)
    const c = r.corridas[0]
    const salida = c.series.find((x) => x.unidad === 'dB')!
    expect(salida.valores.length).toBeLessThanOrEqual(2000)
    const k = salida.valores.findIndex((v) => v <= -3.01)
    expect(k).toBeGreaterThan(0)
    expect(c.eje.valores[k]).toBeGreaterThan(1400)
    expect(c.eje.valores[k]).toBeLessThan(1800)
  })
})
