// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { LIMITE_COORDENADA } from '../doc/limites'
import type { Documento, Figura } from '../doc/tipos'
import { divisor } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor, MENSAJE_SIMULANDO } from './Editor'
import { seleccionDe } from './seleccion'

const lib = libreriaDePrueba().piezas
/** Un marco a la derecha del divisor (que ocupa de -6 a 18 en x): nada lo toca. */
const MARCO: Figura = { id: 'f_marco', tipo: 'rectangulo', x1: 40, y1: -10, x2: 60, y2: 10, orden: 0 }

function armar(figuras: Record<string, Figura> = { f_marco: MARCO }) {
  const registro: string[] = []
  const ed = new Editor(lib, undefined, idSecuencial(), { registrar: (t) => registro.push(t) })
  ed.tolerancia = 0.5
  const d: Documento = { ...divisor(), figuras }
  ed.cargar(d)
  return { ed, registro }
}
const clic = (ed: Editor, x: number, y: number) => {
  ed.abajo({ x, y })
  ed.arriba({ x, y })
}

describe('editor: figuras', () => {
  it('un clic sobre el contorno elige la figura; por dentro empieza el rectángulo de selección', () => {
    const { ed } = armar()
    clic(ed, 50, -10)
    expect([...ed.seleccion.figuras]).toEqual(['f_marco'])
    ed.abajo({ x: 50, y: 0 })
    expect(ed.estado().rectangulo).not.toBeNull()
    ed.arriba({ x: 50, y: 0 })
    expect(ed.seleccion.figuras.size).toBe(0)
  })

  it('el relleno no hace que el interior se tome: un marco relleno tampoco tapa el lienzo', () => {
    const { ed } = armar({ f_marco: { ...MARCO, relleno: true } })
    ed.abajo({ x: 50, y: 0 })
    expect(ed.estado().rectangulo).not.toBeNull()
    ed.arriba({ x: 50, y: 0 })
  })

  it('arrastrar el contorno la mueve en pasos de rejilla y es un paso de deshacer; las flechas también la mueven', () => {
    const { ed } = armar()
    ed.abajo({ x: 40, y: 0 })
    ed.mover({ x: 44.2, y: 0.9 })
    ed.arriba({ x: 44.2, y: 0.9 })
    expect(ed.doc.figuras?.f_marco).toEqual({ ...MARCO, x1: 44, x2: 64 })
    ed.deshacer()
    expect(ed.doc.figuras?.f_marco).toEqual(MARCO)
    ed.seleccionar(seleccionDe('figuras', 'f_marco'))
    expect(ed.desplazar(2, 0)).toBe(true)
    expect(ed.doc.figuras?.f_marco.x1).toBe(42)
  })

  it('una pieza se coloca encima de una figura sin choque', () => {
    const { ed } = armar()
    ed.empezarColocar('resistencia')
    ed.mover({ x: 50, y: 0 })
    expect(ed.estado().choque).toBeNull()
    ed.abajo({ x: 50, y: 0 })
    expect(Object.values(ed.doc.piezas).some((p) => p.x === 50 && p.y === 0)).toBe(true)
  })

  it('copiar y pegar crea otra figura al frente; duplicar también; Supr y el doble clic derecho la borran', () => {
    const { ed } = armar()
    ed.seleccionar(seleccionDe('figuras', 'f_marco'))
    ed.copiar()
    ed.mover({ x: 100, y: 40 })
    ed.pegar()
    const pegada = Object.values(ed.doc.figuras ?? {}).find((f) => f.id !== 'f_marco')!
    expect(pegada).toMatchObject({ tipo: 'rectangulo', x1: 100, y1: 40, x2: 120, y2: 60, orden: 1 })
    expect([...ed.seleccion.figuras]).toEqual([pegada.id])
    ed.duplicar({ x: 100, y: 80 })
    expect(Object.keys(ed.doc.figuras ?? {})).toHaveLength(3)
    expect(Math.max(...Object.values(ed.doc.figuras ?? {}).map((f) => f.orden))).toBe(2)
    ed.borrar()
    expect(Object.keys(ed.doc.figuras ?? {})).toHaveLength(2)
    ed.dobleClicDerecho({ x: 50, y: 10 })
    expect(ed.doc.figuras?.f_marco).toBeUndefined()
  })

  it('el rectángulo de selección toma la figura entera dentro, y Seleccionar todo también', () => {
    const { ed } = armar()
    ed.abajo({ x: 36, y: -14 })
    ed.mover({ x: 64, y: 14 })
    ed.arriba({ x: 64, y: 14 })
    expect([...ed.seleccion.figuras]).toEqual(['f_marco'])
    ed.seleccionarTodo()
    expect(ed.seleccion.figuras.has('f_marco')).toBe(true)
    expect(ed.seleccion.piezas.size).toBe(4)
  })

  it('R, X e Y con solo figuras no las cambian y lo dicen en el Registro (decisión 6)', () => {
    const { ed, registro } = armar()
    ed.seleccionar(seleccionDe('figuras', 'f_marco'))
    ed.transformar('girar')
    ed.transformar('espejoX')
    expect(ed.doc.figuras?.f_marco).toEqual(MARCO)
    expect(registro).toEqual(['Girar solo cambia piezas y etiquetas de red.', 'Reflejar solo cambia piezas y etiquetas de red.'])
  })

  it('el clic derecho reconoce la figura y la deja seleccionada', () => {
    const { ed } = armar()
    expect(ed.objetivoMenu({ x: 60, y: 0 })).toEqual({ tipo: 'figura', id: 'f_marco', en: { x: 60, y: 0 } })
    expect([...ed.seleccion.figuras]).toEqual(['f_marco'])
  })

  it('una pieza gana a una figura en el mismo lugar', () => {
    const { ed } = armar({ f_marco: { ...MARCO, x1: 6, y1: -8, x2: 30, y2: 20 } })
    // El contorno de arriba pasa por R1 (en 10, -8): el clic toma la pieza.
    clic(ed, 10, -8)
    expect(ed.seleccion.piezas.has('p_r1')).toBe(true)
    expect(ed.seleccion.figuras.size).toBe(0)
  })
})

describe('editor: herramienta Figura', () => {
  it('arrastrar dibuja la figura en la rejilla fina; al soltar queda elegida y la herramienta vuelve a Seleccionar', () => {
    const { ed } = armar({})
    ed.empezarFigura('rectangulo')
    expect(ed.herramienta).toBe('figura')
    expect(ed.estado().figuraPendiente).toBe('rectangulo')
    ed.abajo({ x: 30.4, y: 20.6 })
    ed.mover({ x: 20.2, y: 12 })
    expect(ed.estado().figuraEnCurso).toMatchObject({ tipo: 'rectangulo', x1: 20, y1: 12, x2: 30, y2: 21 })
    expect(ed.doc.figuras ?? {}).toEqual({})
    ed.arriba({ x: 20.2, y: 12 })
    const [f] = Object.values(ed.doc.figuras ?? {})
    expect(f).toEqual({ id: f.id, tipo: 'rectangulo', x1: 20, y1: 12, x2: 30, y2: 21, orden: 0 })
    expect(ed.herramienta).toBe('seleccionar')
    expect([...ed.seleccion.figuras]).toEqual([f.id])
    expect(ed.estado().figuraEnCurso).toBeNull()
    ed.deshacer()
    expect(ed.doc.figuras ?? {}).toEqual({})
  })

  it('con Shift: cuadrado, círculo y 45°', () => {
    const { ed } = armar({})
    const dibujar = (tipo: 'rectangulo' | 'elipse' | 'linea', a: [number, number], b: [number, number]) => {
      ed.empezarFigura(tipo)
      ed.abajo({ x: a[0], y: a[1] })
      ed.mover({ x: b[0], y: b[1] }, { shift: true })
      ed.arriba({ x: b[0], y: b[1] }, { shift: true })
      return ed.doc.figuras![[...ed.seleccion.figuras][0]]
    }
    expect(dibujar('rectangulo', [40, 20], [47, 23])).toMatchObject({ x1: 40, y1: 20, x2: 47, y2: 27 })
    expect(dibujar('elipse', [60, 20], [57, 30])).toMatchObject({ x1: 50, y1: 20, x2: 60, y2: 30 })
    expect(dibujar('linea', [40, 40], [50, 43])).toMatchObject({ x1: 40, y1: 40, x2: 50, y2: 40 })
    expect(dibujar('linea', [40, 50], [48, 57])).toMatchObject({ x2: 48, y2: 58 })
  })

  it('la figura nueva va al frente de las que hay', () => {
    const { ed } = armar()
    ed.empezarFigura('linea')
    ed.abajo({ x: 70, y: 0 })
    ed.arriba({ x: 80, y: 0 })
    expect(Object.values(ed.doc.figuras ?? {}).find((f) => f.id !== 'f_marco')?.orden).toBe(1)
  })

  it('un clic sin arrastre no dibuja y la herramienta sigue; Esc y el clic derecho la cancelan, también a medio dibujo', () => {
    const { ed } = armar({})
    ed.empezarFigura('linea')
    clic(ed, 40, 20)
    expect(ed.doc.figuras ?? {}).toEqual({})
    expect(ed.herramienta).toBe('figura')
    ed.escape()
    expect(ed.herramienta).toBe('seleccionar')
    ed.empezarFigura('elipse')
    ed.abajo({ x: 40, y: 20 })
    ed.mover({ x: 50, y: 30 })
    ed.escape()
    expect([ed.herramienta, ed.estado().figuraEnCurso, ed.doc.figuras ?? {}]).toEqual(['seleccionar', null, {}])
    ed.empezarFigura('flecha')
    expect(ed.clicDerecho()).toBe(true)
    expect(ed.herramienta).toBe('seleccionar')
  })

  it('perder el puntero a medio dibujo deja la herramienta lista para otro intento', () => {
    const { ed } = armar({})
    ed.empezarFigura('rectangulo')
    ed.abajo({ x: 40, y: 20 })
    ed.mover({ x: 50, y: 30 })
    ed.cancelarGesto({ soloPuntero: true })
    expect(ed.herramienta).toBe('figura')
    expect(ed.estado().figuraEnCurso).toBeNull()
    expect(ed.doc.figuras ?? {}).toEqual({})
  })

  it('simulando la herramienta no empieza y el Registro lo dice', () => {
    const { ed, registro } = armar({})
    ed.ponerSimulando(true)
    ed.empezarFigura('linea')
    expect(ed.herramienta).toBe('seleccionar')
    expect(registro).toEqual([MENSAJE_SIMULANDO])
  })

  it('elegir una pieza de la Librería a mitad de la herramienta la cambia por la de colocar', () => {
    const { ed } = armar({})
    ed.empezarFigura('linea')
    ed.empezarColocar('resistencia')
    expect(ed.herramienta).toBe('colocar')
    expect(ed.estado().figuraPendiente).toBeNull()
  })
})

describe('editor: asas, estilo y medidas de las figuras', () => {
  it('con una sola figura elegida, su asa se arrastra en un paso de deshacer; con dos, no hay asas', () => {
    const { ed } = armar()
    ed.seleccionar(seleccionDe('figuras', 'f_marco'))
    expect(ed.asaFiguraEn({ x: 60.2, y: 10.1 })).toEqual({ figura: 'f_marco', asa: 'se' })
    ed.abajo({ x: 60, y: 10 })
    ed.mover({ x: 64.4, y: 16.6 })
    expect(ed.estado().asaFigura).toEqual({ figura: 'f_marco', asa: 'se' })
    ed.mover({ x: 66, y: 18 })
    ed.arriba({ x: 66, y: 18 })
    expect(ed.doc.figuras?.f_marco).toEqual({ ...MARCO, x2: 66, y2: 18 })
    ed.deshacer()
    expect(ed.doc.figuras?.f_marco).toEqual(MARCO)
    const otra = seleccionDe('figuras', 'f_marco')
    otra.piezas.add('p_r1')
    ed.seleccionar(otra)
    expect(ed.asaFiguraEn({ x: 60, y: 10 })).toBeNull()
  })

  it('cambiarFigura cambia el estilo de todas las elegidas en un paso; lo que su tipo no admite lo ignora', () => {
    const linea: Figura = { id: 'f_l', tipo: 'linea', x1: 70, y1: 0, x2: 80, y2: 0, orden: 1 }
    const { ed } = armar({ f_marco: MARCO, f_l: linea })
    const s = seleccionDe('figuras', 'f_marco')
    s.figuras.add('f_l')
    ed.seleccionar(s)
    expect(ed.cambiarFigura({ tinta: 'azul', relleno: true })).toBe(true)
    expect(ed.doc.figuras?.f_marco).toEqual({ ...MARCO, tinta: 'azul', relleno: true })
    expect(ed.doc.figuras?.f_l).toEqual({ ...linea, tinta: 'azul' })
    expect(ed.cambiarFigura({ tinta: 'azul' })).toBe(false)
    ed.deshacer()
    expect(ed.doc.figuras).toEqual({ f_marco: MARCO, f_l: linea })
  })

  it('el ancho y el alto se escriben en mm; un error se devuelve y no cambia nada', () => {
    const { ed } = armar()
    ed.seleccionar(seleccionDe('figuras', 'f_marco'))
    expect(ed.cambiarMedidaFigura('ancho', '20 mm')).toBeNull()
    expect(ed.doc.figuras?.f_marco).toEqual({ ...MARCO, x2: 56 })
    expect(ed.cambiarMedidaFigura('alto', 'mucho')).toBe('Escribe la medida en mm con punto decimal, como 20 o 12.5.')
    expect(ed.doc.figuras?.f_marco.y2).toBe(10)
  })

  it('Al fondo manda las elegidas detrás de las demás figuras', () => {
    const linea: Figura = { id: 'f_l', tipo: 'linea', x1: 70, y1: 0, x2: 80, y2: 0, orden: 1 }
    const { ed } = armar({ f_marco: MARCO, f_l: linea })
    ed.seleccionar(seleccionDe('figuras', 'f_l'))
    ed.figurasAlFondo()
    expect(ed.doc.figuras?.f_l.orden).toBe(-1)
    expect(ed.doc.figuras?.f_marco.orden).toBe(0)
  })

  it('simulando nada de esto cambia el documento', () => {
    const { ed } = armar()
    ed.seleccionar(seleccionDe('figuras', 'f_marco'))
    ed.ponerSimulando(true)
    expect(ed.cambiarFigura({ tinta: 'rojo' })).toBe(false)
    expect(ed.cambiarMedidaFigura('ancho', '30')).toBe(MENSAJE_SIMULANDO)
    ed.figurasAlFondo()
    expect(ed.asaFiguraEn({ x: 60, y: 10 })).toBeNull()
    expect(ed.doc.figuras?.f_marco).toEqual(MARCO)
  })
})

describe('editor: figuras en el borde del mundo', () => {
  it('una medida que dejaría la figura fuera del área de dibujo no se aplica, lo dice el Registro y el campo da el error', () => {
    const L = LIMITE_COORDENADA
    const { ed, registro } = armar({ f_marco: { ...MARCO, x1: L - 20, x2: L - 4 } })
    ed.seleccion = seleccionDe('figuras', 'f_marco')
    expect(ed.cambiarMedidaFigura('ancho', '100')).toBe('Quedaría fuera del área de dibujo.')
    expect(ed.doc.figuras?.f_marco.x2).toBe(L - 4)
    expect(registro).toEqual(['No se cambió el tamaño de la figura: quedaría fuera del área de dibujo.'])
  })
})
