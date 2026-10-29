// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import type { Informe } from '../importar/informe'
import DialogoImportacion from './DialogoImportacion'
import type { TarjetaInforme } from './informeVivo'
import TarjetasInforme from './TarjetasInforme'

const ocre: TarjetaInforme = { clase: 'aproximadas', tono: 'ocre', titulo: '2 con modelo aproximado', lineas: ['U1 TL081 → amp-op'], piezas: ['u1'], cables: [], etiquetas: [] }
const verde: TarjetaInforme = { clase: 'analisis', tono: 'verdeazul', titulo: '1 análisis convertido', lineas: [], piezas: [], cables: [], etiquetas: [] }
const informe: Informe = { origen: { formato: 'proteus', version: '8.13', nombre: 'f.pdsprj' }, total: 3, convertidas: 2, aproximadas: [], sinEquivalencia: [], redesConEtiqueta: [], analisis: [], omitidas: [], avisos: [] }

describe('las tarjetas del informe', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })

  it('son botones con su tono, y señalan al pasar el ratón, al enfocar y al hacer clic', () => {
    const eventos: string[] = []
    quitar = render(() => <TarjetasInforme tarjetas={[ocre, verde]} onResaltar={(t) => eventos.push(`r:${t?.clase ?? '-'}`)} onEncuadrar={(t) => eventos.push(`e:${t.clase}`)} />, document.body)
    const [a, b] = [...document.querySelectorAll<HTMLButtonElement>('button.tarjeta-informe')]
    expect(a.getAttribute('data-tono')).toBe('ocre')
    expect(a.textContent).toContain('2 con modelo aproximado')
    expect(a.getAttribute('aria-description')).toBe('Se resaltan en el lienzo.')
    expect(b.hasAttribute('aria-description')).toBe(false)
    a.dispatchEvent(new PointerEvent('pointerenter'))
    a.dispatchEvent(new PointerEvent('pointerleave'))
    a.focus()
    a.blur()
    a.click()
    expect(eventos).toEqual(['r:aproximadas', 'r:-', 'r:aproximadas', 'r:-', 'e:aproximadas'])
    // Una tarjeta sin piezas ni etiquetas no resalta ni encuadra.
    eventos.length = 0
    b.dispatchEvent(new PointerEvent('pointerenter'))
    b.click()
    expect(eventos).toEqual([])
  })

  it('marca como resaltada la tarjeta que se le dice', () => {
    quitar = render(() => <TarjetasInforme tarjetas={[ocre, verde]} resaltada="aproximadas" onResaltar={() => {}} onEncuadrar={() => {}} />, document.body)
    const [a, b] = [...document.querySelectorAll('button.tarjeta-informe')]
    expect(a.hasAttribute('data-resaltada')).toBe(true)
    expect(b.hasAttribute('data-resaltada')).toBe(false)
  })
})

describe('el diálogo de importación', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })

  it('enfoca «Entendido», cierra con Esc sin encuadrar y ofrece ver las piezas marcadas', () => {
    const cierres: boolean[] = []
    quitar = render(() => <DialogoImportacion informe={informe} tarjetas={[ocre]} onResaltar={() => {}} onEncuadrar={() => {}} onCerrar={(v) => cierres.push(v)} />, document.body)
    expect(document.querySelector('h2')?.textContent).toBe('Importado de Proteus 8.13')
    expect(document.body.textContent).toContain('f.pdsprj: 2 de 3 piezas convertidas. El original no se modificó.')
    expect(document.activeElement?.textContent).toBe('Entendido')
    const ver = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Ver las piezas marcadas')!
    ver.click()
    document.querySelector('.dialogo')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(cierres).toEqual([true, false])
  })

  it('no ofrece ver piezas cuando ninguna tarjeta marca algo', () => {
    quitar = render(() => <DialogoImportacion informe={informe} tarjetas={[verde]} onResaltar={() => {}} onEncuadrar={() => {}} onCerrar={() => {}} />, document.body)
    expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Ver las piezas marcadas')).toBe(false)
  })
})
