import { describe, expect, it } from 'vitest'
import type { DatosOsc } from '../../../../compartido/ventanaOsc'
import { crearEnlaceOsc, MS_ENTRE_PANTALLAS } from './enlaceVentanaOsc'

const pant = (version: number) => ({ version }) as never
const datos = (o: Partial<DatosOsc> = {}): DatosOsc => ({
  tema: 'claro', osciloscopios: [{ id: 'p1', ref: 'OSC1' }], elegido: 'p1', ajustes: { base: 1e-3 }, aspecto: null, aspectoCanales: {},
  fase: 'corriendo', teclaSimular: null, estadoDisparo: 'Disparado', fuentes: {}, aviso: null, notaAjuste: null, cursores: null, capturada: false,
  pantalla: pant(1), congelada: null, ...o
})

function entorno(abre = true) {
  const enviados: { tipo: 'abrir' | 'actualizar'; d: DatosOsc }[] = []
  let t = 1000
  let vive = true
  let invalido = false
  const avisos: number[] = []
  const cambios: boolean[] = []
  const enlace = crearEnlaceOsc(
    {
      abrir: async (d) => (enviados.push({ tipo: 'abrir', d }), abre),
      actualizar: async (d) => (enviados.push({ tipo: 'actualizar', d }), vive ? (invalido ? 'invalido' : 'ok') : 'sin-ventana')
    },
    (a) => cambios.push(a),
    () => avisos.push(1),
    () => t
  )
  return { enlace, enviados, cambios, avisos, invalidar: () => void (invalido = true), avanzar: (ms: number) => void (t += ms), matar: () => void (vive = false) }
}
const A = { pantalla: 'A', congelada: null }

describe('enlace con la ventana del osciloscopio', () => {
  it('sin ventana no manda nada y no la crea', async () => {
    const { enlace, enviados } = entorno()
    expect(await enlace.actualizar(datos(), A)).toBe(false)
    expect(enviados).toEqual([])
  })

  it('abrir manda todo, sube la bandera y una ventana que no abre la deja abajo', async () => {
    const { enlace, enviados, cambios } = entorno()
    expect(await enlace.abrir(datos(), A)).toBe(true)
    expect(enlace.abierta).toBe(true)
    expect(cambios).toEqual([true])
    expect(enviados[0].d.pantalla).toBeDefined()
    const no = entorno(false)
    expect(await no.enlace.abrir(datos(), A)).toBe(false)
    expect(no.enlace.abierta).toBe(false)
  })

  it('lo mismo otra vez no viaja', async () => {
    const { enlace, enviados, avanzar } = entorno()
    await enlace.abrir(datos(), A)
    avanzar(100)
    expect(await enlace.actualizar(datos(), A)).toBe(false)
    expect(enviados).toHaveLength(1)
  })

  it('una pantalla nueva viaja sola, y no más de una cada treinta y tres milisegundos', async () => {
    const { enlace, enviados, avanzar } = entorno()
    await enlace.abrir(datos(), A)
    avanzar(MS_ENTRE_PANTALLAS - 1)
    expect(await enlace.actualizar(datos({ pantalla: pant(2) }), { pantalla: 'B', congelada: null })).toBe(false)
    avanzar(2)
    expect(await enlace.actualizar(datos({ pantalla: pant(2) }), { pantalla: 'B', congelada: null })).toBe(true)
    const e = enviados.at(-1)!
    expect(e.tipo).toBe('actualizar')
    expect(e.d.pantalla).toEqual(pant(2))
    expect('congelada' in e.d).toBe(false)
  })

  it('un cambio de ajustes viaja sin la pantalla y sin esperar', async () => {
    const { enlace, enviados } = entorno()
    await enlace.abrir(datos(), A)
    expect(await enlace.actualizar(datos({ aviso: 'La base pide un paso más corto.' }), A)).toBe(true)
    const e = enviados.at(-1)!.d
    expect(e.aviso).toBe('La base pide un paso más corto.')
    expect('pantalla' in e).toBe(false)
    expect('congelada' in e).toBe(false)
  })

  it('congelar manda la pantalla congelada una vez, y reanudar la baja con null', async () => {
    const { enlace, enviados, avanzar } = entorno()
    await enlace.abrir(datos(), A)
    const c = { pantalla: pant(3), ajustes: { base: 1e-3 } }
    const IdC = { pantalla: 'A', congelada: 'C' }
    expect(await enlace.actualizar(datos({ congelada: c }), IdC)).toBe(true)
    expect(enviados.at(-1)!.d.congelada).toEqual(c)
    avanzar(100)
    expect(await enlace.actualizar(datos({ congelada: c }), IdC)).toBe(false)
    expect(await enlace.actualizar(datos({ congelada: null }), A)).toBe(true)
    expect(enviados.at(-1)!.d.congelada).toBeNull()
  })

  it('si el proceso principal dice que ya no hay ventana, la bandera baja y no se insiste', async () => {
    const { enlace, enviados, cambios, matar, avanzar } = entorno()
    await enlace.abrir(datos(), A)
    matar()
    avanzar(100)
    expect(await enlace.actualizar(datos({ fase: 'pausada' }), A)).toBe(false)
    expect(enlace.abierta).toBe(false)
    expect(cambios).toEqual([true, false])
    const n = enviados.length
    expect(await enlace.actualizar(datos({ fase: 'detenida' }), A)).toBe(false)
    expect(enviados).toHaveLength(n)
  })

  it('al acoplar o cerrar la ventana la bandera baja; abrir otra vez manda todo de nuevo', async () => {
    const { enlace, enviados, cambios } = entorno()
    await enlace.abrir(datos(), A)
    enlace.cerrada()
    expect(enlace.abierta).toBe(false)
    expect(cambios).toEqual([true, false])
    await enlace.abrir(datos(), A)
    expect(enviados.at(-1)!.tipo).toBe('abrir')
    expect(enviados.at(-1)!.d.pantalla).toBeDefined()
  })

  it('datos rechazados no bajan la bandera: se avisa y se reintenta', async () => {
    const { enlace, cambios, avisos, invalidar, avanzar } = entorno()
    await enlace.abrir(datos(), A)
    invalidar()
    avanzar(100)
    expect(await enlace.actualizar(datos({ fase: 'pausada' }), A)).toBe(false)
    expect(enlace.abierta).toBe(true)
    expect(cambios).toEqual([true])
    expect(avisos).toHaveLength(1)
  })
})
