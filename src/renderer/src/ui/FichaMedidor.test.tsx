// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import FichaMedidor from './FichaMedidor'
import type { VistaMedidor } from './vistaInspector'

const base: VistaMedidor = { ref: 'M1', magnitud: 'voltaje', modo: 'dc', puedeCorriente: true, descripcion: 'Mide la red VIN respecto a tierra.' }

describe('la ficha del medidor rápido', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const montar = (m: VistaMedidor, extra: { simulando?: boolean } = {}) => {
    const host = document.createElement('div')
    document.body.append(host)
    const llamadas: unknown[] = []
    const [vista, setVista] = createSignal(m)
    quitar = render(
      () => (
        <FichaMedidor
          id="mv"
          medidor={vista()}
          simulando={extra.simulando}
          onReferencia={(id, t) => (llamadas.push(['ref', id, t]), /^M\d+$/.test(t) ? null : 'Mal')}
          onCambiar={(id, c) => (llamadas.push(['cambiar', id, c]), null)}
          onConvertir={(id) => llamadas.push(['convertir', id])}
        />
      ),
      host
    )
    return { host, llamadas, setVista }
  }

  it('muestra la referencia, dos grupos de radio, la línea de qué mide y el enlace para convertir', () => {
    const { host, llamadas } = montar(base)
    expect((host.querySelector('.caja-referencia input') as HTMLInputElement).value).toBe('M1')
    const grupos = Array.from(host.querySelectorAll('fieldset.conmutador'))
    expect(grupos.map((g) => g.querySelector('legend')?.textContent)).toEqual(['Mide', 'Modo'])
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'))
    expect(radios.filter((r) => r.checked).map((r) => r.parentElement?.textContent)).toEqual(['Voltaje', 'DC'])
    expect(host.textContent).toContain('Mide la red VIN respecto a tierra.')
    radios.find((r) => r.parentElement?.textContent?.startsWith('AC'))!.click()
    radios.find((r) => r.parentElement?.textContent === 'Corriente')!.click()
    expect(llamadas).toEqual([['cambiar', 'mv', { modo: 'ac' }], ['cambiar', 'mv', { magnitud: 'corriente' }]])
    ;(Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Convertir en multímetro completo') as HTMLButtonElement).click()
    expect(llamadas.at(-1)).toEqual(['convertir', 'mv'])
  })

  it('sobre una etiqueta, Corriente queda desactivada con su globo', () => {
    const { host } = montar({ ...base, puedeCorriente: false })
    const corriente = Array.from(host.querySelectorAll<HTMLLabelElement>('label.conmutador-op')).find((l) => l.textContent === 'Corriente')!
    expect(corriente.title).toBe('Pon el medidor sobre un cable para medir corriente.')
    expect(corriente.querySelector('input')!.disabled).toBe(true)
  })

  it('«Convertir en multímetro completo» es un botón secundario como los de la ficha, y con corriente sigue activo (el aviso lo da quien convierte)', () => {
    const { host, llamadas } = montar(base)
    const boton = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Convertir en multímetro completo') as HTMLButtonElement
    expect(boton.classList.contains('boton')).toBe(true)
    expect(boton.classList.contains('enlace')).toBe(false)
    quitar()
    const c = montar({ ...base, magnitud: 'corriente' })
    const bc = Array.from(c.host.querySelectorAll('button')).find((b) => b.textContent === 'Convertir en multímetro completo') as HTMLButtonElement
    expect(bc.disabled).toBe(false)
    expect(bc.title).toBe('')
    bc.click()
    expect(c.llamadas).toEqual([['convertir', 'mv']])
    expect(llamadas).toEqual([])
  })

  it('con corriente, AC (RMS) queda desactivada con su globo; un archivo con corriente AC la deja marcada', () => {
    const { host } = montar({ ...base, magnitud: 'corriente' })
    const ac = Array.from(host.querySelectorAll<HTMLLabelElement>('label.conmutador-op')).find((l) => l.textContent?.startsWith('AC'))!
    expect(ac.title).toBe('La corriente AC se mide con el multímetro completo en serie.')
    expect(ac.querySelector('input')!.disabled).toBe(true)
    quitar()
    const { host: h2 } = montar({ ...base, magnitud: 'corriente', modo: 'ac' })
    const ac2 = Array.from(h2.querySelectorAll<HTMLLabelElement>('label.conmutador-op')).find((l) => l.textContent?.startsWith('AC'))!
    expect(ac2.querySelector('input')!.checked).toBe(true)
  })

  it('la referencia usa la misma validación y simulando todo se bloquea', () => {
    const { host, llamadas } = montar(base)
    const campo = host.querySelector('.caja-referencia input') as HTMLInputElement
    campo.value = 'X9'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(llamadas).toContainEqual(['ref', 'mv', 'X9'])
    expect(host.querySelector('.campo-error')?.textContent).toBe('Mal')
    quitar()
    const s = montar(base, { simulando: true })
    expect(Array.from(s.host.querySelectorAll<HTMLFieldSetElement>('fieldset.conmutador')).every((f) => f.disabled)).toBe(true)
    expect((s.host.querySelector('.acciones button.boton') as HTMLButtonElement).disabled).toBe(true)
  })
})
