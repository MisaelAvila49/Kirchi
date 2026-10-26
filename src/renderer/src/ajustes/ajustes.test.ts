import { afterEach, describe, expect, it } from 'vitest'
import { ajustesPorOmision, type Ajustes, type ApiKirchi } from '../../../compartido/ajustes'
import type { ApiArchivos } from '../../../compartido/archivos'
import { ajustesIniciales, apiArchivos, apiVentana, escucharTamañoInterfaz, guardarAjustes, leerAjustes, modoPruebas, UltimaRespuesta } from './ajustes'

const global = globalThis as { window?: { kirchi?: ApiKirchi } }
afterEach(() => {
  delete global.window
})

describe('ajustes de la interfaz', () => {
  it('arranca con el lateral y el inspector plegados aunque la última sesión los dejara abiertos, y recuerda la pestaña del riel', () => {
    global.window = {
      kirchi: {
        ajustes: { ...ajustesPorOmision(), panel: 'plantillas', lateral: true, inspector: true },
        pruebas: false,
        guardarAjustes: async (p) => ({ ...ajustesPorOmision(), ...p }),
        leerAjustes: async () => ajustesPorOmision(),
        archivos: {} as ApiArchivos
      }
    }
    const a = ajustesIniciales()
    expect(a.lateral).toBe(false)
    expect(a.inspector).toBe(false)
    expect(a.panel).toBe('plantillas')
  })

  it('sin preload: ajustes por omisión, sin sonda, sin archivos y guardar no hace nada', async () => {
    expect(ajustesIniciales()).toEqual({ ...ajustesPorOmision(), lateral: false, inspector: false })
    expect(modoPruebas()).toBe(false)
    expect(apiArchivos()).toBeUndefined()
    await expect(guardarAjustes({ tema: 'oscuro' })).resolves.toBeUndefined()
    await expect(leerAjustes()).resolves.toBeUndefined()
  })

  it('los ajustes de una versión anterior (sin la cinta) se completan con los de por omisión', () => {
    const { cinta: _sin, ...viejos } = { ...ajustesPorOmision(), tema: 'oscuro' as const }
    global.window = {
      kirchi: {
        ajustes: viejos as Ajustes,
        pruebas: false,
        guardarAjustes: async (p) => ({ ...ajustesPorOmision(), ...p }),
        leerAjustes: async () => ajustesPorOmision(),
        archivos: {} as ApiArchivos
      }
    }
    expect(ajustesIniciales()).toEqual({ ...ajustesPorOmision(), tema: 'oscuro', lateral: false, inspector: false })
  })

  it('lo que devuelve el proceso principal también se normaliza: unos ajustes sin una clave nueva no la dejan indefinida', async () => {
    const { lienzoSincronizado: _sin, ...viejos } = ajustesPorOmision()
    global.window = {
      kirchi: {
        ajustes: viejos as Ajustes,
        pruebas: false,
        guardarAjustes: async (p) => ({ ...viejos, ...p }) as Ajustes,
        leerAjustes: async () => viejos as Ajustes,
        archivos: {} as ApiArchivos
      }
    }
    expect((await guardarAjustes({ tema: 'oscuro' }))?.lienzoSincronizado).toBe(true)
    expect((await guardarAjustes({ tema: 'oscuro' }))?.tema).toBe('oscuro')
    expect((await leerAjustes())?.lienzoSincronizado).toBe(true)
  })

  it('la orden de la ventana solo existe con preload', () => {
    expect(apiVentana()).toBeUndefined()
    const ordenes: string[] = []
    global.window = {
      kirchi: {
        ajustes: ajustesPorOmision(),
        pruebas: false,
        guardarAjustes: async () => ajustesPorOmision(),
        leerAjustes: async () => ajustesPorOmision(),
        archivos: {} as ApiArchivos,
        ventana: (o) => ordenes.push(o)
      }
    }
    apiVentana()?.('pantalla-completa')
    expect(ordenes).toEqual(['pantalla-completa'])
  })

  it('con preload: los ajustes de la ventana, la bandera y el guardado van al proceso principal', async () => {
    const guardados: Partial<Ajustes>[] = []
    const ajustes = { ...ajustesPorOmision(), tema: 'oscuro' as const }
    const archivos = {} as ApiArchivos
    global.window = {
      kirchi: {
        ajustes,
        pruebas: true,
        guardarAjustes: async (p) => {
          guardados.push(p)
          return { ...ajustes, ...p }
        },
        leerAjustes: async () => ({ ...ajustes, lateral: false }),
        archivos
      }
    }
    expect(ajustesIniciales().tema).toBe('oscuro')
    expect(modoPruebas()).toBe(true)
    expect(apiArchivos()).toBe(archivos)
    await expect(guardarAjustes({ inspector: false })).resolves.toEqual({ ...ajustes, inspector: false })
    expect(guardados).toEqual([{ inspector: false }])
    await expect(leerAjustes()).resolves.toMatchObject({ lateral: false })
  })

  it('UltimaRespuesta: la respuesta de una petición vieja no cuenta', () => {
    const u = new UltimaRespuesta()
    const a = u.pedir()
    const b = u.pedir()
    expect(a()).toBe(false)
    expect(b()).toBe(true)
  })
})

describe('tamaño de la interfaz', () => {
  it('sin preload no escucha nada; con él, pasa el valor y devuelve con qué dejar de escuchar', () => {
    expect(escucharTamañoInterfaz(() => {})()).toBeUndefined()
    const vistos: number[] = []
    let oyente: ((t: 125) => void) | null = null
    global.window = { kirchi: { alTamañoInterfaz: (f: (t: 125) => void) => ((oyente = f), () => (oyente = null)) } as never }
    const quitar = escucharTamañoInterfaz((t) => vistos.push(t))
    oyente!(125)
    quitar()
    expect(vistos).toEqual([125])
    expect(oyente).toBeNull()
  })
})
