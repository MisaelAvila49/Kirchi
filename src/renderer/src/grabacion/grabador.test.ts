import { describe, expect, it } from 'vitest'
import type { OpcionesGrabacion } from '../../../compartido/ajustes'
import { AVISO_MINIMIZADA, bitrateVideo, contenedorDe, crearGrabador, elegirMime, type DepsGrabador, type FlujoLike, type GrabadoraLike, type OpcionesGrabadora } from './grabador'

const OPC: OpcionesGrabacion = { que: 'ventana', calidad: '1080p', microfono: null, resaltarClics: false }

function flujo(video = 1, audio = 0): FlujoLike & { paradas: number } {
  const f = { paradas: 0 } as FlujoLike & { paradas: number }
  const pista = () => ({ stop: () => void f.paradas++, onended: null as (() => void) | null })
  const v = Array.from({ length: video }, pista)
  const a = Array.from({ length: audio }, pista)
  f.getVideoTracks = () => v
  f.getAudioTracks = () => a
  f.getTracks = () => [...v, ...a]
  return f
}

function montar(sobre: Partial<DepsGrabador> & { tam?: [number, number]; vp9?: boolean; mp4?: boolean } = {}) {
  let t = 0
  const reg = {
    pedidos: [] as OpcionesGrabacion[],
    guardados: [] as { bytes: Uint8Array; duracionMs: number; nombreCircuito: string; contenedor?: 'mp4' | 'webm' }[],
    grabadoras: [] as { o: OpcionesGrabadora; flujo: FlujoLike; g: FakeGrabadora }[],
    getUser: [] as unknown[],
    lienzos: [] as [number, number][],
    resalte: null as null | (() => boolean),
    avisos: [] as string[],
    terminados: [] as unknown[]
  }
  class FakeGrabadora implements GrabadoraLike {
    ondataavailable: ((e: { data: Blob }) => void) | null = null
    onstop: (() => void) | null = null
    onerror: ((e: unknown) => void) | null = null
    llamadas: string[] = []
    start() {
      this.llamadas.push('start')
    }
    pause() {
      this.llamadas.push('pause')
    }
    resume() {
      this.llamadas.push('resume')
    }
    stop() {
      this.llamadas.push('stop')
      this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])]) })
      this.onstop?.()
    }
  }
  let alMin: (m: boolean) => void = () => {}
  const [w, h] = sobre.tam ?? [2560, 1440]
  const pantalla = flujo()
  const dep: DepsGrabador = {
    api: () => ({
      pedir: async (o) => (reg.pedidos.push(o), { ok: true }),
      guardar: async (d) => (reg.guardados.push(d), { ruta: 'C:/v/a.webm', nombre: 'a.webm' }),
      renombrar: async () => null,
      abrirCarpeta: async () => {},
      cambiarCarpeta: async () => null,
      restablecerCarpeta: async () => {},
      alMinimizar: (f) => ((alMin = f), () => {})
    }),
    getDisplayMedia: async () => pantalla,
    getUserMedia: async (c) => (reg.getUser.push(c), flujo(0, 1)),
    abrirVideo: async () => ({ ancho: w, alto: h, fuente: {}, quitar() {} }),
    combinar: (v, a) => ({ ...v, getAudioTracks: () => a?.getAudioTracks() ?? [], getVideoTracks: () => v.getVideoTracks() }),
    tipoSoportado: (m) => (sobre.mp4 === true && m.startsWith('video/mp4')) || ((sobre.vp9 ?? true) && m.includes('vp9')),
    crearGrabadora: (f, o) => {
      const g = new FakeGrabadora()
      reg.grabadoras.push({ o, flujo: f, g })
      return g
    },
    crearLienzo: (a, b) => (reg.lienzos.push([a, b]), { width: a, height: b, getContext: () => ({ drawImage() {} }), captureStream: () => ({ getVideoTracks: () => [] }) }),
    flujoDeLienzo: () => flujo(),
    cada: () => 1,
    dejarDe: () => {},
    medidas: (v) => ({ videoAncho: v.ancho, videoAlto: v.alto, interiorAncho: v.ancho, interiorAlto: v.alto, exteriorAncho: v.ancho, exteriorAlto: v.alto }),
    ahora: () => t,
    resaltarClics: (activo) => ((reg.resalte = activo), () => {}),
    ...sobre
  }
  const g = crearGrabador(dep)
  const ctx = { nombreCircuito: 'Divisor', rectLienzo: () => ({ x: 100, y: 50, ancho: 800, alto: 600 }), alAviso: (m: string) => void reg.avisos.push(m), alTerminar: (r: unknown) => void reg.terminados.push(r) }
  return { g, reg, ctx, avanzar: (ms: number) => (t += ms), minimizar: (m: boolean) => alMin(m), pantalla }
}

describe('elegirMime', () => {
  it('MP4 primero si se puede, con AAC si hay voz', () => {
    expect(elegirMime(() => true, false)).toBe('video/mp4;codecs=avc1.42E01E')
    expect(elegirMime(() => true, true)).toBe('video/mp4;codecs=avc1.42E01E,mp4a.40.2')
    expect(contenedorDe('video/mp4;codecs=avc1.42E01E')).toBe('mp4')
    expect(contenedorDe('video/webm;codecs=vp9')).toBe('webm')
  })
  it('VP9 con Opus si se puede, si no VP8', () => {
    expect(elegirMime((m) => m === 'video/webm;codecs=vp9,opus', true)).toBe('video/webm;codecs=vp9,opus')
    expect(elegirMime(() => false, true)).toBe('video/webm;codecs=vp8,opus')
    expect(elegirMime((m) => m === 'video/webm;codecs=vp9', false)).toBe('video/webm;codecs=vp9')
    expect(elegirMime(() => false, false)).toBe('video/webm;codecs=vp8')
  })
  it('la tasa de bits queda entre 1 y 8 Mbit/s', () => {
    expect(bitrateVideo(100, 100)).toBe(1_000_000)
    expect(bitrateVideo(3840, 2160)).toBe(8_000_000)
  })
})

describe('grabador', () => {
  it('ventana a tamaño real: usa la pista de la ventana tal cual, VP9, sin lienzo ni micrófono', async () => {
    const m = montar({ tam: [1280, 720] })
    expect(await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)).toEqual({ ok: true })
    expect(m.reg.pedidos).toHaveLength(1)
    expect(m.reg.lienzos).toEqual([])
    expect(m.reg.getUser).toEqual([])
    expect(m.reg.grabadoras[0].flujo.getVideoTracks()).toBe(m.reg.grabadoras[0].flujo.getVideoTracks())
    expect(m.reg.grabadoras[0].o.mimeType).toBe('video/webm;codecs=vp9')
    expect(m.g.estado()).toBe('grabando')
  })
  it('con MP4 soportado graba MP4 y lo guarda con ese contenedor', async () => {
    const m = montar({ mp4: true, tam: [1280, 720] })
    await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)
    expect(m.reg.grabadoras[0].o.mimeType).toBe('video/mp4;codecs=avc1.42E01E')
    await m.g.detener()
    expect(m.reg.guardados[0]).toMatchObject({ contenedor: 'mp4' })
  })
  it('con VP9 no soportado cae a VP8', async () => {
    const m = montar({ vp9: false, tam: [1280, 720] })
    await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)
    expect(m.reg.grabadoras[0].o.mimeType).toBe('video/webm;codecs=vp8')
  })
  it('ventana a 720p desde 2560x1440: pasa por un lienzo de 1280x720', async () => {
    const m = montar()
    await m.g.empezar({ ...OPC, calidad: '720p' }, m.ctx)
    expect(m.reg.lienzos).toEqual([[1280, 720]])
  })
  it('1080p nunca supera el tamaño real', async () => {
    const m = montar({ tam: [1366, 768] })
    await m.g.empezar(OPC, m.ctx)
    expect(m.reg.lienzos).toEqual([])
  })
  it('solo el lienzo: recorta al rectángulo del lienzo en un lienzo intermedio', async () => {
    const m = montar({ tam: [1920, 1080] })
    await m.g.empezar({ ...OPC, que: 'lienzo', calidad: 'real' }, m.ctx)
    expect(m.reg.lienzos).toEqual([[800, 600]])
  })
  it('con micrófono pide solo audio con ese dispositivo y graba con Opus', async () => {
    const m = montar({ tam: [1280, 720] })
    await m.g.empezar({ ...OPC, calidad: 'real', microfono: 'mic-1' }, m.ctx)
    expect(m.reg.getUser).toEqual([{ audio: { deviceId: { exact: 'mic-1' } } }])
    expect(m.reg.grabadoras[0].o.mimeType).toBe('video/webm;codecs=vp9,opus')
    expect(m.reg.grabadoras[0].flujo.getAudioTracks()).toHaveLength(1)
    expect(m.reg.grabadoras[0].o.audioBitsPerSecond).toBeGreaterThan(0)
  })
  it('si el permiso se niega devuelve el error y queda inactivo', async () => {
    const m = montar({ api: () => ({ pedir: async () => ({ ok: false, error: 'No' }) }) as never })
    expect(await m.g.empezar(OPC, m.ctx)).toEqual({ error: 'No' })
    expect(m.g.estado()).toBe('inactivo')
  })
  it('si falla el micrófono suelta la pantalla y devuelve error', async () => {
    const m = montar({
      getUserMedia: async () => {
        throw new Error('Sin micrófono')
      }
    })
    expect(await m.g.empezar({ ...OPC, microfono: 'x' }, m.ctx)).toEqual({ error: 'Sin micrófono' })
    expect(m.pantalla.paradas).toBe(1)
    expect(m.g.estado()).toBe('inactivo')
  })
  it('si el micrófono guardado ya no está, se graba sin micrófono y se avisa', async () => {
    for (const nombre of ['OverconstrainedError', 'NotFoundError']) {
      const m = montar({
        tam: [1280, 720],
        getUserMedia: async () => {
          throw Object.assign(new Error('no'), { name: nombre })
        }
      })
      expect(await m.g.empezar({ ...OPC, calidad: 'real', microfono: 'viejo' }, m.ctx)).toEqual({ ok: true })
      expect(m.reg.avisos).toEqual(['El micrófono guardado no está conectado: se graba sin micrófono.'])
      expect(m.reg.grabadoras[0].flujo.getAudioTracks()).toHaveLength(0)
      expect(m.reg.grabadoras[0].o.audioBitsPerSecond).toBeUndefined()
    }
  })
  it('máquina de estados: pausar y continuar; la duración no cuenta la pausa', async () => {
    const m = montar({ tam: [1280, 720] })
    await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)
    m.avanzar(3000)
    m.g.pausar()
    expect(m.g.estado()).toBe('pausada')
    m.avanzar(10_000)
    expect(m.g.transcurridoMs()).toBe(3000)
    m.g.continuar()
    expect(m.g.estado()).toBe('grabando')
    m.avanzar(2000)
    const r = await m.g.detener()
    expect(r).toEqual({ ruta: 'C:/v/a.webm', nombre: 'a.webm' })
    expect(m.reg.guardados[0].duracionMs).toBe(5000)
    expect(m.reg.guardados[0].nombreCircuito).toBe('Divisor')
    expect(Array.from(m.reg.guardados[0].bytes)).toEqual([1, 2, 3, 4])
    expect(m.g.estado()).toBe('inactivo')
    expect(m.reg.terminados).toEqual([r])
    expect(m.reg.grabadoras[0].g.llamadas).toEqual(['start', 'pause', 'resume', 'stop'])
  })
  it('detener estando en pausa cuenta solo lo grabado', async () => {
    const m = montar({ tam: [1280, 720] })
    await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)
    m.avanzar(1500)
    m.g.pausar()
    m.avanzar(9000)
    await m.g.detener()
    expect(m.reg.guardados[0].duracionMs).toBe(1500)
  })
  it('al minimizar Kirchi se pausa y avisa al Registro', async () => {
    const m = montar({ tam: [1280, 720] })
    await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)
    m.minimizar(true)
    expect(m.g.estado()).toBe('pausada')
    expect(m.reg.avisos).toEqual([AVISO_MINIMIZADA])
    m.minimizar(false)
    expect(m.g.estado()).toBe('pausada')
  })
  it('el resalte de clics solo se activa si se pidió y solo dibuja grabando', async () => {
    const sin = montar({ tam: [1280, 720] })
    await sin.g.empezar({ ...OPC, calidad: 'real' }, sin.ctx)
    expect(sin.reg.resalte).toBeNull()
    const con = montar({ tam: [1280, 720] })
    await con.g.empezar({ ...OPC, calidad: 'real', resaltarClics: true }, con.ctx)
    expect(con.reg.resalte!()).toBe(true)
    con.g.pausar()
    expect(con.reg.resalte!()).toBe(false)
  })
  it('no empieza una segunda grabación ni detiene sin haber empezado', async () => {
    const m = montar({ tam: [1280, 720] })
    expect(await m.g.detener()).toEqual({ error: 'No hay una grabación en curso.' })
    await m.g.empezar({ ...OPC, calidad: 'real' }, m.ctx)
    expect(await m.g.empezar(OPC, m.ctx)).toEqual({ error: 'Ya hay una grabación en curso.' })
  })
})
