// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { CALCULADORAS, estadoInicial } from '../calculadoras/catalogo'
import { calcularConexiones } from '../conexiones/conexiones'
import { armar } from '../plantillas/armar'
import { libreriaDePrueba } from '../prueba/libreria'
import { armarContexto } from './contexto'
import { correrAnalisis, SIN_TRAZAS } from './ejecucion'
import { analisisNuevo } from './fichas'

// Los filtros de banda de las calculadoras, con la entrada y las trazas que salen por omisión, en el ngspice 47 real. Sin
// `herramientas/ngspice` la prueba se omite (como las de `netlist/ngspiceReferencias.test.ts`).
const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()

const lib = libreriaDePrueba().piezas
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })

async function bode(tipo: string) {
  const d = CALCULADORAS.find((x) => x.id === 'filtro')!
  const def = d.evaluar({ ...estadoInicial(d), tipo }, { serie: 'E12', lib }).salida!.armado.def
  const doc = armar(def, lib, tipo)
  const r = armarContexto(doc, lib, calcularConexiones(doc, lib))
  if (!r.ok) throw new Error(r.error)
  const n = analisisNuevo('ac', r.ctx, 'a1', [])
  if (!n.ok) throw new Error(n.error)
  const res = await correrAnalisis(n.analisis, r.ctx, SIN_TRAZAS, { ejecutar: (p) => servicio.ejecutar(1, p) })
  if (!res.ok) throw new Error(res.error)
  return { ctx: r.ctx, analisis: n.analisis, corrida: res.mapeado.corridas[0] }
}

/** La frecuencia y los dB del mínimo de una serie. */
function minimo(eje: Float64Array, db: Float64Array): { f: number; db: number } {
  let k = 0
  for (let i = 1; i < db.length; i++) if (db[i] < db[k]) k = i
  return { f: eje[k], db: db[k] }
}

describe.skipIf(!hay)('filtros de banda: el barrido de CA con lo que sale por omisión', () => {
  it('el rechaza banda entra por el generador y grafica Entrada y Salida, con el hueco cerca de 1.06 kHz y unos -32 dB', async () => {
    const { ctx, analisis, corrida } = await bode('rechazabanda')
    expect(ctx.fuentes.map((f) => [f.ref, f.clase])).toContainEqual(['XFG1', 'generador'])
    expect(ctx.fuentes.find((f) => f.id === (analisis.config as { fuente: string }).fuente)!.ref).toBe('XFG1')
    expect(corrida.series.map((s) => s.etiqueta).sort()).toEqual(['V(Entrada)', 'V(Salida)'])
    const entrada = corrida.series.find((s) => s.etiqueta === 'V(Entrada)')!
    expect(Math.abs(entrada.valores[0])).toBeLessThan(0.1)
    const hueco = minimo(corrida.eje, corrida.series.find((s) => s.etiqueta === 'V(Salida)')!.valores)
    // La rejilla del barrido (20 puntos por década) cae en 1.12 kHz; el hueco real está en 1.06 kHz.
    expect(hueco.f).toBeGreaterThan(1000)
    expect(hueco.f).toBeLessThan(1250)
    expect(hueco.db).toBeLessThan(-30)
    expect(hueco.db).toBeGreaterThan(-36)
  })

  it('el pasa banda y el notch siguen como estaban: la señal sale por el generador y la salida tiene su forma', async () => {
    const pb = await bode('pasabanda')
    const s = pb.corrida.series.find((x) => x.etiqueta === 'V(Salida)')!
    const pico = Math.max(...s.valores)
    expect(pico).toBeLessThan(0)
    expect(pico).toBeGreaterThan(-12)
    const nt = await bode('notch')
    const hueco = minimo(nt.corrida.eje, nt.corrida.series.find((x) => x.etiqueta === 'V(Salida)')!.valores)
    expect(hueco.db).toBeLessThan(-20)
  })
})
