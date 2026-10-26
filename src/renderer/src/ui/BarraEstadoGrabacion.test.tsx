// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import BarraEstado from './BarraEstado'

describe('la barra de estado mientras se graba', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = (grabando: { pausada: boolean; reloj: string } | null) => {
    const llamadas: string[] = []
    quitar = render(
      () => <BarraEstado zoom={100} piezas={2} redes={1} pista="" grabando={grabando ? { ...grabando, onPausar: () => llamadas.push('pausar'), onDetener: () => llamadas.push('detener') } : null} />,
      document.body
    )
    return llamadas
  }
  const grupo = () => document.querySelector('.estado-grabando')

  it('sin grabar no muestra nada de la grabación', () => {
    montar(null)
    expect(grupo()).toBeNull()
  })

  it('grabando dice «Grabando 00:42» con Pausar y Detener, y ambos actúan', () => {
    const llamadas = montar({ pausada: false, reloj: '00:42' })
    expect(grupo()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('● Grabando 00:42 · Pausar · Detener')
    expect(grupo()!.getAttribute('aria-label')).toBe('Grabación en curso')
    const [pausar, detener] = [...grupo()!.querySelectorAll('button')]
    pausar.click()
    detener.click()
    expect(llamadas).toEqual(['pausar', 'detener'])
  })

  it('en pausa dice «En pausa» y ofrece Continuar', () => {
    montar({ pausada: true, reloj: '01:05' })
    expect(grupo()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('● En pausa 01:05 · Continuar · Detener')
    expect(grupo()!.querySelector('.punto-grabando')!.classList.contains('pausado')).toBe(true)
  })
})
