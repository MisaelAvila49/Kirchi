// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import ElegirAnalisis from './ElegirAnalisis'
import { NOMBRE_FICHA, TIPOS_FICHA } from '../analisis/fichas'

describe('la pestaña Análisis sin análisis elegido', () => {
  let quitar = () => {}
  afterEach(() => quitar())

  it('lista los seis análisis con su icono y qué mide, y pulsar uno lo pide', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const pedidos: string[] = []
    quitar = render(() => <ElegirAnalisis onElegir={(t) => pedidos.push(t)} />, host)
    const botones = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    expect(botones.map((b) => b.querySelector('strong')?.textContent)).toEqual(TIPOS_FICHA.map((t) => NOMBRE_FICHA[t]))
    expect(botones.every((b) => b.querySelector('svg[data-icono]') && (b.querySelector('.an-elegir-texto span')?.textContent ?? '').length > 10)).toBe(true)
    botones[2].click()
    expect(pedidos).toEqual(['ac'])
  })

  it('sin poder editar, los botones no crean nada y dicen por qué', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const pedidos: string[] = []
    quitar = render(() => <ElegirAnalisis onElegir={(t) => pedidos.push(t)} motivoNoEditable="Detén la vista previa para editar." />, host)
    const b = host.querySelector('button')!
    expect(b.getAttribute('aria-disabled')).toBe('true')
    expect(b.title).toBe('Detén la vista previa para editar.')
    // El motivo también se ve sin pasar el ratón.
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Detén la vista previa para editar.')
    b.click()
    expect(pedidos).toEqual([])
  })
})
