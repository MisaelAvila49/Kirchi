import { describe, expect, it } from 'vitest'
import { ClicsDelLienzo, DetectorDobleClic, DOBLE_IZQ_MS, DOBLE_MS, DOBLE_PX } from './dobleClic'

describe('DetectorDobleClic', () => {
  it('dos pulsaciones en 400 ms y a 4 px o menos son un doble clic', () => {
    expect(DOBLE_MS).toBe(400)
    expect(DOBLE_PX).toBe(4)
    const d = new DetectorDobleClic()
    expect(d.pulsar(100, 100, 1000)).toBe(false)
    expect(d.pulsar(103, 102, 1390)).toBe(true)
  })

  it('más lento o más lejos no lo es, y la segunda cuenta como primera de otro', () => {
    const d = new DetectorDobleClic()
    d.pulsar(100, 100, 0)
    expect(d.pulsar(100, 100, 401)).toBe(false)
    expect(d.pulsar(105, 100, 500)).toBe(false)
    expect(d.pulsar(105, 100, 600)).toBe(true)
  })

  it('tras un doble clic el tercero empieza de nuevo', () => {
    const d = new DetectorDobleClic()
    d.pulsar(0, 0, 0)
    expect(d.pulsar(0, 0, 100)).toBe(true)
    expect(d.pulsar(0, 0, 200)).toBe(false)
  })
})

describe('ClicsDelLienzo: doble clic izquierdo contado por la aplicación', () => {
  /** Un clic en (x, y) que empieza en `t` y se suelta 60 ms después; `consume` si el clic cerró algo (el buscador). */
  const clic = (c: ClicsDelLienzo, t: number, consume = false, x = 100, y = 100) => {
    c.abajo(x, y, t, consume)
    return c.arriba(x, y, t + 60)
  }

  it('la ventana es de 500 ms y 4 px, como el doble clic de Windows', () => {
    expect(DOBLE_IZQ_MS).toBe(500)
    const c = new ClicsDelLienzo()
    expect(clic(c, 0)).toBe(false)
    expect(clic(c, 450)).toBe(true)
    const d = new ClicsDelLienzo()
    clic(d, 0)
    expect(clic(d, 600)).toBe(false)
    const e = new ClicsDelLienzo()
    clic(e, 0)
    expect(clic(e, 200, false, 106, 100)).toBe(false)
  })

  it('el segundo abre, el tercero solo cierra lo abierto, y el cuarto y el quinto vuelven a abrir', () => {
    const c = new ClicsDelLienzo()
    const abiertos: boolean[] = []
    let abierto = false
    for (let k = 0; k < 8; k++) {
      // Como la aplicación: un clic con el buscador abierto solo lo cierra (se consume).
      const consume = abierto
      if (consume) abierto = false
      if (clic(c, k * 150, consume)) abierto = true
      abiertos.push(abierto)
    }
    expect(abiertos).toEqual([false, true, false, false, true, false, false, true])
  })

  it('tras una ráfaga de clics y una pausa, un doble clic siempre cuenta', () => {
    const c = new ClicsDelLienzo()
    for (let k = 0; k < 9; k++) clic(c, k * 90)
    expect(clic(c, 9 * 90 + 700)).toBe(false)
    expect(clic(c, 9 * 90 + 900)).toBe(true)
  })

  it('un arrastre no cuenta como clic, y soltar lejos del segundo no es doble', () => {
    const c = new ClicsDelLienzo()
    c.abajo(100, 100, 0, false)
    expect(c.arriba(140, 100, 200)).toBe(false)
    expect(clic(c, 300)).toBe(false)
    c.abajo(100, 100, 400, false)
    expect(c.arriba(120, 100, 450)).toBe(false)
  })

  it('reiniciar (un desplazamiento de la vista) olvida el clic anterior', () => {
    const c = new ClicsDelLienzo()
    clic(c, 0)
    c.reiniciar()
    expect(clic(c, 100)).toBe(false)
  })
})
