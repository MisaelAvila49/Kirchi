// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { PROPS_DE_REQUISITO } from '../archivo/requisitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { FilaDatos, PiezaDef } from './tipos'

const FABRICANTES = [
  'ti.com', 'onsemi.com', 'st.com', 'nexperia.com', 'vishay.com', 'diodes.com', 'microchip.com', 'analog.com', 'infineon.com',
  'bourns.com', 'kingbrightusa.com',
  // Central Semiconductor es el único fabricante de los JFET cuya hoja se bajó de su propio sitio.
  'centralsemi.com'
]
// Combinaciones sin integrado comercial (AND de 5 a 8, XOR de 3 o más, decodificador activo en bajo fuera del 74LS47, display azul o blanco): el inspector dice que no hay fila.
const SIN_FILA = new Set(["and", "nand", "nor", "or", "xor", "xnor", "decodificador-7seg", "display-7seg"])
const piezas = (): PiezaDef[] => [...libreriaDePrueba().piezas.values()].filter((d) => !d.oculta)
const lista = (por: string | [string, string] | undefined): string[] => (por === undefined ? [] : typeof por === 'string' ? [por] : por)

/** Las claves que debe tener `valores`: el producto de las opciones de las propiedades de `por`. */
function clavesEsperadas(d: PiezaDef): string[] {
  const por = lista(d.datos?.por)
  if (!por.length) return ['*']
  const opciones = por.map((id) => d.props.find((p) => p.id === id)?.opciones ?? [])
  return opciones.reduce<string[]>((acc, ops) => acc.flatMap((a) => ops.map((o) => (a === '' ? o : `${a}|${o}`))), [''])
}

const filas = (): { id: string; clave: string; fila: FilaDatos }[] =>
  piezas().flatMap((d) => Object.entries(d.datos?.valores ?? {}).map(([clave, fila]) => ({ id: d.id, clave, fila })))

describe('datos de las piezas', () => {
  it('las 102 piezas de la Librería traen la clave datos', () => {
    expect(piezas().filter((d) => !d.datos).map((d) => d.id)).toEqual([])
  })

  it('toda opción visible de la propiedad que elige la fila tiene su fila', () => {
    const faltan = piezas().filter((d) => !SIN_FILA.has(d.id)).flatMap((d) => clavesEsperadas(d).filter((k) => !d.datos?.valores[k]).map((k) => `${d.id}:${k}`))
    expect(faltan).toEqual([])
  })

  it('toda fila física tiene encapsulado y patillas, o el pendiente que lo dice', () => {
    const mal = filas()
      .filter(({ fila }) => !fila.virtual && !fila.pendiente?.presentaciones && !fila.pendiente?.patillas && !fila.presentaciones?.length)
      .map((f) => `${f.id}:${f.clave}`)
    expect(mal).toEqual([])
  })

  it('toda hoja es https de un dominio de fabricante', () => {
    const mal = filas()
      .filter(({ fila }) => fila.hoja !== undefined)
      .filter(({ fila }) => {
        const u = new URL(fila.hoja!)
        return u.protocol !== 'https:' || !FABRICANTES.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))
      })
      .map((f) => `${f.id}:${f.clave} ${f.fila.hoja}`)
    expect(mal).toEqual([])
  })

  it('todo LCSC lleva fecha o marca de sin verificar', () => {
    const mal = filas().flatMap(({ id, clave, fila }) =>
      (fila.presentaciones ?? []).filter((p) => p.lcsc && (p.lcsc.comprobado === undefined) === (p.lcsc.sinVerificar === undefined)).map(() => `${id}:${clave}`)
    )
    expect(mal).toEqual([])
  })

  it('la propiedad que elige parámetros del modelo está en PROPS_DE_REQUISITO', () => {
    const permitidas: readonly string[] = PROPS_DE_REQUISITO
    const mal = piezas().flatMap((d) => {
      const m = d.modelo as unknown as { por?: { prop?: string } } | undefined
      // Las demás propiedades de datos.por (entradas, hasta, tipo) eligen el encapsulado, no parámetros del modelo.
      const props = m?.por?.prop ? [m.por.prop] : []
      return props.filter((p) => !permitidas.includes(p)).map((p) => `${d.id}.${p}`)
    })
    expect(mal).toEqual([])
  })

  it('imprime los conteos', () => {
    const f = filas()
    const pres = f.reduce((n, x) => n + (x.fila.presentaciones?.length ?? 0), 0)
    const pend = f.filter((x) => x.fila.pendiente).length
    console.log(`Datos: ${piezas().length} piezas, ${f.length} filas, ${pres} presentaciones, ${pend} filas con pendientes`)
    expect(f.length).toBeGreaterThan(0)
  })
})
