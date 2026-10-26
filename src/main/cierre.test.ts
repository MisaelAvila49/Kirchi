import { describe, expect, it } from 'vitest'
import { CANALES } from '../compartido/archivos'
import { ControlCierre, type VentanaCerrable } from './cierre'

/** Ventana falsa: `cerrarDesdeFuera()` es el clic en la X; `close()` cierra si nadie lo impide. */
function ventana() {
  const oyentes = new Map<string, ((e?: unknown) => void)[]>()
  const enviados: string[] = []
  let cerrada = false
  const on = (ev: string, f: (e?: unknown) => void) => oyentes.set(ev, [...(oyentes.get(ev) ?? []), f])
  const emitir = (ev: string, e?: unknown) => (oyentes.get(ev) ?? []).forEach((f) => f(e))
  const intentar = () => {
    let impedido = false
    emitir('close', { preventDefault: () => (impedido = true) })
    if (!impedido) {
      cerrada = true
      emitir('closed')
    }
  }
  const win = { on, close: intentar, webContents: { send: (c: string) => enviados.push(c), on } } as unknown as VentanaCerrable
  return { win, enviados, emitir, cerrarDesdeFuera: intentar, cerrada: () => cerrada }
}

function armar() {
  const v = ventana()
  let terminadas = 0
  const c = new ControlCierre(v.win, { terminar: () => terminadas++ })
  return { ...v, c, terminadas: () => terminadas }
}

describe('ControlCierre', () => {
  it('sin cambios se cierra sin preguntar y borra el diario', () => {
    const v = armar()
    v.cerrarDesdeFuera()
    expect(v.cerrada()).toBe(true)
    expect(v.enviados).toEqual([])
    expect(v.terminadas()).toBe(1)
  })

  it('con cambios pide a la interfaz que pregunte y no se cierra', () => {
    const v = armar()
    v.c.ponerEstado({ sucio: true })
    v.cerrarDesdeFuera()
    expect(v.cerrada()).toBe(false)
    expect(v.enviados).toEqual([CANALES.pideCerrar])
  })

  it('Guardar: la interfaz limpia el estado y cierra; el diario se borra', () => {
    const v = armar()
    v.c.ponerEstado({ sucio: true })
    v.cerrarDesdeFuera()
    v.c.ponerEstado({ sucio: false })
    v.c.cerrar(false)
    expect(v.cerrada()).toBe(true)
    expect(v.terminadas()).toBe(1)
  })

  it('No guardar: cierra con cambios y el diario se borra igual', () => {
    const v = armar()
    v.c.ponerEstado({ sucio: true })
    v.c.cerrar(true)
    expect(v.cerrada()).toBe(true)
    expect(v.terminadas()).toBe(1)
  })

  it('si la interfaz no responde, o al apagar el equipo, cierra sin preguntar y conserva el diario', () => {
    for (const ev of ['unresponsive', 'session-end']) {
      const v = armar()
      v.c.ponerEstado({ sucio: true })
      v.emitir(ev)
      v.cerrarDesdeFuera()
      expect(v.cerrada()).toBe(true)
      expect(v.terminadas()).toBe(0)
    }
  })

  it('una interfaz que volvió a responder vuelve a preguntar', () => {
    const v = armar()
    v.c.ponerEstado({ sucio: true })
    v.emitir('unresponsive')
    v.emitir('responsive')
    v.cerrarDesdeFuera()
    expect(v.cerrada()).toBe(false)
  })

  it('salir sin preguntar (pruebas) conserva el diario', () => {
    const v = armar()
    v.c.ponerEstado({ sucio: true })
    v.c.salirSinPreguntar()
    v.cerrarDesdeFuera()
    expect(v.cerrada()).toBe(true)
    expect(v.terminadas()).toBe(0)
  })

  it('si borrar el diario falla (archivo retenido), cerrar la ventana no lanza', () => {
    const v = ventana()
    new ControlCierre(v.win, {
      terminar: () => {
        throw Object.assign(new Error('retenido'), { code: 'EBUSY' })
      }
    })
    expect(() => v.cerrarDesdeFuera()).not.toThrow()
    expect(v.cerrada()).toBe(true)
  })

  it('un estado mal formado cuenta como sin cambios', () => {
    const v = armar()
    v.c.ponerEstado('sucio')
    v.cerrarDesdeFuera()
    expect(v.cerrada()).toBe(true)
  })
})
