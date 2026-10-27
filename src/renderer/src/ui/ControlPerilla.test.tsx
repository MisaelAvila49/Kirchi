// @vitest-environment happy-dom
import { createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import ControlPerilla, { ControlPosicionPot, type PerillaVista } from './ControlPerilla'

const temperatura: PerillaVista = { id: 's1', propId: 'temperatura', ref: 'NTC1', nombre: 'Temperatura', unidad: '°C', valor: 25, enVivo: { magnitud: 'temperatura', min: -40, max: 150, paso: 1, pasoFino: 0.1 } }
const luz: PerillaVista = { id: 'l1', propId: 'luz', ref: 'LDR1', nombre: 'Iluminancia', unidad: 'lx', valor: 300, enVivo: { magnitud: 'luz', min: 1, max: 100000, paso: 10, pasoFino: 40, escala: 'log' } }

describe('ControlPerilla', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const montar = (v: PerillaVista) => {
    const host = document.createElement('div')
    document.body.append(host)
    const llamadas: [number, string | undefined][] = []
    const [vista, setVista] = createSignal(v)
    quitar = render(() => <ControlPerilla perilla={vista()} onCambiar={(x, g) => llamadas.push([x, g])} />, host)
    const slider = () => host.querySelector('input[type="range"]') as HTMLInputElement
    const campo = () => host.querySelector('input[type="text"]') as HTMLInputElement
    const tecla = (key: string, shiftKey = false) => slider().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
    return { host, llamadas, slider, campo, tecla, setVista }
  }

  it('es un deslizador con nombre y aria-valuetext con la unidad, y un campo con el valor', () => {
    const { slider, campo, host } = montar(temperatura)
    expect(slider().getAttribute('aria-label')).toBe('Temperatura de NTC1')
    expect(slider().getAttribute('aria-valuetext')).toBe('25 °C')
    expect(campo().value).toBe('25')
    expect(host.textContent).toContain('°C')
  })

  it('las flechas mueven un paso, con Shift el paso fino; Inicio y Fin van a los extremos', () => {
    const { llamadas, tecla } = montar(temperatura)
    tecla('ArrowRight')
    tecla('ArrowUp')
    tecla('ArrowLeft')
    tecla('ArrowDown', true)
    tecla('ArrowRight', true)
    tecla('Home')
    tecla('End')
    expect(llamadas.map((l) => l[0])).toEqual([26, 26, 24, 24.9, 25.1, -40, 150])
    expect(llamadas.every((l) => l[1] === undefined)).toBe(true)
  })

  it('Re Pág y Av Pág mueven diez pasos y ninguna tecla pasa del rango', () => {
    const { llamadas, tecla } = montar({ ...temperatura, valor: 145 })
    tecla('PageUp')
    tecla('PageDown')
    expect(llamadas.map((l) => l[0])).toEqual([150, 135])
  })

  it('una tecla que no es de la perilla no se atrapa', () => {
    const { tecla, slider } = montar(temperatura)
    const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    slider().dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
    expect(tecla('ArrowRight')).toBe(false)
  })

  it('en escala logarítmica cada muesca multiplica y el deslizador recorre décadas parejas', () => {
    const { llamadas, tecla, slider } = montar(luz)
    tecla('ArrowRight')
    tecla('ArrowLeft', true)
    expect(llamadas[0][0]).toBeCloseTo(300 * 10 ** 0.1, 3)
    expect(llamadas[1][0]).toBeCloseTo(300 / 10 ** 0.025, 3)
    // 300 lx está a log(300)/log(100000) = 49.6 % del recorrido.
    expect(Number(slider().value) / Number(slider().max)).toBeCloseTo(Math.log(300) / Math.log(100000), 2)
    slider().value = String(Number(slider().max) / 2)
    slider().dispatchEvent(new Event('input', { bubbles: true }))
    expect(llamadas[2][0]).toBeCloseTo(Math.sqrt(1 * 100000), 0)
  })

  it('arrastrar el deslizador es un solo gesto: el mismo identificador hasta soltar, otro en el arrastre siguiente', () => {
    const { llamadas, slider } = montar(temperatura)
    const mover = (v: number) => {
      slider().value = String(v)
      slider().dispatchEvent(new Event('input', { bubbles: true }))
    }
    slider().dispatchEvent(new Event('pointerdown', { bubbles: true }))
    mover(30)
    mover(40)
    slider().dispatchEvent(new Event('pointerup', { bubbles: true }))
    slider().dispatchEvent(new Event('pointerdown', { bubbles: true }))
    mover(50)
    expect(llamadas[0][1]).toBeDefined()
    expect(llamadas[1][1]).toBe(llamadas[0][1])
    expect(llamadas[2][1]).not.toBe(llamadas[0][1])
  })

  it('el valor escrito se aplica al salir del campo, con la unidad de la lista', () => {
    const { llamadas, campo, host } = montar(luz)
    campo().value = '2.5'
    campo().dispatchEvent(new Event('input', { bubbles: true }))
    const lista = host.querySelector('select') as HTMLSelectElement
    lista.value = 'k'
    lista.dispatchEvent(new Event('change', { bubbles: true }))
    expect(llamadas.at(-1)![0]).toBe(2500)
  })

  it('un valor escrito fuera de rango dice el rango y no cambia nada', () => {
    const { llamadas, campo, host } = montar(temperatura)
    campo().value = '300'
    campo().dispatchEvent(new Event('input', { bubbles: true }))
    campo().dispatchEvent(new Event('blur'))
    expect(llamadas).toEqual([])
    expect(host.querySelector('.campo-error')!.textContent).toBe('Temperatura va de -40 °C a 150 °C.')
    expect(campo().getAttribute('aria-invalid')).toBe('true')
  })

  it('un texto que no es número también se dice y se corrige al escribir un valor válido', () => {
    const { llamadas, campo, host } = montar(temperatura)
    campo().value = 'caliente'
    campo().dispatchEvent(new Event('input', { bubbles: true }))
    campo().dispatchEvent(new Event('blur'))
    expect(host.querySelector('.campo-error')!.textContent).toContain('no es un valor válido')
    campo().value = '90'
    campo().dispatchEvent(new Event('input', { bubbles: true }))
    campo().dispatchEvent(new Event('blur'))
    expect(llamadas.at(-1)![0]).toBe(90)
    expect(host.querySelector('.campo-error')).toBeNull()
  })

  it('el valor que llega de fuera (rueda, deshacer) se vuelve a mostrar', () => {
    const { campo, slider, setVista } = montar(temperatura)
    setVista({ ...temperatura, valor: 80 })
    expect(campo().value).toBe('80')
    expect(slider().getAttribute('aria-valuetext')).toBe('80 °C')
  })
})

describe('el potenciómetro sobre ControlPerilla', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const html = (lados: boolean) => {
    const host = document.createElement('div')
    document.body.append(host)
    quitar = render(() => <ControlPosicionPot lados={lados} pot={{ id: 'rv', ref: 'RV1', posicion: 40, ohms: 10000 }} onCambiar={() => {}} />, host)
    return { host, html: host.innerHTML.replace(/perilla-[\w-]+/g, 'pos-X') }
  }

  it('se ve igual que antes (mismo marcado, solo cambia el orden de los atributos): etiqueta, cifra, deslizador de 0 a 100 y las dos mitades', () => {
    const { html: h } = html(true)
    expect(h).toBe(
      '<div class="fld fld-pos"><label for="pos-X">Posición del cursor</label><output class="cifra" for="pos-X">40 %</output><input class="deslizador" type="range" id="pos-X" min="0" max="100" step="1" aria-valuetext="40 %" aria-label="Posición del cursor de RV1"><span class="secundario fld-lado">Pin 1 a cursor</span><b class="cifra">4 kΩ · 40 %</b><span class="secundario fld-lado">Cursor a pin 2</span><b class="cifra">6 kΩ · 60 %</b></div>'
    )
  })

  it('sin campo escrito ni escala, y los cambios llegan en porcentaje con las flechas de siempre', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const llamadas: number[] = []
    quitar = render(() => <ControlPosicionPot pot={{ id: 'rv', ref: 'RV1', posicion: 40 }} onCambiar={(v) => llamadas.push(v)} />, host)
    expect(host.querySelector('input[type="text"]')).toBeNull()
    const s = host.querySelector('input[type="range"]')!
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
    s.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true, cancelable: true }))
    expect(llamadas).toEqual([41, 30])
  })
})
