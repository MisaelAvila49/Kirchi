// @vitest-environment happy-dom
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carpetaHerramientas } from '../../../main/recursos'
import { localizarNgspice, ServicioNgspice } from '../../../main/servicioNgspice'
import { calcularConexiones } from '../conexiones/conexiones'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist } from './netlist'

// La netlist exportada de cada pieza (todas sus opciones de lista) la acepta el ngspice 47 real y un transitorio
// corto llega hasta el final. Sin `herramientas/ngspice` se omite (ngspice no se distribuye ni está en CI).

const raiz = join(import.meta.dirname, '../../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
if (!hay) console.warn('ngspice 47 no está en herramientas/ngspice: se omite la prueba de las piezas contra ngspice.')

const lib = libreriaDePrueba().piezas
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 60_000 })

function armar(tipo: string, props: Record<string, string>): Parte[] {
  const def = lib.get(tipo)!
  const pines = Object.fromEntries(def.pines.map((p) => [p.id, tipo === 'tierra' ? '0' : `r_${p.id}`]))
  const resistencias = tipo === 'tierra' ? [] : def.pines.map((p, i): Parte => ({ tipo: 'resistencia', ref: `R${i + 1}`, props: { valor: '1k' }, pines: { '1': `r_${p.id}`, '2': '0' } }))
  return [{ tipo, ref: 'U1', props, pines }, ...resistencias]
}

function variantes(tipo: string): Record<string, string>[] {
  const def = lib.get(tipo)!
  const out: Record<string, string>[] = [{}]
  for (const p of def.props) for (const o of p.opciones ?? []) if (o !== p.defecto) out.push({ [p.id]: o })
  return out
}

describe.skipIf(!hay)('ngspice acepta la netlist exportada de cada pieza', () => {
  it.each([...lib.keys()].filter((t) => t !== 'tierra').sort())('%s', async (tipo) => {
    let corridas = 0
    for (const props of variantes(tipo)) {
      const d = conEtiquetas(lib, armar(tipo, props))
      const con = calcularConexiones(d, lib)
      const r = compilarNetlist(d, lib, con)
      if (!r.netlist || r.errores.length > 0) continue
      const res = await servicio.ejecutar(1, { netlist: r.netlist, analisis: { tipo: 'tran', paso: 1e-6, fin: 1e-4, uic: true } })
      if (!res.ok) throw new Error(`${tipo} ${JSON.stringify(props)}: ${res.error}`)
      expect(res.graficos[0].puntos, `${tipo} ${JSON.stringify(props)}`).toBeGreaterThan(2)
      corridas++
    }
    expect(corridas).toBeGreaterThan(0)
  }, 120_000)
})
