// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { estadoCintaDePrueba as base } from '../../prueba/cinta'
import BotonCinta, { type ContextoBotones } from './BotonCinta'
import type { EstadoCinta } from './estado'

describe('el botón partido Grabar de Inicio', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = (estado: EstadoCinta) => {
    const clics: string[] = []
    const ctx: ContextoBotones = { estado: () => estado, tecla: () => undefined, menuAbierto: () => null, onEjecutar: (id, ancla) => clics.push(`${id}:${ancla.hasAttribute('data-grabar-pausa') ? 'pausa' : ancla.hasAttribute('data-grabar-flecha') ? 'flecha' : 'boton'}`) }
    quitar = render(() => <BotonCinta id="grabar" tamaño="grande" ctx={ctx} />, document.body)
    return clics
  }
  const principal = () => document.querySelector<HTMLButtonElement>('[data-comando="grabar"]')!
  const flecha = () => document.querySelector<HTMLButtonElement>('[data-grabar-flecha]')!

  it('sin grabar: el botón dice Grabar y la flecha, aparte a su derecha, abre las opciones', () => {
    const clics = montar(base())
    expect(principal().textContent!.trim()).toBe('Grabar')
    expect(flecha().getAttribute('aria-label')).toBe('Opciones de grabación')
    expect(flecha().getAttribute('aria-haspopup')).toBe('dialog')
    expect(principal().nextElementSibling).toBe(flecha())
    expect(principal().querySelector('.flecha')).toBeNull()
    principal().click()
    flecha().click()
    expect(clics).toEqual(['grabar:boton', 'grabar:flecha'])
  })

  it('grabando: el botón dice «● 00:42», queda pulsado y la flecha abre un menú', () => {
    montar(base({ grabacion: 'grabando', grabacionSeg: 42 }))
    expect(principal().textContent!.replace(/\s+/g, ' ').trim()).toBe('● 00:42')
    expect(principal().getAttribute('aria-pressed')).toBe('true')
    expect(principal().getAttribute('aria-label')).toBe('Detener la grabación, 00:42')
    expect(principal().querySelector('.punto-grabando')!.getAttribute('aria-hidden')).toBe('true')
    expect(flecha().getAttribute('aria-haspopup')).toBe('menu')
  })

  it('grabando: Pausar se ve junto al tiempo, entre el botón y la flecha; en pausa dice Continuar; sin grabar no existe', () => {
    const pausa = () => document.querySelector<HTMLButtonElement>('[data-grabar-pausa]')
    montar(base())
    expect(pausa()).toBeNull()
    quitar()
    document.body.replaceChildren()
    const clics = montar(base({ grabacion: 'grabando', grabacionSeg: 42 }))
    expect(pausa()!.getAttribute('aria-label')).toBe('Pausar la grabación')
    expect(pausa()!.querySelector('[data-icono="pausa"]')).not.toBeNull()
    expect(principal().nextElementSibling).toBe(pausa())
    expect(pausa()!.nextElementSibling).toBe(flecha())
    pausa()!.click()
    expect(clics).toEqual(['grabar:pausa'])
    quitar()
    document.body.replaceChildren()
    montar(base({ grabacion: 'pausada', grabacionSeg: 42 }))
    expect(pausa()!.getAttribute('aria-label')).toBe('Continuar la grabación')
    expect(pausa()!.querySelector('[data-icono="simular"]')).not.toBeNull()
  })

  it('sin ventana de Kirchi queda deshabilitado con su razón', () => {
    montar(base({ grabacion: 'no-disponible' }))
    expect(principal().getAttribute('aria-disabled')).toBe('true')
    expect(flecha().getAttribute('aria-disabled')).toBe('true')
  })
})
