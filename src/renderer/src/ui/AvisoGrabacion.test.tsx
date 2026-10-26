// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AvisoGrabacion } from '../grabacion/control'
import AvisoGrabacionLienzo, { MS_AVISO_GUARDADA } from './AvisoGrabacion'

describe('el aviso al terminar de grabar', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    vi.useRealTimers()
    document.body.replaceChildren()
  })
  const montar = (aviso: AvisoGrabacion) => {
    const llamadas: string[] = []
    quitar = render(() => <AvisoGrabacionLienzo aviso={aviso} onAbrirCarpeta={() => llamadas.push('carpeta')} onCambiarNombre={() => llamadas.push('nombre')} onCerrar={() => llamadas.push('cerrar')} />, document.body)
    return llamadas
  }
  const botones = () => [...document.querySelectorAll('button')].map((b) => b.textContent!.trim())

  it('guardada: el texto con dos acciones, Abrir carpeta y Cambiar nombre, y se anuncia como estado', () => {
    const llamadas = montar({ tipo: 'guardada', texto: 'Grabación guardada en Videos › Kirchi', ruta: 'r', nombre: 'a.webm' })
    expect(document.querySelector('[role="status"]')!.textContent).toContain('Grabación guardada en Videos › Kirchi')
    expect(botones()).toEqual(['Abrir carpeta', 'Cambiar nombre', '×'])
    const [carpeta, nombre] = [...document.querySelectorAll('button')]
    carpeta.click()
    nombre.click()
    expect(llamadas).toEqual(['carpeta', 'nombre'])
  })

  it('guardada: se cierra sola a los 12 segundos', () => {
    vi.useFakeTimers()
    const llamadas = montar({ tipo: 'guardada', texto: 't', ruta: 'r', nombre: 'a.webm' })
    vi.advanceTimersByTime(MS_AVISO_GUARDADA - 1)
    expect(llamadas).toEqual([])
    vi.advanceTimersByTime(2)
    expect(llamadas).toEqual(['cerrar'])
  })

  it('error: se anuncia como alerta, solo trae cerrar y no se cierra solo', () => {
    vi.useFakeTimers()
    const llamadas = montar({ tipo: 'error', texto: 'No se pudo guardar la grabación.' })
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('No se pudo guardar la grabación.')
    expect(botones()).toEqual(['×'])
    vi.advanceTimersByTime(MS_AVISO_GUARDADA * 3)
    expect(llamadas).toEqual([])
  })
})
