// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { createSignal } from 'solid-js'
import { afterEach, describe, expect, it } from 'vitest'
import { BarraNota } from './ControlesNotas'
import type { NotaEsquema } from './notasEsquema'

describe('la barra de la nota elegida', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })

  it('al editar la nota no se rehace la barra: los mismos botones siguen en pantalla y conservan el foco', () => {
    const texto = { id: 't1', tipo: 'texto', x: 0, y: 0, texto: 'Hola', tam: 14, negrita: false, tono: 'tinta' } as unknown as NotaEsquema
    const [nota, setNota] = createSignal<NotaEsquema>(texto)
    quitar = render(() => <BarraNota nota={nota()} editar={() => {}} onBorrar={() => {}} />, document.body)
    const negrita = document.querySelector<HTMLButtonElement>('button[aria-label="Negrita"]')!
    negrita.focus()
    expect(document.activeElement).toBe(negrita)
    setNota({ ...texto, tam: 15, negrita: true } as NotaEsquema)
    const despues = document.querySelector<HTMLButtonElement>('button[aria-label="Negrita"]')!
    expect(despues).toBe(negrita)
    expect(document.activeElement).toBe(negrita)
    expect(despues.getAttribute('aria-pressed')).toBe('true')
  })

  it('al cambiar el tipo de nota sí se arma la barra de ese tipo', () => {
    const base = { id: 't1', x: 0, y: 0, tono: 'tinta' }
    const [nota, setNota] = createSignal<NotaEsquema>({ ...base, tipo: 'texto', texto: 'A', tam: 14, negrita: false } as unknown as NotaEsquema)
    quitar = render(() => <BarraNota nota={nota()} editar={() => {}} onBorrar={() => {}} />, document.body)
    expect(document.querySelector('button[aria-label="Negrita"]')).not.toBeNull()
    setNota({ ...base, tipo: 'flecha', x2: 1, y2: 1, grosor: 2, punta: 'cerrada' } as unknown as NotaEsquema)
    expect(document.querySelector('button[aria-label="Negrita"]')).toBeNull()
    expect(document.querySelector('[aria-label="Grosor"], .editor-barra')).not.toBeNull()
  })
})
