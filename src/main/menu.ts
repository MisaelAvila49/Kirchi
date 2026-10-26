import type { MenuItemConstructorOptions } from 'electron'
import { ACELERADORES_OCULTOS, ORDEN_VENTANA, type OrdenTamaño } from '../compartido/ventana'

export interface OpcionesMenu {
  mac: boolean
  /** Con `--devtools`: agrega las herramientas de desarrollo con Ctrl+Shift+I. */
  devtools: boolean
  /** Acercar, alejar y tamaño real: el tamaño de la interfaz (un solo valor, guardado). */
  tamaño(orden: OrdenTamaño): void
}

/**
 * Menú propio. En Windows y Linux la barra se oculta pero quedan los aceleradores de zoom y pantalla completa, sin los atajos del menú por omisión de Electron (Ctrl+R, Ctrl+W, Alt).
 * En macOS se agregan los menús de aplicación y edición, que dan Copiar y Pegar en los campos.
 */
export function plantillaMenu(o: OpcionesMenu): MenuItemConstructorOptions[] {
  const ver: MenuItemConstructorOptions[] = [
    // Con un teclado en español el «+» de la fila de arriba llega como Plus (se muestra Ctrl++). Con uno en inglés el + va
    // con Shift y Ctrl+= acerca; el teclado numérico son otras teclas (numadd, numsub, num0): ítems ocultos.
    { id: 'acercar', label: ORDEN_VENTANA.acercar.nombre, accelerator: ORDEN_VENTANA.acercar.acelerador(o.mac), click: () => o.tamaño('acercar') },
    ...ACELERADORES_OCULTOS.map(([orden, accelerator]): MenuItemConstructorOptions => ({
      label: `${ORDEN_VENTANA[orden].nombre} (${accelerator.split('+').pop()})`,
      accelerator,
      visible: false,
      click: () => o.tamaño(orden)
    })),
    { id: 'alejar', label: ORDEN_VENTANA.alejar.nombre, accelerator: ORDEN_VENTANA.alejar.acelerador(o.mac), click: () => o.tamaño('alejar') },
    { id: 'tamaño-real', label: ORDEN_VENTANA['tamaño-real'].nombre, accelerator: ORDEN_VENTANA['tamaño-real'].acelerador(o.mac), click: () => o.tamaño('tamaño-real') },
    { type: 'separator' },
    { id: 'pantalla-completa', role: 'togglefullscreen', label: ORDEN_VENTANA['pantalla-completa'].nombre, accelerator: ORDEN_VENTANA['pantalla-completa'].acelerador(o.mac) }
  ]
  if (o.devtools) ver.push({ type: 'separator' }, { role: 'toggleDevTools', label: 'Herramientas de desarrollo', accelerator: 'CommandOrControl+Shift+I' })
  const menu: MenuItemConstructorOptions[] = [{ label: 'Ver', submenu: ver }]
  if (o.mac) menu.unshift({ role: 'appMenu' }, { role: 'editMenu' })
  return menu
}
