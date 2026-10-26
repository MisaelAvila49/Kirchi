import { describe, expect, it } from 'vitest'
import { CANALES_OSC, fusionarDatosOsc, type DatosOsc, type PantallaOsc } from '../compartido/ventanaOsc'
import { ServicioOsc, tituloDeOsc } from './servicioOsc'
import type { VentanaGraficas } from './servicioGraficas'

const pantalla = (version: number): PantallaOsc => ({
  version, t0: 0, dt: 1e-5, ncol: 2, tDisparo: 0, estado: 'disparado', tCaptura: 0.01, csv: { t0: 0, dt: 1e-5, n: 2 },
  completoHasta: [0, 0, 0, 0, 0], medidas: [[], [], [], [], []], columnas: new Float32Array(50), muestras: new Float32Array(10)
})
const datos = (o: Partial<DatosOsc> = {}): DatosOsc => ({
  tema: 'claro', osciloscopios: [{ id: 'p1', ref: 'OSC1' }], elegido: 'p1', ajustes: { base: 1e-3 }, aspecto: null, aspectoCanales: {},
  fase: 'corriendo', teclaSimular: null, estadoDisparo: 'Disparado', fuentes: {}, aviso: null, notaAjuste: null, cursores: null, capturada: false,
  pantalla: pantalla(1), congelada: null, ...o
})

type Falsa = VentanaGraficas & { mensajes: [string, unknown[]][]; titulo: string; enfocada: number; cerrada: boolean }

function entorno() {
  const creadas: Falsa[] = []
  const alPadre: [number, string, unknown][] = []
  const enfocados: number[] = []
  const servicio = new ServicioOsc({
    crear: () => {
      let alCerrar: () => void = () => {}
      const v: Falsa = {
        id: 200 + creadas.length, mensajes: [], titulo: '', enfocada: 0, cerrada: false,
        isDestroyed: () => v.cerrada, focus: () => void v.enfocada++, enviar: (c, ...a) => void v.mensajes.push([c, a]),
        ponerTitulo: (t) => void (v.titulo = t), alCerrarse: (f) => void (alCerrar = f),
        cerrar: () => { v.cerrada = true; alCerrar() }
      }
      creadas.push(v)
      return v
    },
    alPadre: (p, c, m) => void alPadre.push([p, c, m]),
    enfocarPadre: (p) => void enfocados.push(p)
  })
  return { servicio, creadas, alPadre, enfocados }
}

describe('ventana del osciloscopio: traspaso de estado', () => {
  it('abrir crea la ventana con el nombre del osciloscopio y le guarda los datos completos', () => {
    const { servicio, creadas } = entorno()
    expect(servicio.abrir(1, datos())).toBe(true)
    expect(creadas).toHaveLength(1)
    expect(creadas[0].titulo).toBe(tituloDeOsc('OSC1'))
    expect(servicio.pedir(creadas[0].id)!.pantalla!.version).toBe(1)
    expect(servicio.pedir(999)).toBeNull()
  })

  it('abrir acepta la pantalla de «esperando disparo» (NaN en el origen del tiempo) y la ventana se crea', () => {
    const { servicio, creadas } = entorno()
    const espera: PantallaOsc = { ...pantalla(1), t0: Number.NaN, tDisparo: Number.NaN, ncol: 0, csv: { t0: Number.NaN, dt: 0, n: 0 }, estado: 'esperando' }
    expect(servicio.abrir(1, datos({ pantalla: espera }))).toBe(true)
    expect(creadas).toHaveLength(1)
    expect(servicio.abrir(1, datos({ pantalla: { ...espera, t0: Number.POSITIVE_INFINITY } }))).toBe(false)
  })

  it('abrir con la ventana abierta la enfoca y le manda lo nuevo sin crear otra', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    servicio.abrir(1, datos({ pantalla: pantalla(2) }))
    expect(creadas).toHaveLength(1)
    expect(creadas[0].enfocada).toBe(1)
    expect(creadas[0].mensajes.at(-1)![0]).toBe(CANALES_OSC.datos)
  })

  it('actualizar solo manda si hay ventana: ni la crea ni la enfoca', () => {
    const { servicio, creadas } = entorno()
    expect(servicio.actualizar(1, datos())).toBe('sin-ventana')
    expect(creadas).toHaveLength(0)
    servicio.abrir(1, datos())
    expect(servicio.actualizar(1, datos({ pantalla: pantalla(5) }))).toBe('ok')
    expect(creadas[0].enfocada).toBe(0)
  })

  it('datos que no valen con la ventana viva dan invalido, no sin-ventana', () => {
    const { servicio } = entorno()
    servicio.abrir(1, datos())
    const cinco = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, ref: 'OSC' + i }))
    expect(servicio.actualizar(1, datos({ osciloscopios: cinco }))).toBe('invalido')
  })

  it('un envío sin pantalla conserva la última que ya tenía la ventana', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos({ pantalla: pantalla(7) }))
    const { pantalla: _p, ...sinPantalla } = datos({ aviso: 'La base pide un paso más corto.' })
    expect(servicio.actualizar(1, sinPantalla)).toBe('ok')
    const completo = servicio.pedir(creadas[0].id)!
    expect(completo.pantalla!.version).toBe(7)
    expect(completo.aviso).toBe('La base pide un paso más corto.')
    // Y a la ventana viva solo viaja el cambio.
    const enviado = creadas[0].mensajes.at(-1)![1][0] as DatosOsc
    expect('pantalla' in enviado).toBe(false)
  })

  it('al reanudar (congelada null) la congelada anterior se olvida', () => {
    const antes = datos({ congelada: { pantalla: pantalla(3), ajustes: { base: 1e-3 } } })
    expect(fusionarDatosOsc(antes, datos({ congelada: null })).congelada).toBeNull()
    const { congelada: _c, ...sin } = datos()
    expect(fusionarDatosOsc(antes, sin as DatosOsc).congelada).toEqual(antes.congelada)
  })

  it('datos inválidos no crean ventana ni se guardan', () => {
    const { servicio, creadas } = entorno()
    expect(servicio.abrir(1, { tema: 'claro' })).toBe(false)
    expect(creadas).toHaveLength(0)
  })

  it('una orden de la ventana va al editor que la abrió, ya revisada', () => {
    const { servicio, creadas, alPadre, enfocados } = entorno()
    servicio.abrir(7, datos())
    const hija = creadas[0].id
    expect(servicio.comando(hija, { tipo: 'pausar', basura: 1 })).toBe(true)
    expect(alPadre.at(-1)).toEqual([7, CANALES_OSC.alComando, { tipo: 'pausar' }])
    expect(servicio.comando(hija, { tipo: 'borrar' })).toBe(false)
    expect(servicio.comando(12345, { tipo: 'pausar' })).toBe(false)
    expect(enfocados).toEqual([])
    servicio.comando(hija, { tipo: 'exportar' })
    expect(enfocados).toEqual([7])
  })

  it('acoplar cierra la ventana, avisa al editor y lo trae al frente', () => {
    const { servicio, creadas, alPadre, enfocados } = entorno()
    servicio.abrir(3, datos())
    expect(servicio.acoplar(creadas[0].id)).toBe(true)
    expect(creadas[0].cerrada).toBe(true)
    const canales = alPadre.map((a) => a[1])
    expect(canales[0]).toBe(CANALES_OSC.alAcoplar)
    expect(canales).toContain(CANALES_OSC.alCerrar)
    expect(enfocados).toEqual([3])
    expect(servicio.abiertas).toBe(0)
    expect(servicio.pedir(creadas[0].id)).toBeNull()
  })

  it('cerrarla con su botón también avisa al editor, y abrir de nuevo crea otra', () => {
    const { servicio, creadas, alPadre } = entorno()
    servicio.abrir(3, datos())
    creadas[0].cerrar()
    expect(alPadre.filter((a) => a[1] === CANALES_OSC.alCerrar)).toHaveLength(1)
    expect(servicio.actualizar(3, datos())).toBe('sin-ventana')
    servicio.abrir(3, datos())
    expect(creadas).toHaveLength(2)
  })

  it('al cerrarse el editor su ventana se cierra sin avisarle', () => {
    const { servicio, creadas, alPadre } = entorno()
    servicio.abrir(4, datos())
    servicio.cerrarDePadre(4)
    expect(creadas[0].cerrada).toBe(true)
    expect(alPadre).toEqual([])
  })
})

describe('ventana del osciloscopio: cerrarla desde el editor', () => {
  it('el editor la cierra con «Acoplar» de la franja y el aviso de cierre le llega una vez', () => {
    const { servicio, creadas, alPadre } = entorno()
    expect(servicio.cerrarAPedido(5)).toBe(false)
    servicio.abrir(5, datos())
    expect(servicio.cerrarAPedido(5)).toBe(true)
    expect(creadas[0].cerrada).toBe(true)
    expect(alPadre.filter((a) => a[1] === CANALES_OSC.alCerrar)).toHaveLength(1)
    expect(alPadre.filter((a) => a[1] === CANALES_OSC.alAcoplar)).toHaveLength(0)
  })
})
