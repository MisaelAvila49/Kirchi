// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { ayudaDeContactos, claseDeContactos, contactoDeTecla, contactoEn, contactosCerrados, dibujarContactos, teclasDe, teclasPulsadas } from './contactos'
import { EscritorTrazos, EscritorTriangulos } from './buffers'

const lib = libreriaDePrueba().piezas
const pieza = (tipo: string, props: Record<string, string> = {}, rot: 0 | 90 | 180 | 270 = 0): Pieza => ({ id: `p_${tipo}`, tipo, ref: 'X1', x: 100, y: 50, rot, espejo: false, props })
const def = (id: string) => lib.get(id)!

describe('contactos de un DIP y de un teclado', () => {
  it('cada pieza dice qué clase de contactos tiene y qué teclas los accionan', () => {
    expect(claseDeContactos(def('interruptor-dip-8'))).toBe('palanca')
    expect(claseDeContactos(def('teclado-4x4'))).toBe('tecla')
    expect(claseDeContactos(def('interruptor'))).toBeNull()
    expect(teclasDe(def('interruptor-dip-4'))).toEqual(['1', '2', '3', '4'])
    expect(teclasDe(def('teclado-4x4'))).toEqual(['1', '2', '3', 'A', '4', '5', '6', 'B', '7', '8', '9', 'C', '*', '0', '#', 'D'])
    expect(teclasDe(def('teclado-4x3'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'])
  })

  it('un clic cae en la zona de su palanca o de su tecla y en ninguna fuera de ellas', () => {
    const dip = pieza('interruptor-dip-8')
    const zonas = def('interruptor-dip-8').animacion!.tipo === 'zonas' ? (def('interruptor-dip-8').animacion as { zonas: { x: number; y: number; ancho: number; alto: number }[] }).zonas : []
    zonas.forEach((z, k) => expect(contactoEn(dip, def('interruptor-dip-8'), { x: dip.x + z.x + z.ancho / 2, y: dip.y + z.y + z.alto / 2 })).toBe(k))
    expect(contactoEn(dip, def('interruptor-dip-8'), { x: dip.x + 20, y: dip.y })).toBeNull()
    // Las filas del teclado y el giro de la pieza.
    const kp = pieza('teclado-4x4')
    expect(contactoEn(kp, def('teclado-4x4'), { x: kp.x - 6, y: kp.y - 6 })).toBe(0)
    expect(contactoEn(kp, def('teclado-4x4'), { x: kp.x + 6, y: kp.y + 6 })).toBe(15)
    const girado = pieza('teclado-4x4', {}, 90)
    // Girada 90 grados, la tecla 1 (arriba a la izquierda) queda arriba a la derecha.
    expect(contactoEn(girado, def('teclado-4x4'), { x: girado.x + 6, y: girado.y - 6 })).toBe(0)
  })

  it('el teclado de la computadora acciona la tecla de su carácter, sin distinguir mayúsculas', () => {
    expect(contactoDeTecla(def('teclado-4x4'), 'a')).toBe(3)
    expect(contactoDeTecla(def('teclado-4x4'), 'D')).toBe(15)
    expect(contactoDeTecla(def('teclado-4x4'), '#')).toBe(14)
    expect(contactoDeTecla(def('teclado-4x3'), 'a')).toBeNull()
    expect(contactoDeTecla(def('interruptor-dip-8'), '8')).toBe(7)
    expect(contactoDeTecla(def('interruptor-dip-8'), '9')).toBeNull()
    expect(contactoDeTecla(def('interruptor-dip-8'), 'Enter')).toBeNull()
  })

  it('las palancas siguen el estado del documento y las teclas las que se sostienen, que no se guardan', () => {
    const dip = pieza('interruptor-dip-4', { estado: '1010' })
    expect(contactosCerrados(dip, def('interruptor-dip-4'))).toEqual([true, false, true, false])
    expect(contactosCerrados(pieza('interruptor-dip-4'), def('interruptor-dip-4'))).toEqual([false, false, false, false])
    const kp = pieza('teclado-4x3')
    teclasPulsadas.set(kp.id, new Set([4]))
    expect(contactosCerrados(kp, def('teclado-4x3')).map((c, k) => (c ? k : -1)).filter((k) => k >= 0)).toEqual([4])
    teclasPulsadas.clear()
    expect(contactosCerrados(kp, def('teclado-4x3')).some(Boolean)).toBe(false)
  })

  it('la línea de ayuda del inspector dice qué teclas mueven la pieza', () => {
    expect(ayudaDeContactos(def('interruptor-dip-8'))).toBe('Simulando: las teclas 1 a 8 mueven las palancas.')
    expect(ayudaDeContactos(def('teclado-4x4'))).toBe('Simulando: las teclas 0 a 9, A a D y * y # pulsan el teclado.')
    expect(ayudaDeContactos(def('teclado-4x3'))).toBe('Simulando: las teclas 0 a 9 y * y # pulsan el teclado.')
    expect(ayudaDeContactos(def('resistencia'))).toBeNull()
  })

  it('dibuja una palanca por posición y una tecla rellena solo mientras se sostiene', () => {
    const cuenta = (p: Pieza, d: ReturnType<typeof def>) => {
      const t = new EscritorTrazos()
      const tri = new EscritorTriangulos()
      dibujarContactos(t, tri, p, d, [0, 0, 0, 1], 1)
      return { t: t.cuenta, tri: tri.cuenta }
    }
    const dip = cuenta(pieza('interruptor-dip-8'), def('interruptor-dip-8'))
    expect(dip.tri).toBe(8 * 2)
    expect(cuenta(pieza('teclado-4x4'), def('teclado-4x4')).tri).toBe(0)
    const kp = pieza('teclado-4x4')
    teclasPulsadas.set(kp.id, new Set([0, 5]))
    expect(cuenta(kp, def('teclado-4x4')).tri).toBe(2 * 2)
    teclasPulsadas.clear()
  })
})
