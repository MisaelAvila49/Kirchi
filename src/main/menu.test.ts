import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it } from 'vitest'
import { ORDEN_VENTANA } from '../compartido/ventana'
import { plantillaMenu } from './menu'

const todos = (m: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] =>
  m.flatMap((i) => [i, ...(Array.isArray(i.submenu) ? todos(i.submenu) : [])])

describe('plantillaMenu', () => {
  it('da zoom de página y pantalla completa con sus teclas; el zoom va al tamaño de la interfaz', () => {
    const ordenes: string[] = []
    const items = todos(plantillaMenu({ mac: false, devtools: false, tamaño: (o) => ordenes.push(o) }))
    const teclas = Object.fromEntries(items.filter((i) => i.id && i.visible !== false).map((i) => [i.id, i.accelerator]))
    expect(teclas).toEqual({ acercar: 'CommandOrControl+Plus', alejar: 'CommandOrControl+-', 'tamaño-real': 'CommandOrControl+0', 'pantalla-completa': 'F11' })
    // Con un teclado en inglés el + va con Shift: Ctrl+= también acerca, sin mostrarse; el numérico acerca, aleja y vuelve al 100 %.
    const ocultos = items.filter((i) => i.visible === false)
    expect(ocultos.map((i) => i.accelerator)).toEqual(['CommandOrControl+=', 'CommandOrControl+numadd', 'CommandOrControl+numsub', 'CommandOrControl+num0'])
    for (const i of ocultos) (i.click as () => void)()
    expect(ordenes).toEqual(['acercar', 'acercar', 'alejar', 'tamaño-real'])
    ordenes.length = 0
    for (const i of items) if (typeof i.click === 'function' && i.visible !== false) (i.click as () => void)()
    expect(ordenes).toEqual(['acercar', 'alejar', 'tamaño-real'])
    // Ninguno es ya un rol de zoom de Chromium (medio nivel por paso).
    expect(items.map((i) => i.role)).not.toContain('zoomIn')
    expect(items.find((i) => i.id === 'pantalla-completa')?.role).toBe('togglefullscreen')
  })

  it('los nombres y las teclas salen de la tabla que comparte con la cinta; en macOS, Control+Command+F', () => {
    const items = todos(plantillaMenu({ mac: true, devtools: false, tamaño: () => {} }))
    expect(items.filter((i) => i.id).map((i) => [i.id, i.label])).toEqual([
      ['acercar', ORDEN_VENTANA.acercar.nombre], ['alejar', ORDEN_VENTANA.alejar.nombre], ['tamaño-real', ORDEN_VENTANA['tamaño-real'].nombre], ['pantalla-completa', ORDEN_VENTANA['pantalla-completa'].nombre]
    ])
    expect(items.find((i) => i.role === 'togglefullscreen')?.accelerator).toBe('Control+Command+F')
  })

  it('no reserva Ctrl+R, Ctrl+W ni las herramientas sin la bandera', () => {
    const roles = todos(plantillaMenu({ mac: false, devtools: false, tamaño: () => {} })).map((i) => i.role)
    for (const r of ['reload', 'forceReload', 'close', 'quit', 'toggleDevTools']) expect(roles).not.toContain(r)
  })

  it('con --devtools agrega las herramientas en Ctrl+Shift+I', () => {
    const d = todos(plantillaMenu({ mac: false, devtools: true, tamaño: () => {} })).find((i) => i.role === 'toggleDevTools')
    expect(d?.accelerator).toBe('CommandOrControl+Shift+I')
  })

  it('en macOS conserva el menú de la aplicación y el de edición', () => {
    expect(plantillaMenu({ mac: true, devtools: false, tamaño: () => {} }).map((i) => i.role ?? i.label)).toEqual(['appMenu', 'editMenu', 'Ver'])
  })
})
