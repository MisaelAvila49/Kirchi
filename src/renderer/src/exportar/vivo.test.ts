import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import type { Documento } from '../doc/tipos'
import { construirEscena } from '../lienzo/escena'
import { PALETA_CLARA } from '../lienzo/paleta'
import { colorDeVoltaje } from '../lienzo/voltajes'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { Lectura } from '../sim/lectura'
import { lecturasDeMedidores, voltajesDeCables } from './vivo'

const lib = libreriaDePrueba().piezas

function conCable(): Documento {
  const d = divisor()
  d.cables.c1 = { id: 'c1', puntos: [{ x: 0, y: 20 }, { x: 10, y: 20 }] }
  d.cables.c2 = { id: 'c2', puntos: [{ x: 10, y: 20 }, { x: 10, y: 30 }] }
  d.sondas = { m1: { id: 'm1', tipo: 'medidor', x: 5, y: 20, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 0, dy: -8 }, ref: 'M1' } }
  return d
}
const lectura = (redes: [number, number][]): Lectura => ({ t: 0, ratio: 1, redes: new Map(redes), piezas: new Map() })

describe('voltajes y lecturas de la vista previa para exportar', () => {
  it('cada cable toma el voltaje de su red, y cada punto de cable el suyo; el cable de una red sin lectura no figura', () => {
    const d = conCable()
    const con = calcularConexiones(d, lib)
    const red = con.redDeCable.get('c1')!
    const v = voltajesDeCables(d, con, lectura([[red, 3.3]]), 5)
    expect(v.cables.get('c1')).toBe(3.3)
    expect(v.puntos.get('5,20')).toBeUndefined()
    expect(v.puntos.get('0,20')).toBe(3.3)
    expect(v.vmax).toBe(5)
  })

  it('el medidor sin vista previa no tiene lectura: la escena lo deja en rayas; con lectura escribe la unidad con su prefijo', () => {
    const d = conCable()
    const con = calcularConexiones(d, lib)
    const reposo = construirEscena(d, lib, con, PALETA_CLARA)
    expect(reposo.textos.some((t) => t.texto === 'V')).toBe(true)
    const red = con.redDeSonda.get('m1')!
    const lecturas = lecturasDeMedidores(d, con, lectura([[red, 0.005]]))
    expect(lecturas.get('m1')).toMatchObject({ estado: 'ok', valor: 0.005 })
    const vivo = construirEscena(d, lib, con, PALETA_CLARA, { lecturasMedidores: lecturas })
    expect(vivo.textos.some((t) => t.texto === 'mV')).toBe(true)
  })

  it('con voltajes los cables toman el color de la escala y sin ellos conservan el de edición', () => {
    const d = conCable()
    const con = calcularConexiones(d, lib)
    const red = con.redDeCable.get('c1')!
    const v = voltajesDeCables(d, con, lectura([[red, 5]]), 5)
    const colores = (e: ReturnType<typeof construirEscena>) => {
      const s = new Set<string>()
      for (let i = 0; i < e.nTrazos; i++) s.add([...e.trazos.slice(i * 9 + 5, i * 9 + 9)].map((x) => x.toFixed(3)).join(','))
      return s
    }
    const alto = colorDeVoltaje(5, 5, PALETA_CLARA).map((x) => x.toFixed(3)).join(',')
    expect(colores(construirEscena(d, lib, con, PALETA_CLARA, { voltajes: v })).has(alto)).toBe(true)
    expect(colores(construirEscena(d, lib, con, PALETA_CLARA)).has(alto)).toBe(false)
  })
})
