// @vitest-environment happy-dom
import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { seleccionVacia } from '../editor/seleccion'
import { PALETA_CLARA } from '../lienzo/paleta'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import type { ExtraMedicion, Lectura } from '../sim/lectura'
import PanelMediciones from './PanelMediciones'
import { nombresDeRedes } from './redes'

const lib = libreriaDePrueba().piezas
const d = divisor()
const nombres = nombresDeRedes(d, calcularConexiones(d, lib))

const contador: ExtraMedicion = {
  tipo: 'digital', modelo: 'msi', pines: [{ id: 'RCO', nombre: 'RCO', nivel: '0', salida: true }],
  registro: { clase: 'cuenta', valor: 9, bits: 4, nombres: ['QA', 'QB', 'QC', 'QD'], reloj: { hz: 1000, pin: 'CLK' } }
}
const adc: ExtraMedicion = { tipo: 'convertidor-ad', codigo: 128, bits: 8, convirtiendo: false, intr: '0', vref: 5, reloj: { tipo: 'rc', hz: 606e3, r: 10e3, c: 150e-12 } }
const lectura: Lectura = {
  t: 0.004208, ratio: 1, redes: new Map(),
  piezas: new Map([
    ['p_r1', { v: 2.5, i: 2.5e-3, p: 6.25e-3 }],
    ['p_r2', { v: 0, i: 0, p: 0, extra: contador }],
    ['p_v1', { v: 0, i: 0, p: 0, extra: adc }]
  ])
}

describe('PanelMediciones con lógica y convertidores', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const montar = (l: Lectura | null) => {
    const host = document.createElement('div')
    document.body.append(host)
    const pulsadas: string[] = []
    quitar = render(
      () => createComponent(PanelMediciones, { doc: d, lib, nombres, lectura: l, seleccion: seleccionVacia(), fase: 'corriendo', escala: 5, paleta: PALETA_CLARA, onPieza: (id) => pulsadas.push(id), onRed: () => {}, onSimular: () => {} }),
      host
    )
    return { host, pulsadas }
  }

  it('los MSI y el ADC salen en su sección con la cifra grande, los bits con su nivel escrito y el estado', () => {
    const { host } = montar(lectura)
    const sec = host.querySelector('section[aria-labelledby="mediciones-logica"]')!
    expect(sec.querySelector('h3')!.textContent).toContain('Lógica y convertidores')
    expect(sec.querySelector('h3 .pastilla')!.textContent).toBe('2')
    const fichas = [...sec.querySelectorAll('button.fila-logica')]
    expect(fichas.map((f) => f.querySelector('.fila-ref')!.textContent)).toEqual(['R2', 'V1'])
    expect(fichas[0].querySelector('output')!.textContent).toBe('9')
    expect([...fichas[0].querySelectorAll('.logica-bit')].map((b) => b.textContent)).toEqual(['QD1', 'QC0', 'QB0', 'QA1'])
    expect([...fichas[0].querySelectorAll('.logica-bit')].map((b) => b.getAttribute('data-magnitud'))).toEqual(['v', null, null, 'v'])
    expect(fichas[0].querySelector('.logica-rotulo')!.textContent).toBe('cuenta')
    expect(fichas[1].querySelector('.pastilla-estado')!.textContent).toBe('listo')
    expect(fichas[1].querySelector('output')!.textContent).toBe('128')
    expect(fichas[1].querySelector('.logica-renglones')!.textContent).toContain('2.50 V de 5.00 V')
    // Las piezas con ficha no se repiten en la lista de Piezas.
    expect(host.querySelector('section[aria-labelledby="mediciones-piezas"]')!.textContent).not.toContain('R2')
  })

  it('un clic en la ficha selecciona la pieza; sin ninguna pieza lógica no hay sección', () => {
    const { host, pulsadas } = montar(lectura)
    ;(host.querySelector('button.fila-logica') as HTMLButtonElement).click()
    expect(pulsadas).toEqual(['p_r2'])
    quitar()
    const solo = montar({ ...lectura, piezas: new Map([['p_r1', { v: 2.5, i: 2.5e-3, p: 6.25e-3 }]]) })
    expect(solo.host.querySelector('#mediciones-logica')).toBeNull()
  })
})
