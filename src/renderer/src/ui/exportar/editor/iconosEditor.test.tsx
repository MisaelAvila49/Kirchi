// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { describe, expect, it } from 'vitest'
import { IconoEtiqueta, IconoFlecha, IconoRango, IconoSeleccionar, IconoTexto } from './iconosEditor'

describe('iconos de las herramientas del editor', () => {
  it('llevan el tono R1 de su orden, salvo seleccionar que queda en tinta', () => {
    const host = document.createElement('div')
    const quitar = render(() => <>{[IconoSeleccionar, IconoTexto, IconoEtiqueta, IconoFlecha, IconoRango].map((I) => I())}</>, host)
    expect(Array.from(host.querySelectorAll('svg')).map((s) => s.getAttribute('data-h'))).toEqual([null, 'azul', 'naranja', 'violeta', 'verdeazul'])
    quitar()
  })
})
