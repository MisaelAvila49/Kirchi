// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Pieza } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import MiniaturaPwl from './MiniaturaPwl'
import { perillasDe, textoPwlDe } from './perillasVista'
import SeccionPerillas, { olvidarPerillaVista } from './SeccionPerillas'

const defConPerilla = {
  id: 'ntc-prueba',
  props: [
    { id: 'valor', nombre: 'Valor', unidad: 'Ω', defecto: '10k' },
    { id: 'temperatura', nombre: 'Temperatura', unidad: '°C', defecto: '25 °C', enVivo: { magnitud: 'temperatura', min: -40, max: 150, paso: 1, pasoFino: 0.1 } }
  ]
} as unknown as PiezaDef
const defSinPerilla = { id: 'resistencia', props: [{ id: 'valor', nombre: 'Valor', unidad: 'Ω', defecto: '1k' }] } as unknown as PiezaDef
const pz = (props: Record<string, string> = {}): Pieza => ({ id: 'p1', tipo: 'x', ref: 'RT1', x: 0, y: 0, rot: 0, espejo: false, props })

describe('perillasDe', () => {
  it('solo las propiedades enVivo son perillas, con el valor guardado o el de omisión', () => {
    expect(perillasDe(pz(), defSinPerilla)).toEqual([])
    const [a] = perillasDe(pz(), defConPerilla)
    expect(a).toMatchObject({ id: 'p1', propId: 'temperatura', ref: 'RT1', unidad: '°C', valor: 25 })
    expect(perillasDe(pz({ temperatura: '85 °C' }), defConPerilla)[0].valor).toBe(85)
  })
})

describe('SeccionPerillas', () => {
  let quitar = () => {}
  beforeEach(() => olvidarPerillaVista())
  afterEach(() => quitar())
  const montar = (compacta = false) => {
    const host = document.createElement('div')
    document.body.append(host)
    const llamadas: [string, number, string | undefined][] = []
    quitar = render(() => <SeccionPerillas perillas={perillasDe(pz(), defConPerilla)} compacta={compacta} onCambiar={(p, v, g) => llamadas.push([p.propId, v, g])} />, host)
    return { host, llamadas }
  }

  it('sin perillas no pinta nada', () => {
    const host = document.createElement('div')
    quitar = render(() => <SeccionPerillas perillas={perillasDe(pz(), defSinPerilla)} onCambiar={() => {}} />, host)
    expect(host.innerHTML).toBe('')
  })

  it('con una perilla pinta el deslizador y el campo, y teclas mueven con onCambiar', () => {
    const { host, llamadas } = montar()
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement
    expect(host.querySelector('input[type="text"]')).not.toBeNull()
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    expect(llamadas).toEqual([['temperatura', 26, undefined]])
  })

  it('el globo de la primera vez desaparece al mover la perilla', () => {
    const { host } = montar()
    expect(host.textContent).toContain('Muévela mientras simulas.')
    host.querySelector('input[type="range"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))
    expect(host.textContent).not.toContain('Muévela mientras simulas.')
  })

  it('compacta (Mediciones) muestra el deslizador y la cifra, sin campo ni globo', () => {
    const { host } = montar(true)
    expect(host.querySelector('input[type="range"]')).not.toBeNull()
    expect(host.querySelector('input[type="text"]')).toBeNull()
    expect(host.textContent).not.toContain('Muévela')
  })
})

describe('MiniaturaPwl', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const montar = (texto: string) => {
    const host = document.createElement('div')
    document.body.append(host)
    quitar = render(() => <MiniaturaPwl texto={texto} />, host)
    return host
  }

  it('dibuja una línea y un punto por vértice', () => {
    const host = montar('0 0, 1m 5, 2m 5, 3m 0')
    expect(host.querySelectorAll('circle')).toHaveLength(4)
    expect(host.querySelector('polyline')!.getAttribute('points')!.split(' ')).toHaveLength(4)
    expect(host.querySelector('svg')!.getAttribute('role')).toBe('img')
  })

  it('un texto inválido dice por qué en lugar de dibujar', () => {
    const host = montar('1m 5')
    expect(host.querySelector('svg')).toBeNull()
    expect(host.textContent).toContain('primer tiempo debe ser 0')
  })

  it('textoPwlDe lee la propiedad de puntos solo de una fuente PWL', () => {
    const def = { id: 'fuente-pwl', modelo: { tipo: 'pwl', puntos: 'puntos' }, props: [{ id: 'puntos', nombre: 'Puntos', defecto: '0 0, 1m 5' }] } as unknown as PiezaDef
    expect(textoPwlDe(pz(), def)).toBe('0 0, 1m 5')
    expect(textoPwlDe(pz({ puntos: '0 1, 2 3' }), def)).toBe('0 1, 2 3')
    expect(textoPwlDe(pz(), defSinPerilla)).toBeNull()
  })
})
