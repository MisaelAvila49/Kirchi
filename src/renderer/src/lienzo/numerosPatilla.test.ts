// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { calcularConexiones } from '../conexiones/conexiones'
import { libreriaDePrueba } from '../prueba/libreria'
import { construirEscena } from './escena'
import { ZOOM_100 } from './medidas'
import { numerosDePieza, TAM_NUMERO_PATILLA, textosNumerosPatilla } from './numerosPatilla'
import { textosVisibles } from './texto'
import { PALETA_CLARA } from './paleta'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, props: Record<string, string> = {}, id = 'p'): Pieza => ({ id, tipo, ref: 'U1', x: 10, y: 20, rot: 0, espejo: false, props })
const doc = (...ps: Pieza[]): Documento => ({ ...documentoVacio(), piezas: Object.fromEntries(ps.map((p) => [p.id, p])) })

describe('números de patilla', () => {
  it('el número cambia con la unidad', () => {
    const def = lib.get('nand')!
    expect(numerosDePieza(pieza('nand', { paquete: 'U1', unidad: 'A' }), def)).toEqual({ A: '1', B: '2', Y: '3' })
    expect(numerosDePieza(pieza('nand', { paquete: 'U1', unidad: 'C' }), def)).toEqual({ A: '9', B: '10', Y: '8' })
  })

  it('sin unidad guardada toma la primera', () => {
    expect(numerosDePieza(pieza('nand'), lib.get('nand')!)).toEqual({ A: '1', B: '2', Y: '3' })
  })

  it('cambia con la familia y con las entradas', () => {
    const def = lib.get('biestable-d')!
    expect(numerosDePieza(pieza('biestable-d', { familia: '74HC' }), def)).toMatchObject({ CLR: '1', Q: '5' })
    expect(numerosDePieza(pieza('biestable-d', { familia: 'CD4000B' }), def)).toMatchObject({ CLR: '4', Q: '1' })
    expect(numerosDePieza(pieza('nand', { entradas: '3' }), lib.get('nand')!)).toMatchObject({ C: '13', Y: '12' })
  })

  it('una pieza sin presentación o fuera de Digitales e Integrados no dibuja nada', () => {
    const def = lib.get('resistencia')!
    expect(textosNumerosPatilla(pieza('resistencia'), def)).toEqual([])
    const sinDatos = { ...lib.get('nand')!, datos: undefined }
    expect(numerosDePieza(pieza('nand'), sinDatos)).toBeNull()
    expect(textosNumerosPatilla(pieza('nand'), sinDatos)).toEqual([])
  })

  it('una pieza que ya rotula sus números no los duplica', () => {
    expect(textosNumerosPatilla(pieza('temporizador-555'), lib.get('temporizador-555')!)).toEqual([])
  })

  it('un texto por pin con número, en Geist Mono a 1 mm y tinta de valor, a menos de 2.5 unidades del pin', () => {
    const def = lib.get('nand')!
    const p = pieza('nand', { paquete: 'U1', unidad: 'B' })
    const t = textosNumerosPatilla(p, def)
    expect(t.map((x) => x.texto).sort()).toEqual(['4', '5', '6'])
    for (const x of t) {
      expect(x.fuente).toBe('cifras')
      expect(x.color).toBe('valor')
      expect(x.tamaño).toBeCloseTo(TAM_NUMERO_PATILLA / 1.25)
    }
    for (const pin of def.pines) {
      const x = t.find((q) => q.texto === numerosDePieza(p, def)![pin.id])!
      expect(Math.hypot(x.x - (p.x + pin.x), x.y - (p.y + pin.y))).toBeLessThan(2.5)
    }
  })

  it('se ven con el zoom al 100 %, no solo al acercarse', () => {
    const t = textosNumerosPatilla(pieza('nand'), lib.get('nand')!)
    const cam = { x: 0, y: 0, zoom: ZOOM_100 }
    expect(textosVisibles(t, cam, 2000, 2000)).toHaveLength(t.length)
  })

  it('la escena los dibuja solo si se piden, y no mueve nada más', () => {
    const d = doc(pieza('nand'), pieza('resistencia', {}, 'r'))
    const con = calcularConexiones(d, lib)
    const sin = construirEscena(d, lib, con, PALETA_CLARA, {})
    const con2 = construirEscena(d, lib, con, PALETA_CLARA, { numerosPatilla: true })
    expect(con2.textos.length - sin.textos.length).toBe(3)
    expect(con2.textos.filter((x) => ['1', '2', '3'].includes(x.texto))).toHaveLength(3)
    expect(con2.caja).toEqual(sin.caja)
  })
})
