// @vitest-environment happy-dom
import { createComponent, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import { libreriaDePrueba } from '../prueba/libreria'
import PanelLibreria from './PanelLibreria'

const lib = new Map(libreriaDePrueba().piezas)

describe('PanelLibreria con grupos', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const montar = (plegados: string[] = []) => {
    const host = document.createElement('div')
    document.body.append(host)
    const [plegado, setPlegado] = createSignal(plegados)
    const avisos: string[][] = []
    quitar = render(
      () =>
        createComponent(PanelLibreria, {
          lib,
          onTomar: () => {},
          onArrastrar: () => {},
          get gruposPlegados() {
            return plegado()
          },
          onGruposPlegados: (n) => {
            avisos.push(n)
            setPlegado(n)
          }
        }),
      host
    )
    const grupo = (nombre: string) => [...host.querySelectorAll<HTMLButtonElement>('.grupo-boton')].find((b) => b.textContent!.startsWith(nombre))!
    return { host, avisos, grupo }
  }

  it('Digitales muestra sus grupos con su conteo y las piezas sin grupo arriba', () => {
    const { host, grupo } = montar()
    expect(grupo('Compuertas').getAttribute('aria-label')).toBe('Compuertas 8 piezas')
    expect(grupo('Compuertas').getAttribute('aria-expanded')).toBe('true')
    expect(grupo('Biestables y contadores').getAttribute('aria-label')).toContain('8 piezas')
    const dig = [...host.querySelectorAll('section.categoria')].find((x) => x.textContent!.startsWith('Digitales'))!
    expect(dig.querySelector(':scope > ul.lista')!.textContent).toContain('Estado lógico')
  })

  it('plegar un grupo lo avisa con su id y oculta sus piezas; los plegados guardados llegan cerrados', () => {
    const { host, avisos, grupo } = montar()
    grupo('Compuertas').click()
    expect(avisos).toEqual([['digitales/Compuertas']])
    expect(grupo('Compuertas').getAttribute('aria-expanded')).toBe('false')
    expect(host.textContent).not.toContain('Compuerta NAND')
    grupo('Compuertas').click()
    expect(avisos.at(-1)).toEqual([])
    quitar()
    const otra = montar(['digitales/Biestables y contadores'])
    expect(otra.grupo('Biestables y contadores').getAttribute('aria-expanded')).toBe('false')
  })

  it('al buscar, la lista va plana sin grupos', () => {
    const { host } = montar()
    const campo = host.querySelector('input[type="search"]') as HTMLInputElement
    campo.value = 'nand'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
    expect(host.querySelector('.grupo-boton')).toBeNull()
    expect(host.textContent).toContain('NAND')
  })
})
