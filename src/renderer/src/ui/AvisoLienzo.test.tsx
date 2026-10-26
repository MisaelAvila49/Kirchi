// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AvisoLienzo, { DURACION_AVISO_LIENZO } from './AvisoLienzo'

describe('el aviso sobre el lienzo', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    vi.useRealTimers()
  })

  it('muestra el texto como estado, se cierra con el botón y solo', () => {
    vi.useFakeTimers()
    const host = document.createElement('div')
    document.body.append(host)
    const [texto, setTexto] = createSignal<string | null>(null)
    quitar = render(() => <AvisoLienzo texto={texto()} onCerrar={() => setTexto(null)} />, host)
    const zona = host.querySelector('[role="status"]')!
    expect(zona.textContent).toBe('')
    setTexto('Para medir corriente, intercálalo en serie.')
    expect(zona.textContent).toContain('Para medir corriente, intercálalo en serie.')
    ;(host.querySelector('button[aria-label="Cerrar el aviso"]') as HTMLButtonElement).click()
    expect(zona.querySelector('.aviso-lienzo')).toBeNull()
    setTexto('Otro')
    vi.advanceTimersByTime(DURACION_AVISO_LIENZO + 10)
    expect(zona.querySelector('.aviso-lienzo')).toBeNull()
  })
})
