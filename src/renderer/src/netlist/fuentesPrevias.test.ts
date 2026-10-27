// @vitest-environment happy-dom
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../archivo/kir'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { conEtiquetas, type Parte } from '../prueba/circuitos'
import { construir, DEFINICIONES } from '../prueba/plantillasIncluidas'
import { conPiezas, piezaDePrueba } from '../prueba/piezasNuevas'
import type { PiezaDef } from '../piezas/tipos'
import { avisosDelCircuito } from '../conexiones/avisos'
import { libreriaDePrueba } from '../prueba/libreria'
import { compilarNetlist } from './netlist'

const forma = (f: 'E' | 'G' | 'H' | 'F') =>
  piezaDePrueba(`ctl-${f}`, ['P', 'N', 'CP', 'CN'], [{ id: 'k', nombre: 'Ganancia', defecto: '1' }], { tipo: 'controlada', forma: f, p: 'P', n: 'N', cp: 'CP', cn: 'CN', prop: 'k' }, f)
const opto = piezaDePrueba('opto-t', ['A', 'K', 'C', 'E'], [], {
  tipo: 'compuesto', medida: { mas: 'A', menos: 'K', i: 0 }, terminales: ['A', 'K', 'C', 'E'], internas: ['M'],
  elementos: [{ t: 'D', a: 'A', b: 'M' }, { t: 'F', p: 'C', n: 'E', cp: 'M', cn: 'K', ganancia: 0.5 }]
})
const lib = conPiezas(forma('E'), forma('G'), forma('H'), forma('F'), opto)

const V = (ref: string, v: string, mas: string, menos = '0'): Parte => ({ tipo: 'fuente-dc', ref, props: { voltaje: v }, pines: { '+': mas, '-': menos } })
const R = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'resistencia', ref, props: { valor }, pines: { '1': a, '2': b } })
const C = (ref: string, valor: string, a: string, b: string): Parte => ({ tipo: 'capacitor', ref, props: { valor }, pines: { '1': a, '2': b } })
const I = (ref: string, desde: string, hacia: string): Parte => ({ tipo: 'fuente-corriente', ref, props: { corriente: '1m' }, pines: { entrada: desde, salida: hacia } })
const ctl = (f: 'E' | 'G' | 'H' | 'F', ref: string, k: string, p: string, n: string, cp: string, cn: string): Parte => ({ tipo: `ctl-${f}`, ref, props: { k }, pines: { P: p, N: n, CP: cp, CN: cn } })

const errores = (partes: Parte[], l: Map<string, PiezaDef> = lib) => {
  const d = conEtiquetas(l, partes)
  return compilarNetlist(d, l, calcularConexiones(d, l)).errores
}

const LAZO = 'un lazo de fuentes de voltaje: agrega una resistencia en el lazo.'

describe('lazos de fuentes de voltaje', () => {
  it('una fuente V y la salida de una E en paralelo se nombran las dos', () => {
    expect(errores([V('V1', '5', 'a'), ctl('E', 'E1', '2', 'a', '0', 'b', '0'), V('V2', '1', 'b'), R('R1', '1k', 'a', '0')])).toEqual([`E1 y V1 forman ${LAZO}`])
  })

  it('un lazo de tres fuentes las nombra a las tres, en orden', () => {
    expect(errores([V('V1', '5', 'a', 'b'), V('V2', '3', 'b', 'c'), ctl('E', 'E1', '1', 'c', 'a', 'd', '0'), V('V3', '1', 'd'), R('R1', '1k', 'a', '0')])).toEqual([`E1, V1 y V2 forman ${LAZO}`])
  })

  it('una H cuya rama de control cae sobre su propia salida forma un lazo ella sola', () => {
    expect(errores([V('V1', '5', 'a'), ctl('H', 'H1', '1', 'a', '0', 'a', '0'), R('R1', '1k', 'a', '0')])).toContain(`H1 y V1 forman ${LAZO}`)
  })

  it('dos fuentes controladas en serie con una resistencia o una E que sigue a una V sin lazo no dan aviso', () => {
    expect(errores([V('V1', '5', 'a'), R('R1', '1k', 'a', 'b'), ctl('E', 'E1', '2', 'c', '0', 'b', '0'), R('R2', '1k', 'c', '0'), R('R3', '1k', 'b', '0')])).toEqual([])
  })

  it('una fuente directo sobre el primario de un transformador se simula como siempre', () => {
    const t: Parte = { tipo: 'transformador', ref: 'T1', props: {}, pines: { P1: 'p', P2: '0', S1: 's', S2: '0' } }
    const ac: Parte = { tipo: 'fuente-ac', ref: 'V1', props: {}, pines: { '+': 'p', '-': '0' } }
    expect(errores([ac, t, R('RL', '100', 's', '0')], conPiezas())).toEqual([])
  })
})

describe('cortes de fuentes de corriente', () => {
  it('un nodo al que solo llegan la salida de una G y una fuente de corriente se dice con las dos piezas', () => {
    expect(errores([V('V1', '1', 'c'), ctl('G', 'G1', '1m', 'x', '0', 'c', '0'), I('I1', '0', 'x')])).toEqual(['El nodo de G1 y I1 solo recibe fuentes de corriente: agrega una resistencia a tierra.'])
  })

  it('un grupo de nodos unidos por resistencias se dice una sola vez', () => {
    expect(errores([I('I1', '0', 'x'), R('R1', '1k', 'x', 'y'), I('I2', 'y', '0')])).toEqual(['El nodo de I1 y I2 solo recibe fuentes de corriente: agrega una resistencia a tierra.'])
  })

  it('con una resistencia a tierra, o un capacitor que la integra, no hay aviso', () => {
    expect(errores([I('I1', '0', 'x'), R('R1', '1k', 'x', '0')])).toEqual([])
    expect(errores([I('I1', '0', 'x'), C('C1', '1u', 'x', '0')])).toEqual([])
  })
})

describe('autolazo de ganancia 1', () => {
  it('una E controlada por su propia salida con ganancia 1 se dice con su pieza', () => {
    expect(errores([ctl('E', 'E1', '1', 'a', '0', 'a', '0'), R('R1', '1k', 'a', '0')])).toEqual(['E1 está controlada por su propia salida con ganancia 1: cambia la ganancia o agrega una resistencia.'])
  })
  it('con otra ganancia no hay aviso', () => {
    expect(errores([ctl('E', 'E1', '0.5', 'a', '0', 'a', '0'), R('R1', '1k', 'a', '0')])).toEqual([])
  })
})

describe('optoacoplador', () => {
  const lados = (salida: Parte[]) => [V('V1', '5', 'a'), R('R1', '330', 'a', 'b'), { tipo: 'opto-t', ref: 'U1', props: {}, pines: { A: 'b', K: '0', C: 'c', E: 'e' } }, ...salida]

  it('un lado sin tierra da el mensaje de siempre con la pista', () => {
    expect(errores(lados([V('V2', '5', 'c', 'e')]))).toEqual([
      'U1, V2 no tienen camino a tierra. El optoacoplador aísla su LED de su transistor: cada lado necesita su tierra o su referencia.'
    ])
  })
  it('«Listo para simular» dice lo mismo antes de simular', () => {
    const d = conEtiquetas(lib, lados([V('V2', '5', 'c', 'e')]))
    const textos = avisosDelCircuito(d, calcularConexiones(d, lib), lib).map((a) => a.texto)
    expect(textos).toContain('U1 y V2 no tienen camino a tierra. El optoacoplador aísla su LED de su transistor: cada lado necesita su tierra o su referencia.')
  })
  it('con su propia referencia en el lado del transistor no hay aviso', () => {
    expect(errores(lados([V('V2', '5', 'c', 'e'), R('R2', '1k', 'e', '0')]))).toEqual([])
  })
})

describe('los optoacopladores de la Librería', () => {
  const real = libreriaDePrueba().piezas
  const aislado = (opto: Parte) => [V('V1', '5', 'a0'), R('R1', '330', 'a0', 'a'), opto, V('V2', '5', 'c', 'e')]
  const DICE = 'El optoacoplador aísla su LED de su transistor: cada lado necesita su tierra o su referencia.'
  const piezas: [string, Parte][] = [
    ['4N25', { tipo: 'optoacoplador-4n25', ref: 'U1', props: { modelo: '4N25' }, pines: { A: 'a', K: '0', C: 'c', E: 'e', B: 'aire_B' } }],
    ['PC817', { tipo: 'optoacoplador-pc817', ref: 'U1', props: { modelo: 'PC817A' }, pines: { A: 'a', K: '0', C: 'c', E: 'e' } }]
  ]

  it.each(piezas)('%s: un lado sin tierra da el mensaje con su pista', (_, opto) => {
    expect(errores(aislado(opto), real)).toEqual([`U1, V2 no tienen camino a tierra. ${DICE}`])
  })
  it.each(piezas)('%s: con su propia referencia en el lado del transistor no hay aviso', (_, opto) => {
    expect(errores([...aislado(opto), R('R2', '1k', 'e', '0')], real)).toEqual([])
  })
})

describe('lo que ya simulaba sigue sin aviso nuevo', () => {
  const NUEVOS = /lazo de fuentes de voltaje|solo recibe fuentes de corriente|controlada por su propia salida|aísla su LED/
  const l = conPiezas()
  const sinAvisosNuevos = (nombre: string, d: Documento) => {
    const r = compilarNetlist(d, l, calcularConexiones(d, l))
    expect([...r.errores, ...r.avisos].filter((t) => NUEVOS.test(t)), nombre).toEqual([])
  }

  for (const def of DEFINICIONES) it(`la plantilla ${def.id}`, () => sinAvisosNuevos(def.id, construir(def, l)))

  const carpeta = join(import.meta.dirname, '../../../../PruebasManualesKirchi')
  const kirs = existsSync(carpeta) ? readdirSync(carpeta).filter((n) => n.endsWith('.kir')) : []
  for (const nombre of kirs) {
    it(`el archivo ${nombre}`, () => {
      const lectura = leerKir(new Uint8Array(readFileSync(join(carpeta, nombre))))
      expect(lectura.ok).toBe(true)
      if (lectura.ok) sinAvisosNuevos(nombre, lectura.doc)
      // El archivo se vuelve a leer igual: la prueba no depende de un documento a medio cargar.
      if (lectura.ok) expect(leerKir(escribirKir(lectura.doc, 'prueba')).ok).toBe(true)
    })
  }
})
