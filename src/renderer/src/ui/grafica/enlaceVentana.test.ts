import { describe, expect, it } from 'vitest'
import type { DatosGraficas } from '../../../../compartido/graficas'
import { crearEnlaceVentana } from './enlaceVentana'

const mapeado = {} as never
const analisis = {} as never
const datos = (extra: Partial<DatosGraficas> = {}): DatosGraficas => ({ corridas: [{ n: 1, nombre: 'T', analisis, mapeado }], elegida: 1, tema: 'claro', archivo: 'rc.kir', ...extra })

function entorno(ventana = true) {
  const llamadas: string[] = []
  let hay = ventana
  const api = {
    abrir: async () => (llamadas.push('abrir'), (hay = true)),
    actualizar: async () => (llamadas.push('actualizar'), hay)
  }
  const avisos: boolean[] = []
  return { enlace: crearEnlaceVentana(api, (a) => avisos.push(a)), llamadas, avisos, cerrarVentana: () => void (hay = false) }
}

describe('enlace con la ventana de gráficas', () => {
  it('sin haberla abierto, mantenerla al día no hace nada (no la abre)', async () => {
    const { enlace, llamadas } = entorno()
    expect(await enlace.actualizar(datos())).toBe(false)
    expect(llamadas).toEqual([])
  })

  it('abrir la abre y actualizar solo manda lo que cambió', async () => {
    const { enlace, llamadas } = entorno()
    await enlace.abrir(datos())
    expect(enlace.abierta).toBe(true)
    // Lo mismo (aunque sean objetos nuevos con las mismas corridas): no viaja.
    expect(await enlace.actualizar(datos())).toBe(false)
    expect(await enlace.actualizar(datos({ tema: 'oscuro' }))).toBe(true)
    expect(await enlace.actualizar(datos({ tema: 'oscuro' }))).toBe(false)
    expect(await enlace.actualizar(datos({ tema: 'oscuro', corridas: [] }))).toBe(true)
    expect(llamadas).toEqual(['abrir', 'actualizar', 'actualizar'])
  })

  it('causa raíz: con la ventana cerrada el primer intento lo descubre, baja la bandera y no se vuelve a intentar (antes la reabría)', async () => {
    const { enlace, llamadas, avisos, cerrarVentana } = entorno()
    await enlace.abrir(datos())
    cerrarVentana()
    expect(await enlace.actualizar(datos({ tema: 'oscuro' }))).toBe(false)
    expect(enlace.abierta).toBe(false)
    expect(await enlace.actualizar(datos({ tema: 'claro', archivo: 'otro.kir' }))).toBe(false)
    expect(llamadas).toEqual(['abrir', 'actualizar'])
    expect(avisos).toEqual([true, false])
  })

  it('el usuario puede volver a abrirla después de cerrarla', async () => {
    const { enlace, cerrarVentana } = entorno()
    await enlace.abrir(datos())
    cerrarVentana()
    await enlace.actualizar(datos({ tema: 'oscuro' }))
    expect(await enlace.abrir(datos())).toBe(true)
    expect(enlace.abierta).toBe(true)
    expect(await enlace.actualizar(datos({ tema: 'oscuro' }))).toBe(true)
  })
})
