// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import RangoDoble from './RangoDoble'
import type { EjeDeFigura } from '../osciloscopio/figura'

const eje = (unidad: string, total = { min: 0, max: 0.01 }): EjeDeFigura => ({ mapa: { escala: 'lin' } as EjeDeFigura['mapa'], total, unidad, prefijo: null })

const campos = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLInputElement>('input.campo-rango-num')).map((i) => i.value)
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('campos Desde y Hasta del tramo', () => {
  let quitar = () => {}
  afterEach(() => quitar())

  it('al abrir con todo el rango muestran los extremos de inmediato', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    quitar = render(() => <RangoDoble compacto eje={eje('s')} vista={{ min: 0, max: 0.01 }} recortado={false} onCambiar={() => {}} />, host)
    await tick()
    expect(campos(host)).toEqual(['0', '10'])
  })

  it('siguen a la captura que llega después y al cambio de unidad del eje', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const [e, setE] = createSignal(eje('s', { min: 0, max: 1 }))
    quitar = render(() => <RangoDoble compacto eje={e()} vista={e().total} recortado={false} onCambiar={() => {}} />, host)
    await tick()
    expect(campos(host)).toEqual(['0', '1'])
    setE(eje('s', { min: 0, max: 0.002 }))
    await tick()
    expect(campos(host)).toEqual(['0', '2'])
    setE(eje('Hz', { min: 10, max: 5000 }))
    await tick()
    expect(campos(host)).toEqual(['10', '5'])
  })
})
