// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import { beforeAll, describe, expect, it } from 'vitest'
import { escribirKir, FORMATO_ACTUAL, leerKir } from '../archivo/kir'
import type { Documento } from '../doc/tipos'
import { MENSAJE_SOLO_LECTURA } from '../edicion/nucleo'
import type { PiezaDef } from '../piezas/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { ASTABLE_555, bytesDelWasm, libreriaSinDom, sesionDePrueba } from '../prueba/pasoVista'
import { perilla } from '../prueba/piezasNuevas'
import { SesionSinVentana } from './sesion'

const lib = libreriaSinDom()
const RAIZ = join(import.meta.dirname, '../../../../componentes/plantillas')
const plantilla = (id: string): Documento => JSON.parse(readFileSync(join(RAIZ, `${id}.json`), 'utf8')).circuito
const cerca = (x: number, y: number, rel: number) => Math.abs(x - y) <= rel * Math.abs(y)

let s: SesionSinVentana
beforeAll(async () => {
  s = await sesionDePrueba()
})

describe('modo sin ventana', () => {
  it('corre sin DOM', () => {
    expect(typeof document).toBe('undefined')
    expect(typeof window).toBe('undefined')
  })

  it('el divisor de voltaje incluido da 9 V · 4.7k / 14.7k en la salida', () => {
    s.abrirDocumento(plantilla('divisor-de-voltaje'))
    expect(s.compilar().ok).toBe(true)
    s.simular({ hasta: 0.01 })
    const l = s.leer()
    expect(cerca(l.piezas.R2.v, (9 * 4.7) / 14.7, 5e-3)).toBe(true)
  })

  it('el LED con resistencia pasa cerca de 9 mA', () => {
    s.abrirDocumento(plantilla('led-con-resistencia'))
    s.simular({ hasta: 0.01 })
    const i = s.leer().piezas.R1.i
    expect(i).toBeGreaterThan(8e-3)
    expect(i).toBeLessThan(10.5e-3)
  })

  it('el multímetro de 10 MΩ sobre un divisor de 1 MΩ lee 2.381 V', () => {
    const partes: Parte[] = [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1M' }, pines: { '1': 'vcc', '2': 'm' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1M' }, pines: { '1': 'm', '2': '0' } },
      { tipo: 'multimetro', ref: 'XMM1', props: { modo: 'V DC', ideal: 'no' }, pines: { '+': 'm', COM: '0' } }
    ]
    s.abrirDocumento(conEtiquetas(lib, partes))
    s.simular({ hasta: 0.01 })
    const m = s.leer().multimetros
    expect(m).toHaveLength(1)
    expect(m[0].texto).toBe('2.381 V')
  })

  it('el 555 astable da 686 Hz en el resumen del osciloscopio', () => {
    const partes: Parte[] = [...ASTABLE_555, { tipo: 'osciloscopio', ref: 'XSC1', props: {}, pines: { A: 'out', B: '0', C: '0', D: '0' } }]
    s.abrirDocumento(conEtiquetas(lib, partes))
    s.simular({ hasta: 0.04 })
    const c = s.leer({ muestras: 50 }).osciloscopios[0].canales[0]
    expect(c.canal).toBe('A')
    expect(cerca(c.frecuencia!, 686, 0.05)).toBe(true)
    expect(c.max!).toBeGreaterThan(3)
    expect(c.muestras).toHaveLength(50)
  })

  it('abrir, editar y guardar devuelve bytes que leerKir abre con el mismo documento', () => {
    const original = escribirKir(plantilla('divisor-de-voltaje'), 'prueba')
    s.abrir(original)
    const r = s.aplicar({ orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '20k' })
    expect(r.ok).toBe(true)
    const guardado = leerKir(s.guardar())
    expect(guardado.ok).toBe(true)
    if (guardado.ok) {
      expect(guardado.doc).toEqual(s.doc)
      expect(Object.values(guardado.doc.piezas).find((p) => p.ref === 'R1')!.props.valor).toBe('20k')
    }
  })

  it('un cambio descarta la simulación y exige simular otra vez', () => {
    s.abrirDocumento(plantilla('divisor-de-voltaje'))
    s.simular({ hasta: 0.001 })
    s.aplicar({ orden: 'propiedad', ref: 'R2', prop: 'valor', valor: '10k' })
    expect(() => s.leer()).toThrow(/Simula/)
    s.simular({ hasta: 0.01 })
    expect(cerca(s.leer().piezas.R2.v, 4.5, 5e-3)).toBe(true)
  })

  it('avisa de lo que el archivo usa y la librería no tiene, y abre el resto', () => {
    const recortada = new Map([...lib].filter(([t]) => t !== 'resistencia'))
    const r = new SesionSinVentana({ lib: recortada, version: 'prueba' }).abrir(escribirKir(plantilla('divisor-de-voltaje'), 'prueba'))
    expect(r.avisos.some((a) => a.startsWith('Este circuito usa lo que esta versión de Kirchi no tiene: la pieza resistencia'))).toBe(true)
    expect(s.abrir(escribirKir(plantilla('divisor-de-voltaje'), 'prueba')).avisos).toEqual([])
  })

  it('un .kir de un formato más nuevo abre en solo lectura y rechaza órdenes', () => {
    const z = unzipSync(escribirKir(plantilla('divisor-de-voltaje'), 'prueba'))
    const manifiesto = JSON.parse(new TextDecoder().decode(z['manifest.json']))
    const nuevo = zipSync({ ...z, 'manifest.json': strToU8(JSON.stringify({ ...manifiesto, formato: FORMATO_ACTUAL + 1 })) })
    const r = s.abrir(nuevo)
    expect(r.soloLectura).toBe(true)
    expect(r.avisos.length).toBeGreaterThan(0)
    const o = s.aplicar({ orden: 'propiedad', ref: 'R1', prop: 'valor', valor: '1k' })
    expect(o).toEqual({ ok: false, motivo: MENSAJE_SOLO_LECTURA })
  })

  it('un archivo dañado lanza con el motivo', () => {
    expect(() => s.abrir(new Uint8Array([1, 2, 3]))).toThrow()
  })

  it('una llamada no pasa de 10 s simulados', () => {
    s.abrirDocumento(plantilla('divisor-de-voltaje'))
    const r = s.simular({ hasta: 1e6 })
    expect(r.corte).toBe('tope-simulado')
    expect(r.t).toBeCloseTo(10, 6)
  }, 60_000)
})

// Una pieza en línea con una perilla que manda un canal: V(OUT) = 0.01 por la temperatura. Es la forma de probar los cambios
// programados sin depender del termistor.
const base = lib.get('resistencia')!
const sensor: PiezaDef = {
  ...base,
  id: 'sensor-t',
  prefijo: 'U',
  pines: [{ id: 'OUT', nombre: 'OUT', x: 0, y: 0 }, { id: 'GND', nombre: 'GND', x: 0, y: 2 }],
  props: [perilla('temp', 'Temperatura', '°C', '25', 0, 200)],
  modelo: { tipo: 'compuesto', medida: { mas: 'OUT', menos: 'GND', i: 0 }, terminales: ['OUT', 'GND'], internas: [], elementos: [{ t: 'EXT', a: 'OUT', b: 'GND', modo: 'v', canal: 'temp', k: 0.01, c: 0 }] }
}
const libConSensor = new Map(lib).set(sensor.id, sensor)
const COMPARADOR: Parte[] = [
  { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
  { tipo: 'fuente-dc', ref: 'V2', props: { voltaje: '1' }, pines: { '+': 'ref', '-': '0' } },
  { tipo: 'sensor-t', ref: 'U1', pines: { OUT: 's', GND: '0' } },
  { tipo: 'comparador', ref: 'U2', pines: { '-': 'ref', '+': 's', OUT: 'out', 'V+': 'vcc', 'V-': '0' } },
  { tipo: 'resistencia', ref: 'R1', props: { valor: '10k' }, pines: { '1': 'vcc', '2': 'out' } }
]

describe('cambios programados y muestras exactas', () => {
  let c: SesionSinVentana
  beforeAll(async () => {
    c = await SesionSinVentana.iniciar({ lib: libConSensor, wasm: bytesDelWasm(), version: 'prueba' })
  })
  const comparador = () => c.abrirDocumento(conEtiquetas(libConSensor, COMPARADOR))
  const salida = (cambioEn: number) => {
    comparador()
    const r = c.simular({
      hasta: 0.005,
      cambios: [{ t: cambioEn, ref: 'U1', prop: 'temp', valor: 120 }],
      muestrear: [1.5e-3, 2.5e-3, 3.5e-3].map((t) => ({ t, traza: 'out' }))
    })
    return r.muestras!.map((m) => m.v > 2.5)
  }

  it('mover el cambio de la temperatura mueve el instante en que conmuta el comparador', () => {
    expect(salida(2e-3)).toEqual([false, true, true])
    expect(salida(3e-3)).toEqual([false, false, true])
  })

  it('las muestras llevan su instante pedido y la traza, y un RC da el exponencial', () => {
    // La fuente salta de 0 V a 2 V (200 °C) en 1 ms y el RC carga con τ = 1 ms.
    const partes: Parte[] = [
      { tipo: 'sensor-t', ref: 'U1', props: { temp: '0' }, pines: { OUT: 'a', GND: '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: '1k' }, pines: { '1': 'a', '2': 'b' } },
      { tipo: 'capacitor', ref: 'C1', props: { valor: '1u' }, pines: { '1': 'b', '2': '0' } }
    ]
    c.abrirDocumento(conEtiquetas(libConSensor, partes))
    const tiempos = [1.5e-3, 2e-3, 3e-3, 5e-3]
    const r = c.simular({ hasta: 0.006, cambios: [{ t: 1e-3, ref: 'U1', valor: 200 }], muestrear: tiempos.map((t) => ({ t, traza: 'b' })) })
    expect(r.muestras!.map((m) => m.t)).toEqual(tiempos)
    expect(r.muestras!.every((m) => m.traza === 'b')).toBe(true)
    for (const m of r.muestras!) expect(Math.abs(m.v - 2 * (1 - Math.exp(-(m.t - 1e-3) / 1e-3)))).toBeLessThan(2e-3)
  })

  it('la lectura trae el valor vigente de cada perilla', () => {
    comparador()
    c.simular({ hasta: 0.003, cambios: [{ t: 1e-3, ref: 'U1', prop: 'temp', valor: 80 }] })
    expect(c.leer().perillas).toEqual([{ ref: 'U1', prop: 'temp', valor: 80, unidad: '°C' }])
  })

  it('dice con claridad lo que no cabe o no existe', () => {
    comparador()
    const e = (o: Parameters<SesionSinVentana['simular']>[0]) => () => c.simular(o)
    expect(e({ hasta: 0.001, cambios: [{ t: 0, ref: 'U1', valor: 250 }] })).toThrow('cambios[0]: Temperatura va de 0 °C a 200 °C.')
    expect(e({ hasta: 0.001, cambios: [{ t: 0, ref: 'U9', valor: 20 }] })).toThrow(/cambios\[0\]: No hay ninguna pieza con la referencia «U9»/)
    expect(e({ hasta: 0.001, cambios: [{ t: 0, ref: 'R1', valor: 20 }] })).toThrow(/cambios\[0\]: R1 no tiene perillas/)
    expect(e({ hasta: 0.001, cambios: [{ t: 0.002, ref: 'U1', valor: 20 }] })).toThrow('cambios[0]: t = 0.002 s pasa de «hasta» (0.001 s).')
    expect(e({ hasta: 0.001, cambios: [{ t: -1, ref: 'U1', valor: 20 }] })).toThrow('cambios[0]: t debe ser un número de segundos de 0 en adelante.')
    expect(e({ hasta: 0.001, cambios: Array.from({ length: 501 }, () => ({ t: 0, ref: 'U1', valor: 20 })) })).toThrow('Hasta 500 cambios por simulación y se pidieron 501.')
    expect(e({ hasta: 0.001, muestrear: Array.from({ length: 2001 }, () => ({ t: 0, traza: 'out' })) })).toThrow('Hasta 2000 muestras por simulación y se pidieron 2001.')
    expect(e({ hasta: 0.001, muestrear: [{ t: 0.01, traza: 'out' }] })).toThrow('muestrear[0]: t = 0.01 s pasa de «hasta» (0.001 s).')
    expect(e({ hasta: 0.001, muestrear: [{ t: 0, traza: '0' }] })).toThrow(/muestrear\[0\]: «0» es la tierra/)
  })

  it('un cambio programado a un instante que ya pasó se rechaza', () => {
    comparador()
    c.simular({ hasta: 0.002 })
    expect(() => c.simular({ hasta: 0.004, cambios: [{ t: 0.001, ref: 'U1', valor: 50 }] })).toThrow(/ya pasó/)
  })
})

describe('región de los transistores en la lectura', () => {
  const region = (rb: string) => {
    s.abrirDocumento(conEtiquetas(lib, [
      { tipo: 'fuente-dc', ref: 'V1', props: { voltaje: '5' }, pines: { '+': 'vcc', '-': '0' } },
      { tipo: 'resistencia', ref: 'R1', props: { valor: rb }, pines: { '1': 'vcc', '2': 'b' } },
      { tipo: 'resistencia', ref: 'R2', props: { valor: '1k' }, pines: { '1': 'vcc', '2': 'c' } },
      { tipo: 'npn', ref: 'Q1', pines: { B: 'b', C: 'c', E: '0' } }
    ]))
    s.simular({ hasta: 0.001 })
    return s.leer().piezas.Q1.region
  }
  it('un NPN con poca base está en activa y con mucha, en saturación, con los nombres de la tabla común', () => {
    expect(region('1M')).toBe('activa')
    expect(region('10k')).toBe('saturación')
  })
})
