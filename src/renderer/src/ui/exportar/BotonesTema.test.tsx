// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import BotonesTema from './BotonesTema'

describe('Botones de tema del exportar', () => {
  let quitar = () => {}
  afterEach(() => quitar())

  it('dos botones de icono con su nombre en el globo, uno marcado, y elegir avisa', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const [v, setV] = createSignal<'claro' | 'oscuro' | null>('claro')
    quitar = render(() => <BotonesTema valor={v()} onCambiar={setV} />, host)
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Tema claro', 'Tema oscuro'])
    expect(Array.from(host.querySelectorAll('label')).map((l) => l.title)).toEqual(['Tema claro', 'Tema oscuro'])
    expect(host.querySelectorAll('label svg').length).toBe(2)
    expect(host.textContent?.replace('Tema', '').trim()).toBe('')
    expect(radios.filter((r) => r.checked).length).toBe(1)
    radios[1].click()
    expect(v()).toBe('oscuro')
  })

  it('sin tema elegido (fondo blanco) no marca ninguno', () => {
    const host = document.createElement('div')
    document.body.append(host)
    quitar = render(() => <BotonesTema valor={null} onCambiar={() => {}} />, host)
    expect(Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]')).some((r) => r.checked)).toBe(false)
  })
})
