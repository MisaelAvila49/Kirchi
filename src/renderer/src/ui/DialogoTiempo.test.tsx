// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import DialogoTiempo from './DialogoTiempo'

describe('el diálogo de tiempo usa el campo con número y unidad', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  let cierres = 0
  const montar = (modo: 'hasta' | 'delta', inicial: number | null, t = 0) => {
    const aceptados: [number, boolean][] = []
    cierres = 0
    quitar = render(() => <DialogoTiempo modo={modo} t={t} velocidad={1} inicial={inicial} onAceptar={(s, r) => void aceptados.push([s, r])} onCerrar={() => void cierres++} />, document.body)
    return aceptados
  }
  const numero = () => document.querySelector<HTMLInputElement>('.entrada-valor input')!
  const unidad = () => document.querySelector<HTMLSelectElement>('select.unidad-valor')!
  const enviar = () => document.querySelector<HTMLFormElement>('form')!.requestSubmit()
  const error = () => document.getElementById('tiempo-error')!.textContent

  it('el intervalo escrito abre con número y lista de unidades (ns, µs, ms, s) y 1 ms por omisión', () => {
    const r = montar('delta', null)
    expect(numero().value).toBe('1')
    expect([...unidad().options].map((o) => o.textContent)).toEqual(['ns', 'µs', 'ms', 's'])
    // Aceptar sin tocar nada manda lo que se ve: 1 ms (happy-dom no refleja `selected` en `select.value`).
    enviar()
    expect(r[0][0]).toBeCloseTo(1e-3, 12)
  })

  it('con un intervalo ya escrito, lo muestra con su prefijo', () => {
    const r = montar('delta', 2.5e-5)
    expect(numero().value).toBe('25')
    enviar()
    expect(r[0][0]).toBeCloseTo(2.5e-5, 12)
  })

  it('Tiempo fijo trae los botones de 10 µs, 100 µs, 1 ms y 10 ms, que lo fijan y cierran; Avanzar hasta no los trae', () => {
    const r = montar('delta', null)
    const botones = [...document.querySelectorAll<HTMLButtonElement>('.tiempos-rapidos button')]
    expect(botones.map((b) => b.textContent)).toEqual(['10 µs', '100 µs', '1 ms', '10 ms'])
    botones[3].click()
    expect(r).toEqual([[1e-2, false]])
    expect(cierres).toBe(1)
    quitar()
    document.body.replaceChildren()
    montar('hasta', null, 0)
    expect(document.querySelector('.tiempos-rapidos')).toBeNull()
  })

  it('«Avanzar hasta t» propone el siguiente instante redondo sobre el actual', () => {
    const r = montar('hasta', null, 0.012)
    expect(numero().value).toBe('20')
    enviar()
    expect(r[0][0]).toBeCloseTo(0.02, 12)
  })

  it('acepta número y unidad juntos', () => {
    const r = montar('delta', null)
    numero().value = '50'
    numero().dispatchEvent(new InputEvent('input', { bubbles: true }))
    unidad().value = 'µ'
    unidad().dispatchEvent(new Event('change', { bubbles: true }))
    enviar()
    expect(r).toHaveLength(1)
    expect(r[0][0]).toBeCloseTo(5e-5, 12)
  })

  it('un campo vacío o fuera de rango dice qué hacer', () => {
    const r = montar('delta', null)
    numero().value = ''
    numero().dispatchEvent(new InputEvent('input', { bubbles: true }))
    enviar()
    expect(error()).toBe('Escribe un tiempo, por ejemplo 2 ms.')
    unidad().value = ''
    unidad().dispatchEvent(new Event('change', { bubbles: true }))
    numero().value = '5000'
    numero().dispatchEvent(new InputEvent('input', { bubbles: true }))
    enviar()
    expect(error()).toBe('El intervalo va de 1 ns a 1000 s.')
    expect(r).toHaveLength(0)
  })

  it('un instante que ya pasó lo explica', () => {
    const r = montar('hasta', 0.001, 0.5)
    enviar()
    expect(error()).toMatch(/^Avanzar hasta t llega a un instante futuro/)
    expect(r).toHaveLength(0)
  })
})
