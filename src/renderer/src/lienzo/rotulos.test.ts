// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { cuerpoEnMundo } from '../editor/colision'
import type { Documento, Pieza, Rotacion } from '../doc/tipos'
import { transformar } from '../piezas/transformar'
import { libreriaDePrueba } from '../prueba/libreria'
import { etiquetasSinChoques, cajaTexto } from './apartar'
import { construirEscena } from './escena'
import { rotulosDePieza, textoDeValor, textosLocales } from './etiquetas'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, rot: Rotacion, espejo: boolean, props: Record<string, string> = {}): Pieza => ({
  id: 'p', tipo, ref: 'X1', x: 10, y: 20, rot, espejo, props
})
const ORIENTACIONES = ([0, 90, 180, 270] as const).flatMap((rot) => [false, true].map((espejo) => ({ rot, espejo })))
const rotulosDe = (id: string) => lib.get(id)!.rotulos!

describe('rótulos del símbolo', () => {
  it('la librería de prueba carga sin errores', () => {
    expect(libreriaDePrueba().errores).toEqual([])
  })

  it('el 555 tiene los 8 nombres y los 8 números de pin', () => {
    const r = rotulosDe('temporizador-555')
    expect(r.filter((x) => x.tinta === 'pieza').map((x) => x.texto).sort()).toEqual(['CV', 'DIS', 'GND', 'OUT', 'RESET', 'THR', 'TRIG', 'VCC'])
    expect(r.filter((x) => x.tinta === 'valor').map((x) => x.texto).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    // Cada nombre queda junto al pin que nombra (misma pieza.json): mismo lado y a menos de 4 unidades.
    const def = lib.get('temporizador-555')!
    const clave: Record<string, string> = { GND: '1', TRIG: '2', OUT: '3', RESET: '4', CV: '5', THR: '6', DIS: '7', VCC: '8' }
    for (const [nombre, pin] of Object.entries(clave)) {
      const rot = r.find((x) => x.texto === nombre)!
      const num = r.find((x) => x.texto === pin)!
      const p = def.pines.find((q) => q.id === pin)!
      expect(Math.hypot(rot.x - p.x, rot.y - p.y), `${nombre} lejos del pin ${pin}`).toBeLessThan(4)
      expect(Math.hypot(num.x - p.x, num.y - p.y), `número ${pin} lejos de su pin`).toBeLessThan(2.5)
    }
  })

  it('el display rotula sus ocho segmentos y el común', () => {
    expect(rotulosDe('display-7seg').map((x) => x.texto)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp', 'COM'])
  })

  it.each(['temporizador-555', 'display-7seg', 'motor-dc', 'amp-op', 'fuente-dc'])('%s: el ancla gira con la pieza y el texto queda derecho en las 8 orientaciones', (id) => {
    const def = lib.get(id)!
    for (const { rot, espejo } of ORIENTACIONES) {
      const p = pieza(id, rot, espejo)
      const t = rotulosDePieza(p, def)
      expect(t).toHaveLength(def.rotulos!.length)
      t.forEach((x, i) => {
        const r = def.rotulos![i]
        const [ax, ay] = transformar(r.x, r.y, rot, espejo)
        expect(x.x).toBeCloseTo(p.x + ax, 9)
        expect(x.y).toBeCloseTo(p.y + ay, 9)
        // El texto nunca gira ni se refleja: no hay campo de ángulo y la alineación es horizontal.
        expect(['izq', 'centro', 'der']).toContain(x.alinear)
        expect(x.texto).toBe(r.texto)
        expect(x.ancho!).toBeGreaterThan(0)
      })
    }
  })

  it('izq y der siguen al lado del ancla con espejo y 180°; vertical se centra', () => {
    const def = lib.get('temporizador-555')!
    const idx = def.rotulos!.findIndex((r) => r.texto === 'TRIG') // izq
    const alinear = (rot: Rotacion, espejo: boolean) => rotulosDePieza(pieza('temporizador-555', rot, espejo), def)[idx].alinear
    expect(def.rotulos![idx].alinear).toBe('izq')
    expect(alinear(0, false)).toBe('izq')
    expect(alinear(0, true)).toBe('der')
    expect(alinear(180, false)).toBe('der')
    expect(alinear(180, true)).toBe('izq')
    for (const espejo of [false, true]) for (const rot of [90, 270] as const) expect(alinear(rot, espejo)).toBe('centro')
    // «arriba» (GND, colgado del borde inferior) queda centrado sin girar y crece hacia adentro del cuerpo al girar 90° o 270°.
    const gnd = def.rotulos!.findIndex((r) => r.texto === 'GND')
    expect(def.rotulos![gnd].alinear).toBe('arriba')
    const g = (rot: Rotacion, espejo = false) => rotulosDePieza(pieza('temporizador-555', rot, espejo), def)[gnd]
    expect(g(0).alinear).toBe('centro')
    expect(g(180).alinear).toBe('centro')
    // 90°: el ancla (0, 5.2) pasa al borde izquierdo y el texto crece hacia la derecha (adentro).
    expect(g(90).alinear).toBe('izq')
    expect(g(90).x).toBeLessThan(10)
    // 270°: el ancla pasa al borde derecho y el texto crece hacia la izquierda (adentro).
    expect(g(270).alinear).toBe('der')
    expect(g(270).x).toBeGreaterThan(10)
    // «abajo» (RESET, VCC) crece al revés.
    const reset = def.rotulos!.findIndex((r) => r.texto === 'RESET')
    expect(def.rotulos![reset].alinear).toBe('abajo')
    expect(rotulosDePieza(pieza('temporizador-555', 90, false), def)[reset].alinear).toBe('der')
    expect(rotulosDePieza(pieza('temporizador-555', 270, false), def)[reset].alinear).toBe('izq')
    // Un rótulo centrado queda centrado siempre.
    const m = lib.get('motor-dc')!
    for (const { rot, espejo } of ORIENTACIONES) expect(rotulosDePieza(pieza('motor-dc', rot, espejo), m)[0].alinear).toBe('centro')
  })

  it('un texto izq/der nunca cruza al otro lado de su ancla respecto del símbolo', () => {
    // El centro del texto queda del mismo lado del ancla que en el símbolo sin girar, medido en el mundo.
    const def = lib.get('display-7seg')!
    for (const { rot, espejo } of ORIENTACIONES) {
      const p = pieza('display-7seg', rot, espejo)
      rotulosDePieza(p, def).forEach((t, i) => {
        if (def.rotulos![i].alinear !== 'izq' || t.alinear === 'centro') return
        const [dx] = transformar(1, 0, rot, espejo)
        expect(t.alinear).toBe(dx > 0 ? 'izq' : 'der')
      })
    }
  })

  it('los nombres de pin del 555 quedan dentro del cuerpo en las 8 orientaciones', () => {
    const def = lib.get('temporizador-555')!
    for (const { rot, espejo } of ORIENTACIONES) {
      const p = pieza('temporizador-555', rot, espejo)
      const c = cuerpoEnMundo(p, def)
      const dentro = rotulosDePieza(p, def).filter((t) => /^[A-Z]{2,5}$/.test(t.texto))
      expect(dentro).toHaveLength(8)
      for (const t of dentro) {
        const b = cajaTexto(t, 0)
        expect(b.minX, `${rot}° espejo=${espejo} «${t.texto}»`).toBeGreaterThanOrEqual(c.minX - 0.3)
        expect(b.maxX, `${rot}° espejo=${espejo} «${t.texto}»`).toBeLessThanOrEqual(c.maxX + 0.3)
        expect(b.minY).toBeGreaterThanOrEqual(c.minY - 0.3)
        expect(b.maxY).toBeLessThanOrEqual(c.maxY + 0.3)
      }
    }
  })

  it('el motor y el amplificador ya no dibujan letras ni signos con trazos', () => {
    const g = lib.get('motor-dc')!.geometria
    const motor = g.fija!.trazos
    // Solo queda la circunferencia (r = 2), los dos terminales y la marca «+»; las tres marcas del rotor son su capa,
    // cerca del borde y lejos de la «M» (de r = 1.35 a 1.85).
    for (const t of g.capas!.rotor.trazos) for (let i = 0; i + 1 < t.length; i += 2) expect(Math.hypot(t[i], t[i + 1])).toBeGreaterThan(1.3)
    for (const t of motor)
      for (let i = 0; i + 1 < t.length; i += 2) {
        const r = Math.hypot(t[i], t[i + 1])
        const esMarca = t[i] < -2.5 && Math.abs(t[i + 1]) < 1.5 && t.length <= 4 && t[i] > -4 // el «+» junto al terminal
        expect(r > 1.95 || esMarca, `trazo suelto dentro del motor en (${t[i]}, ${t[i + 1]})`).toBe(true)
      }
    const amp = lib.get('amp-op')!.geometria.trazos
    // Triángulo + 2 entradas + salida + 2 alimentaciones: 6 trazos y ninguno entre x = -3.9 y x = -2.
    expect(amp.length).toBe(6)
    for (const t of amp) for (let i = 0; i + 1 < t.length; i += 2) expect(t[i] <= -3.9 || t[i] >= -2 || Math.abs(t[i + 1]) >= 3.9 || t.length > 4, `signo suelto en (${t[i]}, ${t[i + 1]})`).toBe(true)
    const dc = lib.get('fuente-dc')!.geometria.trazos
    // El «+» de la fuente DC vuelve a ser de trazos: siempre visible y igual girado. El «−» sigue siendo rótulo.
    const corto = (t: number[]) => t.length === 4 && Math.abs(t[1] - t[3]) < 1e-9 && Math.abs(t[0]) < 0.5 && Math.abs(t[1]) < 1
    expect(dc.some((t) => corto(t) && t[1] < 0)).toBe(true)
    expect(dc.some((t) => corto(t) && t[1] > 0)).toBe(false)
  })

  it('las piezas sin rótulos no producen ninguno', () => {
    for (const [id, def] of lib) if (!def.rotulos) expect(rotulosDePieza(pieza(id, 0, false), def), id).toEqual([])
  })
})

describe('modelo visible (mostrar)', () => {
  const valor = (id: string, props: Record<string, string> = {}) => textoDeValor(pieza(id, 0, false, props), lib.get(id)!)

  it('muestra el modelo por omisión y el elegido', () => {
    expect(valor('npn')).toBe('2N2222')
    expect(valor('npn', { modelo: 'BC547' })).toBe('BC547')
    expect(valor('pnp')).toBe('2N2907')
    expect(valor('mosfet-n')).toBe('2N7000')
    expect(valor('mosfet-p')).toBe('BS250')
    expect(valor('amp-op')).toBe('LM741')
    expect(valor('temporizador-555')).toBe('NE555')
    expect(valor('temporizador-555', { modelo: 'LM555' })).toBe('LM555')
  })

  it('solo esos treinta y tres modelos tienen mostrar', () => {
    const con = [...lib.values()].filter((d) => d.props.some((p) => p.mostrar)).map((d) => d.id).sort()
    expect(con).toEqual(['amp-op', 'comparador', 'cristal', 'diac', 'igbt', 'ina128', 'jfet-n', 'jfet-p', 'l298', 'lm35', 'lm386', 'lm4040', 'mosfet-n', 'mosfet-p', 'motor-pasos-bipolar', 'motor-pasos-unipolar', 'npn', 'optoacoplador-4n25', 'optoacoplador-pc817', 'pnp', 'puente-rectificador', 'punta-logica', 'regulador-ajustable', 'regulador-negativo', 'regulador-positivo', 'scr', 'temporizador-555', 'tl431', 'tmp36', 'transformador', 'triac', 'ujt', 'uln2003'])
    for (const id of con) {
      const p = lib.get(id)!.props.find((q) => q.mostrar)!
      expect(p.opciones, id).toContain(p.defecto)
    }
  })

  it('el modelo sale como valor en el texto de la pieza (junto a la referencia)', () => {
    const t = textosLocales(pieza('npn', 0, false), lib.get('npn')!)
    expect(t.map((x) => x.texto)).toEqual(['X1', '2N2222'])
    expect(t[1].color).toBe('valor')
  })

  it('el resto de las piezas dan el mismo valor que antes (primera propiedad numérica o nada)', () => {
    const sinMostrar = [...lib.values()].filter((d) => !d.props.some((p) => p.mostrar))
    expect(sinMostrar.length).toBeGreaterThan(20)
    for (const def of sinMostrar) {
      const antes = def.props.find((d) => !d.opciones)
      const esperado = antes ? (valor(def.id) ?? '') : null
      expect(valor(def.id), def.id).toBe(esperado === '' ? null : esperado)
      if (!antes) expect(valor(def.id), def.id).toBeNull()
    }
    expect(valor('resistencia')).toBe('1 kΩ')
  })
})

describe('rótulos en la escena', () => {
  const doc = (p: Pieza): Documento => ({ piezas: { [p.id]: p }, cables: {}, etiquetas: {}, notas: {} }) as unknown as Documento
  const caja = (t: { x: number; y: number; ancho?: number; tamaño: number; alinear: 'izq' | 'der' | 'centro'; texto: string }) => cajaTexto(t as never, 0)
  const cruza = (a: ReturnType<typeof caja>, b: ReturnType<typeof caja>) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY

  it('la escena dibuja los rótulos además de la referencia y el valor', () => {
    const e = construirEscena(doc(pieza('temporizador-555', 0, false)), lib, { uniones: [] } as never, PALETA_CLARA)
    expect(e.textos.map((t) => t.texto).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', 'CV', 'DIS', 'GND', 'NE555', 'OUT', 'RESET', 'THR', 'TRIG', 'VCC', 'X1'].sort())
  })

  it.each(['temporizador-555', 'display-7seg', 'npn', 'amp-op', 'motor-dc', 'fuente-dc'])('%s: referencia y valor no tocan el cuerpo ni los rótulos en las 8 orientaciones', (id) => {
    const def = lib.get(id)!
    for (const { rot, espejo } of ORIENTACIONES) {
      const p = pieza(id, rot, espejo)
      const sitios = etiquetasSinChoques(doc(p), lib).get('p')!
      const c = cuerpoEnMundo(p, def)
      for (const t of sitios) {
        const b = caja(t)
        expect(cruza(b, c), `${id} ${rot}° espejo=${espejo} «${t.texto}» toca el cuerpo`).toBe(false)
        for (const r of rotulosDePieza(p, def)) expect(cruza(b, caja(r)), `${id} ${rot}° espejo=${espejo} «${t.texto}» pisa el rótulo «${r.texto}»`).toBe(false)
      }
    }
  })

  it('los rótulos de una pieza apartan la referencia de otra pieza cercana', () => {
    // Una referencia que caería sobre el número de un pin se corre a otro lugar.
    const p = pieza('temporizador-555', 0, false)
    const rot = rotulosDePieza(p, lib.get(p.tipo)!)
    const sitios = etiquetasSinChoques(doc(p), lib).get('p')!
    for (const t of sitios) for (const r of rot) expect(cruza(caja(t), caja(r))).toBe(false)
  })
})
