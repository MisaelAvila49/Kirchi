// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { escribirKir } from '../archivo/kir'
import { idSecuencial } from '../doc/ids'
import { NucleoEdicion } from '../edicion/nucleo'
import type { Orden } from '../edicion/ordenes'
import { conEtiquetas, escaleraRC } from '../prueba/circuitos'
import { bytesDelWasm, libreriaSinDom } from '../prueba/pasoVista'
import { medir } from '../prueba/medir'
import { SesionSinVentana } from './sesion'

const lib = libreriaSinDom()
const unaVez = { muestras: 30, calentarMs: 300 }

/** Un `.kir` de 50 piezas (24 etapas RC, la fuente y la tierra). */
const kir50 = (): Uint8Array => {
  const d = conEtiquetas(lib, escaleraRC(24))
  // Un id de etiqueta del .kir no admite «+»: se reescribe el de los pines positivos.
  d.etiquetas = Object.fromEntries(Object.values(d.etiquetas).map((e) => [e.id.replace('+', 'mas'), { ...e, id: e.id.replace('+', 'mas') }]))
  return escribirKir(d, 'prueba')
}

describe('modo sin ventana: tiempos', () => {
  it('cargar el WASM, abrir 50 piezas, compilar, simular 10 ms y leer tarda menos de 1 s', async () => {
    const bytes = kir50()
    const wasm = bytesDelWasm()
    const t0 = performance.now()
    const s = await SesionSinVentana.iniciar({ lib, wasm, version: 'prueba' })
    const tCarga = performance.now() - t0
    s.abrir(bytes)
    s.compilar()
    s.simular({ hasta: 0.01 })
    const l = s.leer()
    const total = performance.now() - t0
    console.info(`con la carga del WASM: ${total.toFixed(0)} ms (carga ${tCarga.toFixed(0)} ms)`)
    expect(Object.keys(l.piezas).length).toBeGreaterThan(40)
    expect(total).toBeLessThan(1000)
  })

  it('sin la carga del WASM tarda menos de 300 ms', async () => {
    const bytes = kir50()
    const s = await SesionSinVentana.iniciar({ lib, wasm: bytesDelWasm(), version: 'prueba' })
    const m = medir(() => {
      s.abrir(bytes)
      s.compilar()
      s.simular({ hasta: 0.01 })
      s.leer()
    }, unaVez)
    console.info(`sin la carga: mínimo ${m.minimo.toFixed(1)} ms, mediana ${m.mediana.toFixed(1)} ms`)
    expect(m.minimo).toBeLessThan(300)
  })
})

describe('edición: tiempos', () => {
  const colocar = (k: number): Orden => ({ orden: 'colocar', tipo: 'resistencia', ref: `R${k + 1}`, en: { x: 30 * (k % 20), y: 20 * Math.floor(k / 20) } })

  it('un lote de 50 piezas y 60 conexiones con A* sobre un documento vacío tarda menos de 1.5 s', () => {
    const ordenes: Orden[] = []
    const n = 24
    ordenes.push({ orden: 'colocar', tipo: 'fuente-dc', ref: 'V1', en: { x: 0, y: 0 } }, { orden: 'colocar', tipo: 'tierra', ref: 'GND1', en: { x: 0, y: 40 } })
    for (let k = 1; k <= n; k++) {
      ordenes.push({ orden: 'colocar', tipo: 'resistencia', ref: `R${k}`, en: { x: 30 * k, y: 0 } })
      ordenes.push({ orden: 'colocar', tipo: 'capacitor', ref: `C${k}`, en: { x: 30 * k + 12.5, y: 20 } })
    }
    ordenes.push({ orden: 'conectar', desde: 'V1.+', hasta: 'R1.1' })
    for (let k = 1; k < n; k++) ordenes.push({ orden: 'conectar', desde: `R${k}.2`, hasta: `R${k + 1}.1` })
    for (let k = 1; k <= n; k++) ordenes.push({ orden: 'conectar', desde: `R${k}.2`, hasta: `C${k}.1` })
    for (let k = 1; ordenes.filter((o) => o.orden === 'conectar').length < 60; k++) ordenes.push({ orden: 'conectar', desde: `C${k}.2`, hasta: 'GND1.1' })
    expect(ordenes.filter((o) => o.orden === 'colocar')).toHaveLength(50)
    const t0 = performance.now()
    const nucleo = new NucleoEdicion(lib, undefined, idSecuencial())
    const r = nucleo.aplicar({ orden: 'lote', ordenes })
    const ms = performance.now() - t0
    console.info(`lote de 50 piezas y 60 conexiones: ${ms.toFixed(0)} ms`)
    if (!r.ok) throw new Error(r.motivo)
    expect(ms).toBeLessThan(1500)
  })

  function conDocientas(): NucleoEdicion {
    const n = new NucleoEdicion(lib, undefined, idSecuencial())
    const r = n.aplicar({ orden: 'lote', ordenes: Array.from({ length: 200 }, (_, k) => colocar(k)) })
    if (!r.ok) throw new Error(r.motivo)
    expect(Object.keys(n.doc.piezas)).toHaveLength(200)
    return n
  }

  it('colocar sobre 200 piezas tarda menos de 30 ms (con su deshacer incluido)', () => {
    const n = conDocientas()
    const m = medir(() => {
      const r = n.aplicar({ orden: 'colocar', tipo: 'resistencia', ref: 'RX', en: { x: 30 * 21, y: 0 } })
      if (!r.ok) throw new Error(r.motivo)
      n.deshacer()
    }, unaVez)
    console.info(`colocar sobre 200 piezas: mínimo ${m.minimo.toFixed(2)} ms, mediana ${m.mediana.toFixed(2)} ms`)
    expect(m.minimo).toBeLessThan(30)
  })

  it('propiedad sobre 200 piezas tarda menos de 30 ms', () => {
    const n = conDocientas()
    let k = 0
    const m = medir(() => {
      const r = n.aplicar({ orden: 'propiedad', ref: 'R100', prop: 'valor', valor: `${1 + (k++ % 2)}k` })
      if (!r.ok) throw new Error(r.motivo)
    }, unaVez)
    console.info(`propiedad sobre 200 piezas: mínimo ${m.minimo.toFixed(2)} ms, mediana ${m.mediana.toFixed(2)} ms`)
    expect(m.minimo).toBeLessThan(30)
  })

  it('conectar con A* sobre 200 piezas tarda menos de 100 ms (con su deshacer incluido)', () => {
    const n = conDocientas()
    const m = medir(() => {
      const r = n.aplicar({ orden: 'conectar', desde: 'R50.2', hasta: 'R51.1' })
      if (!r.ok) throw new Error(r.motivo)
      n.deshacer()
    }, unaVez)
    console.info(`conectar sobre 200 piezas: mínimo ${m.minimo.toFixed(2)} ms, mediana ${m.mediana.toFixed(2)} ms`)
    expect(m.minimo).toBeLessThan(100)
  })
})
