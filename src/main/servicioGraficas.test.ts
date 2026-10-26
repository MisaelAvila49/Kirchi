import { describe, expect, it } from 'vitest'
import { CANALES_GRAFICAS } from '../compartido/graficas'
import { ServicioGraficas, tituloDeGraficas, type VentanaGraficas } from './servicioGraficas'

const mapeado = () => ({
  tipo: 'tran', ejeNombre: 'Tiempo', ejeUnidad: 's', logX: false, avisos: [],
  corridas: [{ etiqueta: '', eje: Float64Array.from([0, 1]), series: [{ id: 'v:1', etiqueta: 'V(a)', unidad: 'V', magnitud: 'V', valores: Float64Array.from([0, 1]) }] }]
})
const datos = (archivo = 'rc.kir') => ({
  corridas: [{ n: 1, nombre: 'T', analisis: { id: 'a1', nombre: 'T', config: { tipo: 'tran', fin: 1 } }, mapeado: mapeado() }],
  elegida: 1, tema: 'claro', archivo
})

type Falsa = VentanaGraficas & { mensajes: [string, unknown[]][]; titulo: string; enfocada: number; cerrada: boolean }

function entorno() {
  const creadas: Falsa[] = []
  const alPadre: [number, string, unknown][] = []
  const servicio = new ServicioGraficas({
    crear: () => {
      let alCerrar: () => void = () => {}
      const v: Falsa = {
        id: 100 + creadas.length,
        mensajes: [],
        titulo: '',
        enfocada: 0,
        cerrada: false,
        isDestroyed: () => v.cerrada,
        focus: () => void v.enfocada++,
        enviar: (c, ...a) => void v.mensajes.push([c, a]),
        ponerTitulo: (t) => void (v.titulo = t),
        alCerrarse: (f) => void (alCerrar = f),
        cerrar: () => {
          v.cerrada = true
          alCerrar()
        }
      }
      creadas.push(v)
      return v
    },
    alPadre: (p, c, m) => void alPadre.push([p, c, m])
  })
  return { servicio, creadas, alPadre }
}

describe('ventana de gráficas: traspaso de estado', () => {
  it('abrir crea una ventana con el título del documento y le guarda los datos', () => {
    const { servicio, creadas } = entorno()
    expect(servicio.abrir(1, datos())).toBe(true)
    expect(creadas).toHaveLength(1)
    expect(creadas[0].titulo).toBe('Gráficas de rc · Kirchi')
    expect(servicio.pedir(creadas[0].id)?.corridas[0].nombre).toBe('T')
  })

  it('abrir otra vez desde el mismo editor no crea otra ventana: manda los datos nuevos y la enfoca', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    servicio.abrir(1, datos('otro.kir'))
    expect(creadas).toHaveLength(1)
    expect(creadas[0].mensajes[0][0]).toBe(CANALES_GRAFICAS.datos)
    expect(creadas[0].enfocada).toBe(1)
    expect(servicio.pedir(creadas[0].id)?.archivo).toBe('otro.kir')
  })

  it('causa raíz: abrir con la ventana cerrada la crea de nuevo y enfoca, así que un efecto que "mande los datos" la reabre solo', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    creadas[0].cerrar()
    expect(servicio.abrir(1, datos())).toBe(true)
    expect(creadas).toHaveLength(2)
  })

  it('actualizar no crea ventana: sin ventana (nunca abierta o ya cerrada) dice que no y no abre nada', () => {
    const { servicio, creadas } = entorno()
    expect(servicio.actualizar(1, datos())).toBe(false)
    servicio.abrir(1, datos())
    creadas[0].cerrar()
    expect(servicio.actualizar(1, datos())).toBe(false)
    expect(creadas).toHaveLength(1)
    expect(servicio.abiertas).toBe(0)
  })

  it('actualizar manda los datos y el título a la ventana abierta sin enfocarla (el foco se queda donde el usuario lo puso)', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    const antes = creadas[0].enfocada
    expect(servicio.actualizar(1, datos('otro.kir'))).toBe(true)
    expect(creadas).toHaveLength(1)
    expect(creadas[0].enfocada).toBe(antes)
    expect(creadas[0].titulo).toBe('Gráficas de otro · Kirchi')
    expect(creadas[0].mensajes.at(-1)?.[0]).toBe(CANALES_GRAFICAS.datos)
    expect(servicio.pedir(creadas[0].id)?.archivo).toBe('otro.kir')
  })

  it('actualizar con datos inválidos no toca nada', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    expect(servicio.actualizar(1, { corridas: 3 })).toBe(false)
    expect(creadas[0].mensajes).toHaveLength(0)
  })

  it('cada editor tiene su ventana y cada una solo ve sus datos', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos('a.kir'))
    servicio.abrir(2, datos('b.kir'))
    expect(creadas).toHaveLength(2)
    expect(servicio.pedir(creadas[0].id)?.archivo).toBe('a.kir')
    expect(servicio.pedir(creadas[1].id)?.archivo).toBe('b.kir')
  })

  it('una página que no es una ventana de gráficas no recibe datos', () => {
    const { servicio } = entorno()
    servicio.abrir(1, datos())
    expect(servicio.pedir(1)).toBeNull()
    expect(servicio.pedir(999)).toBeNull()
  })

  it('datos inválidos no abren nada', () => {
    const { servicio, creadas } = entorno()
    expect(servicio.abrir(1, { corridas: 3 })).toBe(false)
    expect(servicio.abrir(1, null)).toBe(false)
    expect(creadas).toHaveLength(0)
  })

  it('al cerrar la ventana se olvidan los datos y se puede abrir otra', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    creadas[0].cerrar()
    expect(servicio.pedir(creadas[0].id)).toBeNull()
    servicio.abrir(1, datos())
    expect(creadas).toHaveLength(2)
  })

  it('exportar desde la ventana de gráficas llega al editor que la abrió, y solo desde ella', () => {
    const { servicio, creadas, alPadre } = entorno()
    servicio.abrir(7, datos())
    expect(servicio.exportar(creadas[0].id, { n: 1, ocultas: ['V(a)'] })).toBe(true)
    expect(alPadre).toEqual([[7, CANALES_GRAFICAS.alExportar, { n: 1, ocultas: ['V(a)'] }]])
    expect(servicio.exportar(55, { n: 1, ocultas: [] })).toBe(false)
    expect(servicio.exportar(creadas[0].id, 'x')).toBe(false)
    expect(alPadre).toHaveLength(1)
  })

  it('cerrar el editor cierra su ventana de gráficas', () => {
    const { servicio, creadas } = entorno()
    servicio.abrir(1, datos())
    servicio.cerrarDePadre(1)
    expect(creadas[0].cerrada).toBe(true)
    expect(servicio.abiertas).toBe(0)
  })

  it('el título sin archivo es genérico', () => {
    expect(tituloDeGraficas('')).toBe('Gráficas · Kirchi')
  })
})

describe('ventana de gráficas: acoplar', () => {
  it('cierra la ventana y le dice al editor qué corrida se veía', () => {
    const { servicio, creadas, alPadre } = entorno()
    servicio.abrir(1, datos())
    expect(servicio.acoplar(creadas[0].id, { n: 1, extra: 'x' })).toBe(true)
    expect(creadas[0].cerrada).toBe(true)
    expect(alPadre).toEqual([[1, CANALES_GRAFICAS.alAcoplar, { n: 1 }]])
    expect(servicio.abiertas).toBe(0)
  })

  it('un pedido inválido o de una ventana desconocida no hace nada', () => {
    const { servicio, creadas, alPadre } = entorno()
    servicio.abrir(1, datos())
    expect(servicio.acoplar(creadas[0].id, { n: 'uno' })).toBe(false)
    expect(servicio.acoplar(creadas[0].id, null)).toBe(false)
    expect(servicio.acoplar(999, { n: 1 })).toBe(false)
    expect(creadas[0].cerrada).toBe(false)
    expect(alPadre).toEqual([])
  })
})
