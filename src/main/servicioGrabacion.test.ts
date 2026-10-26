import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { depsReales, limpiarNombre, nombreGrabacion, ServicioGrabacion, type DepsGrabacion } from './servicioGrabacion'

const FECHA = new Date(2026, 9, 24, 15, 42, 7)
const VIDEOS = join('C:', 'Users', 'u', 'Videos')

function montar(o: { configurada?: string; dialogo?: string | null; existentes?: string[]; noEscribible?: string[] } = {}) {
  const archivos = new Map<string, Uint8Array>()
  for (const e of o.existentes ?? []) archivos.set(e, new Uint8Array([1]))
  const carpetas = new Set<string>(o.configurada ? [o.configurada] : [])
  const creadas: string[] = []
  const deps: DepsGrabacion = {
    videos: () => VIDEOS,
    carpetaConfigurada: () => o.configurada,
    esCarpeta: (r) => carpetas.has(r),
    esEscribible: (r) => !(o.noEscribible ?? []).includes(r),
    existe: (r) => archivos.has(r) || carpetas.has(r),
    crearCarpeta: (r) => {
      carpetas.add(r)
      creadas.push(r)
    },
    escribir: (r, b) => void archivos.set(r, b),
    mover: (de, a) => {
      archivos.set(a, archivos.get(de)!)
      archivos.delete(de)
    },
    ahora: () => FECHA,
    dialogoGuardarComo: async () => o.dialogo ?? null
  }
  return { s: new ServicioGrabacion(deps), archivos, creadas }
}
const bytes = new Uint8Array([26, 69, 223, 163])

describe('nombre de la grabación', () => {
  it('lleva el circuito, la fecha y la hora locales', () => {
    expect(nombreGrabacion('Divisor de voltaje', FECHA)).toBe('Divisor de voltaje 2026-10-24 15.42.webm')
  })
  it('sin nombre usa Kirchi', () => {
    expect(nombreGrabacion('Divisor', FECHA, 'mp4')).toBe('Divisor 2026-10-24 15.42.mp4')
    expect(nombreGrabacion('', FECHA)).toBe('Kirchi 2026-10-24 15.42.webm')
    expect(nombreGrabacion(undefined, FECHA)).toBe('Kirchi 2026-10-24 15.42.webm')
    expect(nombreGrabacion('  ', FECHA)).toBe('Kirchi 2026-10-24 15.42.webm')
  })
  it('limpia lo que no admite el sistema de archivos', () => {
    expect(limpiarNombre('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j')
    expect(limpiarNombre('con')).toBe('Kirchi')
    expect(limpiarNombre('NUL')).toBe('Kirchi')
    expect(limpiarNombre('termina.')).toBe('termina')
    expect(limpiarNombre('..oculto')).toBe('oculto')
    expect(limpiarNombre('x\u0000y\u001fz')).toBe('x y z')
  })
  it('recorta nombres largos', () => {
    expect(limpiarNombre('a'.repeat(300)).length).toBe(80)
  })
})

describe('carpeta de grabaciones', () => {
  it('es Videos/Kirchi y se crea si falta', () => {
    const { s, creadas } = montar()
    const esperada = join(VIDEOS, 'Kirchi')
    expect(s.carpetaGrabaciones()).toBe(esperada)
    expect(creadas).toEqual([esperada])
    expect(s.carpetaGrabaciones()).toBe(esperada)
    expect(creadas).toHaveLength(1)
  })
  it('usa la configurada si existe y se puede escribir', () => {
    const c = join('D:', 'Grabaciones')
    const { s, creadas } = montar({ configurada: c })
    expect(s.carpetaGrabaciones()).toBe(c)
    expect(creadas).toEqual([])
  })
  it('vuelve a Videos/Kirchi si la configurada no existe o no se puede escribir', () => {
    const c = join('D:', 'Grabaciones')
    expect(montar({ configurada: c, noEscribible: [c] }).s.carpetaGrabaciones()).toBe(join(VIDEOS, 'Kirchi'))
    const sinCarpeta = montar()
    const deps = { ...sinCarpeta } // la configurada ausente del disco
    expect(deps.s.carpetaGrabaciones()).toBe(join(VIDEOS, 'Kirchi'))
  })
})

describe('guardar', () => {
  it('escribe en la carpeta con el nombre automático y devuelve la ruta', () => {
    const { s, archivos } = montar()
    const ruta = s.guardar(bytes, 'Divisor de voltaje')
    expect(ruta).toBe(join(VIDEOS, 'Kirchi', 'Divisor de voltaje 2026-10-24 15.42.webm'))
    expect(archivos.get(ruta)).toBe(bytes)
  })
  it('nunca pisa: añade (2) y (3)', () => {
    const base = join(VIDEOS, 'Kirchi', 'Kirchi 2026-10-24 15.42.webm')
    const { s } = montar({ existentes: [base] })
    expect(s.guardar(bytes)).toBe(join(VIDEOS, 'Kirchi', 'Kirchi 2026-10-24 15.42 (2).webm'))
    expect(s.guardar(bytes)).toBe(join(VIDEOS, 'Kirchi', 'Kirchi 2026-10-24 15.42 (3).webm'))
  })
  it('rechaza una grabación vacía', () => {
    expect(() => montar().s.guardar(new Uint8Array(0))).toThrow()
  })
  it('si pierde la carrera por el nombre (EEXIST) prueba el siguiente', () => {
    const m = montar()
    let primera = true
    const dep = (m.s as unknown as { deps: DepsGrabacion }).deps
    const escribir = dep.escribir
    dep.escribir = (r, b) => {
      if (primera) {
        primera = false
        m.archivos.set(r, new Uint8Array([9]))
        throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' })
      }
      escribir(r, b)
    }
    expect(m.s.guardar(bytes)).toBe(join(VIDEOS, 'Kirchi', 'Kirchi 2026-10-24 15.42 (2).webm'))
  })
})

describe('guardar por contenedor', () => {
  it('un MP4 se guarda con extensión .mp4', () => {
    const { s } = montar()
    expect(s.guardar(bytes, 'Divisor', 'mp4')).toBe(join(VIDEOS, 'Kirchi', 'Divisor 2026-10-24 15.42.mp4'))
  })
})

describe('renombrar', () => {
  it('mueve lo guardado a la ruta que dio el diálogo', async () => {
    const destino = join('D:', 'Clases', 'mi video.webm')
    const { s, archivos } = montar({ dialogo: destino })
    const ruta = s.guardar(bytes, 'A')
    expect(await s.renombrar(ruta)).toBe(destino)
    expect(archivos.has(ruta)).toBe(false)
    expect(archivos.get(destino)).toBe(bytes)
    // Sigue siendo suya: se puede volver a renombrar.
    expect(await s.renombrar(destino)).toBe(destino)
  })
  it('añade la extensión si el diálogo no la trae', async () => {
    const { s } = montar({ dialogo: join('D:', 'x', 'video') })
    expect(await s.renombrar(s.guardar(bytes))).toBe(join('D:', 'x', 'video.webm'))
  })
  it('conserva el contenedor del archivo guardado al renombrar: una extensión de video distinta se reemplaza, no se apila', async () => {
    const { s } = montar({ dialogo: join('D:', 'x', 'video.webm') })
    expect(await s.renombrar(s.guardar(bytes, 'A', 'mp4'))).toBe(join('D:', 'x', 'video.mp4'))
  })
  it('si se cancela no mueve nada', async () => {
    const { s, archivos } = montar({ dialogo: null })
    const ruta = s.guardar(bytes)
    expect(await s.renombrar(ruta)).toBeNull()
    expect(archivos.has(ruta)).toBe(true)
  })
  it('no pisa un archivo que ya existe en el destino', async () => {
    const destino = join('D:', 'x', 'v.webm')
    const { s, archivos } = montar({ dialogo: destino, existentes: [destino] })
    expect(await s.renombrar(s.guardar(bytes))).toBe(join('D:', 'x', 'v (2).webm'))
    expect(archivos.get(destino)).toEqual(new Uint8Array([1]))
  })
  it('rechaza rutas que el servicio no guardó en esta sesión', async () => {
    const ajena = join(VIDEOS, 'Kirchi', 'otra.webm')
    const { s } = montar({ dialogo: join('D:', 'x.webm'), existentes: [ajena] })
    await expect(s.renombrar(ajena)).rejects.toThrow()
    await expect(s.renombrar(join('C:', 'Windows', 'system.ini'))).rejects.toThrow()
  })
})

describe('depsReales', () => {
  it('arma las dependencias con la hora del sistema por omisión', () => {
    const d = depsReales({ videos: () => 'x', carpetaConfigurada: () => undefined, dialogoGuardarComo: async () => null })
    expect(d.ahora()).toBeInstanceOf(Date)
    expect(d.existe(join('no', 'existe', 'jamas'))).toBe(false)
    expect(d.esCarpeta(join('no', 'existe', 'jamas'))).toBe(false)
  })
})
