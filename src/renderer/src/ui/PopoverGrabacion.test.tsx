// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { grabacionPorOmision, type OpcionesGrabacion } from '../../../compartido/ajustes'
import { TEXTO_TAMAÑO_POR_MINUTO, type OpcionMicrofono } from '../grabacion/textos'
import PopoverGrabacion from './PopoverGrabacion'

const espera = () => new Promise((r) => setTimeout(r, 0))

describe('las opciones de Grabar', () => {
  let quitar = () => {}
  afterEach(() => {
    quitar()
    document.body.replaceChildren()
  })
  const montar = async (extra: { opciones?: Partial<OpcionesGrabacion>; microfonos?: OpcionMicrofono[] } = {}) => {
    const cambios: Partial<OpcionesGrabacion>[] = []
    const cierres: boolean[] = []
    let empezadas = 0
    quitar = render(
      () => (
        <PopoverGrabacion
          x={10}
          y={20}
          opciones={{ ...grabacionPorOmision(), ...extra.opciones }}
          onCambiar={(p) => cambios.push(p)}
          onEmpezar={() => empezadas++}
          onCerrar={(f) => cierres.push(f)}
          microfonos={async () => extra.microfonos ?? []}
        />
      ),
      document.body
    )
    await espera()
    return { cambios, cierres, empezadas: () => empezadas }
  }
  const radios = (nombre: string) => [...document.querySelectorAll<HTMLInputElement>(`input[name="${nombre}"]`)]

  it('ofrece qué se graba, la calidad, el micrófono, el resalte de clics, la ayuda del tamaño y el botón de empezar', async () => {
    await montar()
    expect(document.querySelector('[role="dialog"]')!.getAttribute('aria-label')).toBe('Opciones de grabación')
    expect(document.body.textContent).toContain('Ventana de Kirchi')
    expect(document.body.textContent).toContain('Solo el lienzo')
    expect(document.body.textContent).toContain('Tamaño real')
    expect(document.body.textContent).toContain('Resaltar los clics del ratón')
    expect(document.body.textContent).toContain(TEXTO_TAMAÑO_POR_MINUTO)
    expect(document.querySelector('button.principal')!.textContent).toContain('Empezar a grabar')
    expect(radios('grabacion-que')).toHaveLength(2)
    expect(radios('grabacion-calidad')).toHaveLength(3)
  })

  it('muestra marcados los valores recordados', async () => {
    await montar({ opciones: { que: 'lienzo', calidad: '720p', resaltarClics: false } })
    expect(radios('grabacion-que').find((r) => r.checked)!.value).toBe('lienzo')
    expect(radios('grabacion-calidad').find((r) => r.checked)!.value).toBe('720p')
    expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false)
  })

  it('cada cambio se manda a los ajustes', async () => {
    const m = await montar()
    radios('grabacion-que')[1].click()
    radios('grabacion-calidad')[2].click()
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    expect(m.cambios).toEqual([{ que: 'lienzo' }, { calidad: 'real' }, { resaltarClics: false }])
  })

  it('el micrófono ofrece «Sin micrófono» y los dispositivos (sin etiqueta salen numerados) y recuerda el elegido', async () => {
    const m = await montar({ microfonos: [{ id: 'a1', etiqueta: 'Micrófono 1' }, { id: 'a2', etiqueta: 'Diadema USB' }], opciones: { microfono: 'a2' } })
    const sel = document.querySelector('select') as HTMLSelectElement
    expect([...sel.options].map((o) => o.textContent!.trim())).toEqual(['Sin micrófono', 'Micrófono 1', 'Diadema USB'])
    expect(sel.value).toBe('a2')
    sel.value = 'a1'
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    sel.value = ''
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    expect(m.cambios).toEqual([{ microfono: 'a1' }, { microfono: null }])
  })

  it('un micrófono recordado que ya no está se muestra como «Sin micrófono»', async () => {
    await montar({ microfonos: [{ id: 'a1', etiqueta: 'Micrófono 1' }], opciones: { microfono: 'desconectado' } })
    expect((document.querySelector('select') as HTMLSelectElement).value).toBe('')
  })

  it('«Empezar a grabar» arranca y Esc cierra devolviendo el foco', async () => {
    const m = await montar()
    document.querySelector<HTMLButtonElement>('button.principal')!.click()
    expect(m.empezadas()).toBe(1)
    document.querySelector('[role="dialog"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(m.cierres).toEqual([true])
  })

  it('un clic fuera lo cierra; uno dentro, o en el botón Grabar, no', async () => {
    const m = await montar()
    const boton = document.createElement('button')
    boton.dataset.comando = 'grabar'
    document.body.append(boton)
    boton.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.querySelector('[role="dialog"]')!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(m.cierres).toEqual([])
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(m.cierres).toEqual([false])
  })
})
