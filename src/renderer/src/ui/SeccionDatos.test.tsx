// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enlaceDeLcsc } from '../../../compartido/enlaces'
import Inspector from './Inspector'
import SeccionDatos, { type VistaDatosVisible } from './SeccionDatos'
import type { VistaInspector } from './vistaInspector'

const HOJA = 'https://www.onsemi.com/pdf/datasheet/2n3904-d.pdf'
const fisica: VistaDatosVisible = {
  tipo: 'fisica',
  encapsulado: 'TO-92',
  montaje: 'orificio pasante',
  tipico: false,
  parte: '2N3904BU',
  fabricante: 'onsemi',
  patillas: [
    { numero: '1', nombre: 'E', atenuada: false },
    { numero: '2', nombre: 'B', atenuada: false },
    { numero: '3', nombre: 'C', atenuada: false }
  ],
  huella: 'Package_TO_SOT_THT:TO-92_Inline',
  lcsc: { numero: 'C124482', sinVerificar: true },
  hoja: HOJA,
  avisos: []
}

let quitar = () => {}
afterEach(() => {
  quitar()
  document.body.replaceChildren()
  delete (window as { kirchi?: unknown }).kirchi
})
const montar = (el: () => import('solid-js').JSX.Element) => {
  const host = document.createElement('div')
  document.body.append(host)
  quitar = render(el, host)
  return host
}
const esperar = () => new Promise((r) => setTimeout(r, 0))

describe('«Datos de la pieza»', () => {
  it('lee el encapsulado y las tres patillas, y marca el LCSC sin verificar', () => {
    const host = montar(() => <SeccionDatos vista={fisica} plegada={false} onPlegada={() => {}} onCopiar={() => {}} onAbrir={() => {}} />)
    expect(host.querySelector('dl')!.textContent).toContain('TO-92, orificio pasante')
    expect([...host.querySelectorAll('tbody tr')].map((f) => f.textContent)).toEqual(['1E', '2B', '3C'])
    expect(host.querySelector('.datos-marca')!.textContent).toBe('sin verificar')
  })

  it('abre y pliega, y avisa del cambio', async () => {
    const cambios: boolean[] = []
    const host = montar(() => <SeccionDatos vista={fisica} plegada onPlegada={(p) => cambios.push(p)} onCopiar={() => {}} onAbrir={() => {}} />)
    const d = host.querySelector('details')!
    expect(d.open).toBe(false)
    d.open = true
    await esperar()
    expect(cambios).toEqual([false])
  })

  it('copia la huella y el número de LCSC', async () => {
    const copiados: string[] = []
    const host = montar(() => <SeccionDatos vista={fisica} plegada={false} onPlegada={() => {}} onCopiar={(t) => void copiados.push(t)} onAbrir={() => {}} />)
    ;(host.querySelector('button[aria-label="Copiar la huella de KiCad"]') as HTMLButtonElement).click()
    ;(host.querySelector('button[aria-label="Copiar el número de LCSC"]') as HTMLButtonElement).click()
    await esperar()
    expect(copiados).toEqual(['Package_TO_SOT_THT:TO-92_Inline', 'C124482'])
    expect(host.querySelector('[role="status"]')!.textContent).toBe('Número de LCSC copiado.')
  })

  it('los botones de la hoja y de LCSC piden abrir su enlace, y nada se abre antes del clic', () => {
    const abiertos: string[] = []
    const host = montar(() => <SeccionDatos vista={fisica} plegada={false} onPlegada={() => {}} onCopiar={() => {}} onAbrir={(u) => void abiertos.push(u)} />)
    expect(abiertos).toEqual([])
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'Abrir hoja de datos')!.click()
    ;(host.querySelector('button[aria-label="Abrir la página de LCSC en el navegador"]') as HTMLButtonElement).click()
    expect(abiertos).toEqual([HOJA, enlaceDeLcsc('C124482')])
  })

  it('una pieza ideal y una combinación sin fila llevan una sola línea', () => {
    const a = montar(() => <SeccionDatos vista={{ tipo: 'virtual' }} plegada={false} onPlegada={() => {}} onCopiar={() => {}} onAbrir={() => {}} />)
    expect(a.querySelector('.datos-linea')!.textContent).toBe('Pieza ideal: no tiene una versión física.')
    expect(a.querySelector('table')).toBeNull()
  })
})

describe('el inspector con «Datos de la pieza»', () => {
  const vista = (datos: VistaDatosVisible | { tipo: 'ninguno' }): VistaInspector => ({
    tipo: 'pieza', id: 'q', ref: 'Q1', nombre: 'Transistor NPN', categoria: 'Semiconductores', defId: 'npn', pines: 3, props: [], rot: 0, espejo: false,
    conexiones: [{ pin: 'E', numero: '1', red: '0' }], datos
  })

  it('va después de «Conexiones» con el número en la fila, se recuerda plegado y abre la hoja por el puente', async () => {
    const guardados: unknown[] = []
    const abiertos: string[] = []
    ;(window as unknown as { kirchi: unknown }).kirchi = {
      ajustes: {},
      guardarAjustes: async (p: unknown) => void guardados.push(p),
      abrirEnlace: async (u: string) => void abiertos.push(u)
    }
    const host = montar(() => <Inspector vista={vista(fisica)} onCambiarProp={() => null} onOrientar={() => {}} onTransformar={() => {}} onDuplicar={() => {}} onBorrar={() => {}} onPlegar={() => {}} onAviso={() => {}} onVerAvisos={() => {}} onFormato={() => {}} onVerRedes={() => {}} />)
    expect(host.textContent).toContain('E · 1')
    const d = host.querySelector('details.seccion-datos') as HTMLDetailsElement
    expect(d.open).toBe(false)
    d.open = true
    await esperar()
    expect(guardados).toEqual([{ inspectorDatosPlegado: false }])
    ;[...host.querySelectorAll('button')].find((b) => b.textContent === 'Abrir hoja de datos')!.click()
    await esperar()
    expect(abiertos).toEqual([HOJA])
  })

  it('sin datos en la pieza, la sección no aparece', () => {
    const host = montar(() => <Inspector vista={vista({ tipo: 'ninguno' })} onCambiarProp={() => null} onOrientar={() => {}} onTransformar={() => {}} onDuplicar={() => {}} onBorrar={() => {}} onPlegar={() => {}} onAviso={() => {}} onVerAvisos={() => {}} onFormato={() => {}} onVerRedes={() => {}} />)
    expect(host.querySelector('.seccion-datos')).toBeNull()
  })
})
