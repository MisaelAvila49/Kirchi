// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ajustesPorOmision } from '../../../compartido/ajustes'
import Configuracion from './Configuracion'

const espera = () => new Promise((r) => setTimeout(r, 0))

describe('Configuración › General › Grabaciones', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = (carpetaGrabaciones: string | undefined, grabacion?: { cambiarCarpeta(): Promise<string | null>; restablecerCarpeta(): Promise<void> }) => {
    quitar = render(() => <Configuracion ajustes={{ ...ajustesPorOmision(), carpetaGrabaciones }} onCambiar={() => {}} onCerrar={() => {}} grabacion={grabacion} />, document.body)
  }
  const boton = (texto: string) => [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === texto)!

  it('sin proceso principal la fila no se muestra', () => {
    montar(undefined)
    expect(document.body.textContent).not.toContain('Carpeta de grabaciones')
  })

  it('muestra la carpeta por omisión y, al cambiarla, el nombre de la elegida; Restablecer vuelve a la de siempre', async () => {
    const api = { cambiarCarpeta: vi.fn(async () => 'D:\\Clases\\Videos'), restablecerCarpeta: vi.fn(async () => {}) }
    montar(undefined, api)
    expect(document.body.textContent).toContain('Carpeta de grabaciones')
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Videos › Kirchi')
    expect(boton('Restablecer').disabled).toBe(true)
    boton('Cambiar…').click()
    await espera()
    expect(api.cambiarCarpeta).toHaveBeenCalledTimes(1)
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Videos')
    expect(boton('Restablecer').disabled).toBe(false)
    boton('Restablecer').click()
    await espera()
    expect(api.restablecerCarpeta).toHaveBeenCalledTimes(1)
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Videos › Kirchi')
  })

  it('si se cancela el diálogo la carpeta no cambia, y un error se dice', async () => {
    const api = { cambiarCarpeta: vi.fn(async (): Promise<string | null> => null), restablecerCarpeta: vi.fn(async () => {}) }
    montar('C:\\Mis videos', api)
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Mis videos')
    boton('Cambiar…').click()
    await espera()
    expect(document.getElementById('carpeta-grabaciones')!.textContent).toBe('Mis videos')
    api.cambiarCarpeta.mockRejectedValueOnce(new Error('No se pudo usar esa carpeta.'))
    boton('Cambiar…').click()
    await espera()
    expect(document.querySelector('[role="alert"]')!.textContent).toBe('No se pudo usar esa carpeta.')
  })
})
