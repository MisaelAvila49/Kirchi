// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { instalarFocoItinerante, itemsDeBarra, normalizarFoco, siguientePestaña } from './navegacion'

const siempre = () => true
let barra: HTMLElement
let quitar: () => void
const pulsar = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
const enfocado = () => (document.activeElement as HTMLElement | null)?.id

beforeEach(() => {
  document.body.innerHTML = `
    <div role="toolbar" id="tb">
      <div class="grupo"><button class="boton-grupo" id="g1">G1</button><div class="grupo-contenido"><button id="a">A</button><button id="b">B</button></div></div>
      <div class="grupo plegado"><button class="boton-grupo" id="g2">G2</button><div class="grupo-contenido"><button id="c">C</button></div></div>
      <div hidden><button id="d">D</button></div>
      <input id="z">
    </div>`
  barra = document.getElementById('tb')!
})
afterEach(() => quitar?.())

describe('foco itinerante de la cinta', () => {
  it('recorre lo que se ve: un grupo abierto por sus botones, uno plegado por su botón, nada oculto', () => {
    expect(itemsDeBarra(barra, siempre).map((e) => e.id)).toEqual(['a', 'b', 'g2', 'z'])
  })

  it('deja un solo control con tabindex 0, el de antes si sigue a la vista', () => {
    normalizarFoco(barra, siempre)
    const ceros = () => [...barra.querySelectorAll<HTMLElement>('button, input')].filter((e) => e.tabIndex === 0).map((e) => e.id)
    expect(ceros()).toEqual(['a'])
    document.getElementById('a')!.tabIndex = -1
    document.getElementById('g2')!.tabIndex = 0
    normalizarFoco(barra, siempre)
    expect(ceros()).toEqual(['g2'])
  })

  it('flechas sin dar la vuelta, Inicio y Fin, y flecha arriba a la pestaña', () => {
    let subio = 0
    quitar = instalarFocoItinerante(barra, { alSubir: () => subio++, visible: siempre })
    document.getElementById('a')!.focus()
    pulsar(document.activeElement!, 'ArrowRight')
    expect(enfocado()).toBe('b')
    expect(document.getElementById('b')!.tabIndex).toBe(0)
    expect(document.getElementById('a')!.tabIndex).toBe(-1)
    pulsar(document.activeElement!, 'End')
    expect(enfocado()).toBe('z')
    document.getElementById('g2')!.focus()
    pulsar(document.activeElement!, 'Home')
    expect(enfocado()).toBe('a')
    pulsar(document.activeElement!, 'ArrowLeft')
    expect(enfocado()).toBe('a')
    pulsar(document.activeElement!, 'ArrowUp')
    expect(subio).toBe(1)
  })

  it('dentro de un campo las flechas son del campo', () => {
    quitar = instalarFocoItinerante(barra, { visible: siempre })
    const z = document.getElementById('z')!
    z.focus()
    const e = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })
    z.dispatchEvent(e)
    expect(enfocado()).toBe('z')
    expect(e.defaultPrevented).toBe(false)
  })

  it('las pestañas dan la vuelta', () => {
    expect(siguientePestaña(4, 3, 'ArrowRight')).toBe(0)
    expect(siguientePestaña(4, 0, 'ArrowLeft')).toBe(3)
    expect(siguientePestaña(4, 2, 'Home')).toBe(0)
    expect(siguientePestaña(4, 1, 'End')).toBe(3)
    expect(siguientePestaña(4, 1, 'ArrowDown')).toBeNull()
  })
})

describe('foco itinerante: casos de la revisión', () => {
  it('se salta los controles deshabilitados de verdad (el − del zoom en su tope)', () => {
    ;(document.getElementById('b') as HTMLButtonElement).disabled = true
    expect(itemsDeBarra(barra, siempre).map((e) => e.id)).toEqual(['a', 'g2', 'z'])
  })

  it('con todos en -1 deja el primero en 0, y respeta el que ya tenía 0 aunque no sea el primero', () => {
    for (const x of barra.querySelectorAll<HTMLElement>('button, input')) x.tabIndex = -1
    normalizarFoco(barra, siempre)
    expect(document.getElementById('a')!.tabIndex).toBe(0)
    document.getElementById('a')!.tabIndex = -1
    document.getElementById('z')!.tabIndex = 0
    normalizarFoco(barra, siempre)
    expect([...barra.querySelectorAll<HTMLElement>('button, input')].filter((e) => e.tabIndex === 0).map((e) => e.id)).toEqual(['z'])
  })

  it('si el control enfocado queda dentro de un grupo que se plegó, el foco pasa al botón del grupo', () => {
    document.getElementById('c')!.focus()
    normalizarFoco(barra, siempre)
    expect(enfocado()).toBe('g2')
    expect(document.getElementById('g2')!.tabIndex).toBe(0)
  })

  it('con el grupo plegado abierto, el foco se queda adentro', () => {
    document.querySelector('.grupo.plegado')!.classList.add('abierto')
    document.getElementById('c')!.focus()
    normalizarFoco(barra, siempre)
    expect(enfocado()).toBe('c')
  })

  it('las flechas con Shift, Ctrl, Alt o Meta no mueven el foco', () => {
    quitar = instalarFocoItinerante(barra, { visible: siempre })
    document.getElementById('a')!.focus()
    for (const m of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, [m]: true })
      document.activeElement!.dispatchEvent(e)
      expect(enfocado(), m).toBe('a')
      expect(e.defaultPrevented, m).toBe(false)
    }
  })
})
