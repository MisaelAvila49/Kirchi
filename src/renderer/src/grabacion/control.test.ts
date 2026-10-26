import { describe, expect, it, vi } from 'vitest'
import { grabacionPorOmision, type OpcionesGrabacion } from '../../../compartido/ajustes'
import type { ApiGrabacion } from '../../../compartido/grabacion'
import { AVISO_SIN_GRABACION, crearControlGrabacion } from './control'
import type { ContextoGrabacion, FaseGrabador, ResultadoDetener } from './grabador'

function montar(extra: { fase?: FaseGrabador; empezar?: { error: string } | { ok: true }; guardado?: ResultadoDetener; carpeta?: string; sinApi?: boolean } = {}) {
  let fase: FaseGrabador = extra.fase ?? 'inactivo'
  let ctx: ContextoGrabacion | null = null
  const llamadas: { opciones: OpcionesGrabacion; ctx: ContextoGrabacion }[] = []
  const registro: [string, string][] = []
  const api = {
    abrirCarpeta: vi.fn(async () => {}),
    renombrar: vi.fn(async (r: string) => r.replace('a.webm', 'clase.webm'))
  }
  const grabador = {
    estado: () => fase,
    empezar: vi.fn(async (opciones: OpcionesGrabacion, c: ContextoGrabacion) => {
      ctx = c
      llamadas.push({ opciones, ctx: c })
      if (extra.empezar && 'error' in extra.empezar) return extra.empezar
      fase = 'grabando'
      return { ok: true as const }
    }),
    pausar: vi.fn(() => void (fase = 'pausada')),
    continuar: vi.fn(() => void (fase = 'grabando')),
    detener: vi.fn(async () => {
      const r = extra.guardado ?? { ruta: 'C:\\Videos\\Kirchi\\a.webm', nombre: 'a.webm' }
      fase = 'inactivo'
      ctx?.alTerminar?.(r)
      return r
    })
  }
  const control = crearControlGrabacion({
    grabador,
    api: () => (extra.sinApi ? undefined : (api as unknown as ApiGrabacion)),
    opciones: () => ({ ...grabacionPorOmision(), calidad: '720p' }),
    nombreCircuito: () => 'divisor',
    rectLienzo: () => ({ x: 1, y: 2, ancho: 3, alto: 4 }),
    carpeta: () => extra.carpeta,
    registrar: (t, tipo) => registro.push([tipo, t])
  })
  return { control, grabador, api, registro, llamadas, ctx: () => ctx }
}

describe('el control de la grabación', () => {
  it('empieza con las opciones guardadas y el nombre y el lienzo del circuito', async () => {
    const m = montar()
    expect(await m.control.empezar()).toBe(true)
    const { opciones, ctx } = m.llamadas[0]
    expect(opciones.calidad).toBe('720p')
    expect(ctx.nombreCircuito).toBe('divisor')
    expect(ctx.rectLienzo()).toEqual({ x: 1, y: 2, ancho: 3, alto: 4 })
    expect(m.control.aviso()).toBeNull()
  })

  it('sin nombre de circuito usa «Kirchi»', async () => {
    const m = montar()
    const c = crearControlGrabacion({ grabador: m.grabador, api: () => m.api as unknown as ApiGrabacion, opciones: grabacionPorOmision, nombreCircuito: () => '', rectLienzo: () => null, carpeta: () => undefined, registrar: () => {} })
    await c.empezar()
    expect(m.llamadas[0].ctx.nombreCircuito).toBe('Kirchi')
  })

  it('al detener muestra «Grabación guardada en Videos › Kirchi» con la ruta para abrir la carpeta y cambiar el nombre', async () => {
    const m = montar()
    await m.control.empezar()
    await m.control.detener()
    expect(m.control.aviso()).toEqual({ tipo: 'guardada', texto: 'Grabación guardada en Videos › Kirchi', ruta: 'C:\\Videos\\Kirchi\\a.webm', nombre: 'a.webm' })
    expect(m.registro.at(-1)).toEqual(['aviso', 'Grabación guardada en Videos › Kirchi: a.webm.'])
    await m.control.abrirCarpeta()
    expect(m.api.abrirCarpeta).toHaveBeenCalledTimes(1)
    await m.control.cambiarNombre()
    expect(m.api.renombrar).toHaveBeenCalledWith('C:\\Videos\\Kirchi\\a.webm')
    expect(m.control.aviso()).toMatchObject({ tipo: 'guardada', ruta: 'C:\\Videos\\Kirchi\\clase.webm', nombre: 'clase.webm' })
    m.control.cerrarAviso()
    expect(m.control.aviso()).toBeNull()
  })

  it('con otra carpeta elegida el aviso dice cuál', async () => {
    const m = montar({ carpeta: 'D:\\Clases' })
    await m.control.empezar()
    await m.control.detener()
    expect(m.control.aviso()).toMatchObject({ texto: 'Grabación guardada en Clases' })
  })

  it('si la barra de estado detiene la grabación, el aviso sale igual', async () => {
    const m = montar()
    await m.control.empezar()
    m.ctx()!.alTerminar!({ ruta: '/v/b.webm', nombre: 'b.webm' })
    expect(m.control.aviso()).toMatchObject({ tipo: 'guardada', nombre: 'b.webm' })
  })

  it('un error al guardar va al Registro y se ve como aviso de error, sin botones de carpeta', async () => {
    const m = montar({ guardado: { error: 'No se pudo guardar la grabación.' } })
    await m.control.empezar()
    await m.control.detener()
    expect(m.control.aviso()).toEqual({ tipo: 'error', texto: 'No se pudo guardar la grabación.' })
    expect(m.registro.at(-1)).toEqual(['error', 'No se pudo guardar la grabación.'])
    await m.control.cambiarNombre()
    expect(m.api.renombrar).not.toHaveBeenCalled()
  })

  it('un error al empezar (el permiso de macOS, por ejemplo) va al Registro y al aviso', async () => {
    const texto = 'Kirchi necesita el permiso de grabación de pantalla en Ajustes del Sistema.'
    const m = montar({ empezar: { error: texto } })
    expect(await m.control.empezar()).toBe(false)
    expect(m.control.aviso()).toEqual({ tipo: 'error', texto })
    expect(m.registro).toEqual([['error', texto]])
  })

  it('sin la API de grabación (pruebas, navegador) avisa y no llama al grabador', async () => {
    const m = montar({ sinApi: true })
    expect(await m.control.empezar()).toBe(false)
    expect(m.grabador.empezar).not.toHaveBeenCalled()
    expect(m.control.aviso()).toMatchObject({ tipo: 'error' })
  })

  it('los avisos del grabador (minimizada, captura cortada) van al Registro', async () => {
    const m = montar()
    await m.control.empezar()
    m.ctx()!.alAviso!('La grabación se pausó porque Kirchi se minimizó.')
    expect(m.registro).toContainEqual(['aviso', 'La grabación se pausó porque Kirchi se minimizó.'])
  })

  it('detener sin grabación lo dice en el Registro; alternar empieza si no graba y detiene si graba', async () => {
    const m = montar()
    await m.control.detener()
    expect(m.registro.at(-1)).toEqual(['aviso', AVISO_SIN_GRABACION])
    expect(m.grabador.detener).not.toHaveBeenCalled()
    await m.control.alternar()
    expect(m.grabador.empezar).toHaveBeenCalledTimes(1)
    await m.control.alternar()
    expect(m.grabador.detener).toHaveBeenCalledTimes(1)
    expect(m.control.aviso()).toMatchObject({ tipo: 'guardada' })
  })

  it('alternarPausa pausa si graba, continúa si está en pausa y lo anota en el Registro', async () => {
    const m = montar()
    m.control.alternarPausa()
    expect(m.grabador.pausar).not.toHaveBeenCalled()
    await m.control.empezar()
    m.control.alternarPausa()
    expect(m.grabador.pausar).toHaveBeenCalledTimes(1)
    expect(m.registro.at(-1)).toEqual(['aviso', 'Grabación en pausa.'])
    m.control.alternarPausa()
    expect(m.grabador.continuar).toHaveBeenCalledTimes(1)
    expect(m.registro.at(-1)).toEqual(['aviso', 'Grabación reanudada.'])
  })

  it('no empieza otra mientras se prepara o se guarda', async () => {
    const m = montar({ fase: 'guardando' })
    await m.control.alternar()
    expect(m.grabador.empezar).not.toHaveBeenCalled()
  })
})
