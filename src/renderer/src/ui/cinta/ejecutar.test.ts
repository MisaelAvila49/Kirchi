import { describe, expect, it } from 'vitest'
import { estadoCintaDePrueba as base } from '../../prueba/cinta'
import { MENSAJE_DETENER_PARA_EDITAR } from '../vistaPrevia'
import { COMANDOS, type IdComando } from './comandos'
import { crearEjecutor, type Acciones } from './ejecutar'
import type { EstadoCinta } from './estado'

function armar(estado: () => EstadoCinta) {
  const hechos: string[] = []
  const avisos: string[] = []
  const acciones = Object.fromEntries((Object.keys(COMANDOS) as IdComando[]).map((id) => [id, (ancla: HTMLElement) => hechos.push(`${id}@${ancla.id}`)])) as unknown as Acciones
  const ejecutar = crearEjecutor({ acciones, estado, tecla: () => undefined, avisar: (t) => avisos.push(t) })
  return { ejecutar, hechos, avisos }
}
const ancla = { id: 'boton' } as HTMLElement

describe('ejecutor de la cinta', () => {
  it('un comando activo hace su acción con el control desde donde se pidió', () => {
    const { ejecutar, hechos, avisos } = armar(() => base())
    expect(ejecutar('girar', ancla)).toBe(true)
    expect(hechos).toEqual(['girar@boton'])
    expect(avisos).toEqual([])
  })

  it('uno deshabilitado no actúa y dice por qué', () => {
    const { ejecutar, hechos, avisos } = armar(() => base({ fase: 'corriendo' }))
    expect(ejecutar('borrar', ancla)).toBe(false)
    expect(hechos).toEqual([])
    expect(avisos).toEqual([MENSAJE_DETENER_PARA_EDITAR])
  })

  it('revisa el estado de ese instante, no el de cuando se armó', () => {
    let e = base({ puedePegar: false })
    const { ejecutar, hechos, avisos } = armar(() => e)
    ejecutar('pegar', ancla)
    e = base()
    ejecutar('pegar', ancla)
    expect(avisos).toEqual(['Primero copia algo.'])
    expect(hechos).toEqual(['pegar@boton'])
  })
})
