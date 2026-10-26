// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { OpcionesIconos } from './AspectoPanel'
import { ICONOS_REJILLA } from './iconosRejilla'

describe('Rejilla con iconos', () => {
  let quitar = () => {}
  afterEach(() => quitar())

  it('seis radios con nombre y globo, uno marcado, y cambiar avisa', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const nombres = [['ninguna', 'Ninguna'], ['lineas', 'Líneas'], ['horizontal', 'Solo horizontales'], ['vertical', 'Solo verticales'], ['puntos', 'Puntos'], ['guiones', 'Guiones']] as const
    const [v, setV] = createSignal<keyof typeof ICONOS_REJILLA>('lineas')
    quitar = render(() => <OpcionesIconos nombre="Rejilla" valor={v()} opciones={nombres} icono={(x) => ICONOS_REJILLA[x as keyof typeof ICONOS_REJILLA]()} onCambiar={setV} />, host)
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Rejilla')
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(nombres.map((n) => n[1]))
    expect(Array.from(host.querySelectorAll('label')).map((l) => l.title)).toEqual(nombres.map((n) => n[1]))
    expect(host.querySelectorAll('label svg').length).toBe(6)
    expect(new Set(radios.map((r) => r.name)).size).toBe(1)
    expect(radios.filter((r) => r.checked).map((r) => r.getAttribute('aria-label'))).toEqual(['Líneas'])
    radios[4].click()
    expect(v()).toBe('puntos')
    expect(radios[4].checked).toBe(true)
  })

  it('los seis iconos de rejilla son distintos y de trazo fino', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const claves = Object.keys(ICONOS_REJILLA) as (keyof typeof ICONOS_REJILLA)[]
    quitar = render(() => <>{claves.map((k) => ICONOS_REJILLA[k]())}</>, host)
    const svgs = Array.from(host.querySelectorAll('svg'))
    expect(svgs.length).toBe(6)
    expect(new Set(svgs.map((s) => s.innerHTML)).size).toBe(6)
    expect(svgs.every((s) => s.getAttribute('style')?.includes('1px'))).toBe(true)
  })
})

describe('Tema de la gráfica exportada', () => {
  it('ofrece Tema claro y Tema oscuro con sol y luna, y no «Como la aplicación»', async () => {
    const { SeccionRejilla } = await import('./AspectoPanel')
    const { ASPECTO_ANALISIS } = await import('../../../../compartido/grafica/aspecto')
    const host = document.createElement('div')
    document.body.append(host)
    const parches: unknown[] = []
    const quitar = render(
      () => <SeccionRejilla temaExplicito aspecto={{ ...ASPECTO_ANALISIS, tema: 'oscuro' }} onAspecto={(p) => parches.push(p)} trazas={[]} onTraza={() => {}} ejeX={null} onRestablecer={() => {}} />,
      host
    )
    const grupo = host.querySelector('[aria-label="Tema"]')!
    const radios = Array.from(grupo.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    expect(radios.map((r) => r.getAttribute('aria-label'))).toEqual(['Tema claro', 'Tema oscuro'])
    expect(radios.map((r) => r.checked)).toEqual([false, true])
    expect(Array.from(grupo.querySelectorAll('svg')).map((s) => s.getAttribute('data-icono'))).toEqual(['sol', 'luna'])
    radios[0].click()
    expect(parches).toEqual([{ tema: 'claro' }])
    quitar()
  })
})
