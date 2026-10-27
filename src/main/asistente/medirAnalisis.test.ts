// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Corrida, ResultadoMapeado } from '../../compartido/analisis/resultados'
import { bytesDelWasm, libreriaSinDom } from '../../renderer/src/prueba/pasoVista'
import { carpetaHerramientas } from '../recursos'
import { localizarNgspice, ServicioNgspice } from '../servicioNgspice'
import { Herramientas, type DepsHerramientas, type Respuesta } from './herramientas'
import { medirResultado } from './medidas'

/** Una corrida de CA con una sola serie en dB, con el eje logarítmico. */
function ac(f: number[], db: number[]): ResultadoMapeado {
  const c: Corrida = { etiqueta: '', eje: Float64Array.from(f), series: [{ id: 'v:2', etiqueta: 'V(Salida)', unidad: 'dB', magnitud: 'V', valores: Float64Array.from(db), fase: Float64Array.from(db.map((d) => d * 2)) }] }
  return { tipo: 'ac', ejeNombre: 'Frecuencia', ejeUnidad: 'Hz', logX: true, corridas: [c], avisos: [] }
}
const decada = (desde: number, hasta: number, n: number) => {
  const total = Math.round(Math.log10(hasta / desde) * n)
  return Array.from({ length: total + 1 }, (_, k) => desde * Math.pow(10, k / n))
}

describe('medirResultado', () => {
  it('un pasa bajas: la banda llega al inicio del barrido y cae 3 dB cerca de 159 Hz', () => {
    const f = decada(1, 1e5, 100)
    const m = medirResultado(ac(f, f.map((x) => -10 * Math.log10(1 + (x / 159.155) ** 2))))!
    const a = m.trazas[0].ac!
    expect(a.referenciaDb).toBeCloseTo(0, 3)
    expect(a.menos3dB.desdeHz).toBeNull()
    expect(a.menos3dB.hastaHz!).toBeGreaterThan(155)
    expect(a.menos3dB.hastaHz!).toBeLessThan(163)
    expect(a.pico).toBeUndefined()
    expect(a.muesca).toBeUndefined()
  })

  it('un notch: la muesca en su frecuencia, con su profundidad y su ancho a −3 dB', () => {
    // La rejilla casi nunca cae justo en la muesca: con la frecuencia incluida (60 Hz) el fondo se ve entero.
    const f = [...decada(10, 1e4, 200), 60].sort((a, b) => a - b)
    // Notch ideal en 60 Hz con Q = 5.
    const db = f.map((x) => {
      const r = x / 60
      return 20 * Math.log10(Math.max(1e-6, Math.abs(1 - r * r) / Math.hypot(1 - r * r, r / 5)))
    })
    const m = medirResultado(ac(f, db))!
    const mu = m.trazas[0].ac!.muesca!
    expect(mu.f).toBe(60)
    expect(mu.profundidadDb).toBeGreaterThan(40)
    // El ancho a −3 dB de un notch es f0 / Q = 12 Hz.
    expect(mu.hastaHz! - mu.desdeHz!).toBeGreaterThan(11)
    expect(mu.hastaHz! - mu.desdeHz!).toBeLessThan(13)
  })

  it('un pico de resonancia: el pico en su frecuencia y la banda a −3 dB a ambos lados', () => {
    const f = decada(10, 1e4, 200)
    const db = f.map((x) => 20 * Math.log10(1 / Math.hypot(1 - (x / 1000) ** 2, x / 1000 / 5)))
    const a = medirResultado(ac(f, db))!.trazas[0].ac!
    expect(a.pico!.f).toBeGreaterThan(950)
    expect(a.pico!.f).toBeLessThan(1050)
    expect(a.menos3dB.desdeHz).not.toBeNull()
    expect(a.menos3dB.hastaHz).not.toBeNull()
  })

  it('el valor en una x se interpola en log de la frecuencia y dice null fuera del rango', () => {
    const m = medirResultado(ac([10, 100, 1000], [0, -20, -40]), [31.6227766, 5, 100, 5000])!
    const [a, fuera, exacta, fuera2] = m.trazas[0].en!
    expect(a.valor!).toBeCloseTo(-10, 3)
    expect(a.fase!).toBeCloseTo(-20, 3)
    expect(fuera.valor).toBeNull()
    expect(exacta.valor).toBe(-20)
    expect(fuera2.valor).toBeNull()
  })

  it('punto de operación y Fourier no tienen curvas', () => {
    expect(medirResultado({ tipo: 'op', ejeNombre: '', ejeUnidad: '', logX: false, corridas: [], avisos: [] })).toBeNull()
  })
})

const raiz = join(import.meta.dirname, '../../..')
const ejecutable = localizarNgspice({ empaquetado: false, carpetaHerramientas: carpetaHerramientas({ empaquetado: false, resourcesPath: '', appPath: raiz }), appPath: raiz })
const hay = (() => {
  if (!ejecutable) return false
  const r = spawnSync(ejecutable, ['-n', '-v'], { encoding: 'utf8', windowsHide: true })
  return /ngspice-47\b/.test(`${r.stdout}${r.stderr}`)
})()
const servicio = new ServicioNgspice({ ejecutable: ejecutable ?? 'ngspice', limiteMs: 120_000 })
const lib = libreriaSinDom()
let base: string
let h: Herramientas
const deps = (): DepsHerramientas => ({ lib, wasm: bytesDelWasm(), version: 'prueba', dirDatos: join(base, 'datos'), carpetaPorOmision: join(base, 'Asistente'), ajustes: () => ({ activo: true, carpeta: null }), analisis: (p) => servicio.ejecutar(0, p) })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: Respuesta): any => JSON.parse((r.content[0] as { text: string }).text)
const texto = (r: Respuesta): string => (r.content[0] as { text: string }).text

/** Divisor de 9 V con 10 kΩ y 4.7 kΩ: el punto medio mide 2.878 V. */
const DIVISOR = [
  { orden: 'colocar', tipo: 'fuente-dc', clave: 'v', en: { x: 0, y: 0 }, props: { voltaje: '9' } },
  { orden: 'colocar', tipo: 'resistencia', clave: 'r1', en: { x: 25, y: -5 }, valor: '10k' },
  { orden: 'colocar', tipo: 'resistencia', clave: 'r2', en: { x: 50, y: 0 }, valor: '4.7k' },
  { orden: 'colocar', tipo: 'tierra', clave: 'g', en: { x: 50, y: 15 } },
  { orden: 'conectar', desde: 'v.+', hasta: 'r1.1' },
  { orden: 'conectar', desde: 'r1.2', hasta: 'r2.1' },
  { orden: 'conectar', desde: 'r2.2', hasta: 'g.1' },
  { orden: 'conectar', desde: 'v.-', hasta: 'g.1' }
]

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'kirchi-medir-'))
  mkdirSync(join(base, 'datos'))
  h = new Herramientas(deps())
  await h.llamar('crear_circuito', { nombre: 'divisor' })
  const r = await h.llamar('aplicar_lote', { circuito: 'divisor', ordenes: DIVISOR })
  if (r.isError) throw new Error(texto(r))
})
afterAll(() => {
  h.cerrar()
  rmSync(base, { recursive: true, force: true })
})

describe.skipIf(!hay)('medir_analisis', () => {
  const DC = { tipo: 'dc', fuente: 'V1', desde: 0, hasta: 9, paso: 1 }
  it('devuelve mínimo, máximo y el valor en una x sin traer las muestras', async () => {
    const r = json(await h.llamar('medir_analisis', { circuito: 'divisor', config: DC, trazas: ['R1.2'], en: [4.5, 20] }))
    const t = r.trazas[0]
    expect(t.traza).toBe('V(R1.2)')
    expect(t.min).toEqual({ x: 0, valor: 0 })
    expect(t.max.x).toBe(9)
    expect(t.max.valor).toBeCloseTo((9 * 4.7) / 14.7, 4)
    expect(t.en[0].valor).toBeCloseTo((4.5 * 4.7) / 14.7, 4)
    expect(t.en[1].valor).toBeNull()
    expect(JSON.stringify(r)).not.toContain('"valores"')
  })

  it('mide un análisis guardado por su nombre y dice el motivo si no existe o si no tiene curvas', async () => {
    await h.llamar('analizar', { circuito: 'divisor', config: DC, trazas: ['R1.2'], nombre: 'Barrido', guardar: true })
    const r = json(await h.llamar('medir_analisis', { circuito: 'divisor', analisis: 'barrido' }))
    expect(r.analisis).toBe('Barrido')
    expect(r.trazas.length).toBeGreaterThan(0)
    const nada = await h.llamar('medir_analisis', { circuito: 'divisor', analisis: 'no existe' })
    expect(nada.isError).toBe(true)
    const op = await h.llamar('medir_analisis', { circuito: 'divisor', config: { tipo: 'op' } })
    expect(op.isError).toBe(true)
    expect(texto(op)).toContain('analizar')
  })

  it('analizar con «incluir» deja 60 Hz exacto en el eje, y medir_analisis lo lee ahí', async () => {
    const config = { tipo: 'ac', barrido: 'dec', puntos: 5, desde: 1, hasta: 1000, fuente: 'V1', magnitud: 1, incluir: [60] }
    const r = json(await h.llamar('analizar', { circuito: 'divisor', config, trazas: ['R1.2'] }))
    expect(r.corridas[0].eje.valores).toContain(60)
    const m = json(await h.llamar('medir_analisis', { circuito: 'divisor', config, trazas: ['R1.2'], en: [60] }))
    expect(m.trazas[0].en[0].x).toBe(60)
    expect(m.trazas[0].en[0].valor).toBeCloseTo(20 * Math.log10(4.7 / 14.7), 3)
    const fuera = await h.llamar('analizar', { circuito: 'divisor', config: { ...config, incluir: [5000] }, trazas: ['R1.2'] })
    expect(fuera.isError).toBe(true)
  })
})
