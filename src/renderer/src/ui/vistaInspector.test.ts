// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { calcularConexiones } from '../conexiones/conexiones'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { seleccionVacia, type Seleccion } from '../editor/seleccion'
import { divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { nombresDeRedes } from './redes'
import { FILA_PINES_CONECTADOS, nombrePin, repartirCampos, resumenSeleccion, TEXTO_ETIQUETAS_UNIDAS, vistaInspector } from './vistaInspector'
import { pistaDeEstado, pistaDeSimulacion } from './pista'
import { agregarAlRegistro, horaCorta } from './registro'
import { HisteresisDeRitmo, porcentajeLento } from './BarraEstado'

const lib = libreriaDePrueba().piezas
const sel = (...pares: [keyof Seleccion, string][]) => {
  const s = seleccionVacia()
  for (const [c, id] of pares) s[c].add(id)
  return s
}
const vista = (d: Documento, s: Seleccion) => {
  const con = calcularConexiones(d, lib)
  return vistaInspector(d, lib, con, s, nombresDeRedes(d, con))
}

describe('textos del inspector de redes', () => {
  it('la fila de pines se llama «Pines conectados» y la etiqueta explica por qué dos del mismo nombre quedan unidas', () => {
    expect(FILA_PINES_CONECTADOS).toBe('Pines conectados')
    expect(TEXTO_ETIQUETAS_UNIDAS).toBe('Las etiquetas con el mismo nombre quedan unidas aunque no haya cable.')
    expect(TEXTO_ETIQUETAS_UNIDAS).not.toMatch(/—|;/)
  })
})

describe('inspector: series y catálogo', () => {
  const campo = (def: string, prop: string, props: Record<string, string> = {}) => {
    const d = divisor()
    const p: Pieza = { id: 'x', tipo: def, ref: 'X1', x: 80, y: 0, rot: 0, espejo: false, props }
    d.piezas.x = p
    const v = vista(d, sel(['piezas', 'x']))
    if (v.tipo !== 'pieza') throw new Error(v.tipo)
    return v.props.find((c) => c.id === prop)!
  }
  it('la resistencia y el capacitor llevan la serie elegida; el electrolítico, E6 fija', () => {
    expect(campo('resistencia', 'valor')).toMatchObject({ serie: 'elegida', unidad: 'Ω' })
    expect(campo('capacitor', 'valor')).toMatchObject({ serie: 'elegida', unidad: 'F' })
    expect(campo('capacitor-electrolitico', 'valor')).toMatchObject({ serie: 'E6', unidad: 'F' })
    expect(campo('capacitor-electrolitico', 'voltaje').opciones).toEqual(['6.3 V', '10 V', '16 V', '25 V', '35 V', '50 V', '63 V', '100 V'])
  })
  it('el Zener lleva su catálogo, y un valor libre de un .kir viejo se conserva tal cual', () => {
    const c = campo('zener', 'voltaje', { voltaje: '5.7' })
    expect(c).toMatchObject({ catalogo: true, texto: '5.7', comunes: ['2.7', '3.3', '3.9', '4.7', '5.1', '5.6', '6.2', '6.8', '8.2', '9.1', '10', '12', '15', '18', '24', '27', '33', '39', '47', '56', '68'] })
  })
  it('todas las piezas con valor numérico ofrecen una lista de valores: serie o comunes', () => {
    for (const def of ['inductor', 'potenciometro', 'reostato']) expect(campo(def, 'valor').serie, def).toBe('elegida')
    for (const [def, prop] of [['fuente-dc', 'voltaje'], ['bateria', 'voltaje'], ['fusible', 'corriente']] as const) {
      const c = campo(def, prop)
      expect(c.serie, def).toBeUndefined()
      expect(c.comunes?.length, def).toBeGreaterThan(0)
    }
    // Con serie, la lista sale de la serie y no de los comunes; el catálogo (Zener) lleva los suyos como siempre.
    expect(campo('resistencia', 'valor').comunes).toBeUndefined()
    expect(campo('zener', 'voltaje').catalogo).toBe(true)
  })
  it('un transistor lleva la tabla de modelos; una resistencia no', () => {
    expect(campo('npn', 'modelo').tabla?.columnas).toEqual(['Bf', 'Ic máx'])
    expect(campo('resistencia', 'valor').tabla).toBeUndefined()
  })
})

describe('inspector', () => {
  it('solo figuras: la sección Figura con su título; sin selección cuenta las figuras; varios las nombra', () => {
    const d = divisor()
    d.figuras = { f1: { id: 'f1', tipo: 'elipse', x1: 40, y1: 0, x2: 50, y2: 6, orden: 0 }, f2: { id: 'f2', tipo: 'linea', x1: 40, y1: 20, x2: 50, y2: 20, orden: 1 } }
    expect(vista(d, sel(['figuras', 'f1']))).toMatchObject({ tipo: 'figura', ids: ['f1'], titulo: 'Elipse', figura: { tipo: 'elipse', relleno: false } })
    expect(vista(d, sel(['figuras', 'f1'], ['figuras', 'f2']))).toMatchObject({ tipo: 'figura', titulo: '2 figuras' })
    expect(vista(d, seleccionVacia())).toMatchObject({ tipo: 'nada', figuras: 2 })
    expect(vista(d, sel(['figuras', 'f1'], ['piezas', 'p_r1']))).toMatchObject({ tipo: 'varias', figuras: 1, piezas: 1 })
    expect(resumenSeleccion({ total: 3, piezas: 1, cables: 0, etiquetas: 0, notas: 0, figuras: 2 })).toBe('3 elementos: 1 pieza y 2 figuras.')
  })

  it('sin selección: listo para simular, conteos y redes con nombre', () => {
    const d = divisor()
    d.etiquetas.e = { id: 'e', nombre: 'VSAL', x: 6, y: -8, rot: 0 }
    expect(vista(d, seleccionVacia())).toEqual({
      tipo: 'nada', piezas: 4, redes: 3, cables: 2, figuras: 0, estado: 'listo', avisos: [], totalAvisos: 0, bloqueantes: 0,
      redesConNombre: [{ red: expect.any(Number), nombre: 'GND', conexiones: 3 }, { red: expect.any(Number), nombre: 'VSAL', conexiones: 2 }],
      totalRedesConNombre: 2,
      porCategoria: [{ id: 'fuentes', nombre: 'Fuentes', tono: 'ocre', piezas: 2 }, { id: 'pasivos', nombre: 'Pasivos', tono: 'azul', piezas: 2 }],
      sondas: []
    })
  })

  it('sin selección, por categoría: de más a menos piezas y, a igualdad, por nombre; sin las desconocidas', () => {
    const d = ledConBateria()
    d.piezas.x = { id: 'x', tipo: 'misterio', ref: 'X1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
    const v = vista(d, seleccionVacia())
    if (v.tipo !== 'nada') throw new Error(v.tipo)
    expect(v.porCategoria.map((c) => [c.nombre, c.piezas])).toEqual([['Fuentes', 2], ['Pasivos', 1], ['Semiconductores', 1]])
    expect(vista(documentoVacio(), seleccionVacia())).toMatchObject({ porCategoria: [] })
  })

  it('sin selección con avisos: los tres primeros y el total', () => {
    const d = documentoVacio()
    for (const [id, x] of [['a', 0], ['b', 20], ['c', 40], ['e', 60]] as const) d.piezas[id] = { id, tipo: 'resistencia', ref: `R${id}`, x, y: 0, rot: 0, espejo: false, props: {} }
    const v = vista(d, seleccionVacia())
    if (v.tipo !== 'nada') throw new Error(v.tipo)
    expect(v.estado).toBe('avisos')
    expect(v.avisos.map((a) => a.texto)).toEqual(['Falta una tierra.', 'El pin 1 de Ra no está conectado a nada.', 'El pin 2 de Ra no está conectado a nada.'])
    expect(v.totalAvisos).toBe(9)
    expect(v.redesConNombre).toEqual([])
  })

  it('sin selección con «Ver los N avisos» los lista todos ahí mismo (el panel Proyecto ya no los trae), hasta 200', () => {
    const d = documentoVacio()
    for (const [id, x] of [['a', 0], ['b', 20], ['c', 40], ['e', 60]] as const) d.piezas[id] = { id, tipo: 'resistencia', ref: `R${id}`, x, y: 0, rot: 0, espejo: false, props: {} }
    const con = calcularConexiones(d, lib)
    const v = vistaInspector(d, lib, con, seleccionVacia(), nombresDeRedes(d, con), undefined, undefined, true)
    if (v.tipo !== 'nada') throw new Error(v.tipo)
    expect(v.avisos).toHaveLength(9)
    expect(v.totalAvisos).toBe(9)
    const muchos = Array.from({ length: 250 }, (_, i) => ({ texto: `Aviso ${i}.`, piezas: [] }))
    const w = vistaInspector(d, lib, con, seleccionVacia(), nombresDeRedes(d, con), undefined, muchos, true)
    if (w.tipo !== 'nada') throw new Error(w.tipo)
    expect(w.avisos).toHaveLength(200)
    expect(w.totalAvisos).toBe(250)
  })

  it('sin selección lista como mucho 8 redes con nombre y cuenta todas', () => {
    const d = divisor()
    for (let i = 0; i < 12; i++) {
      d.piezas[`x${i}`] = { id: `x${i}`, tipo: 'resistencia', ref: `RX${i}`, x: 40 + i * 20, y: 40, rot: 0, espejo: false, props: {} }
      d.etiquetas[`e${i}`] = { id: `e${i}`, nombre: `N${String(i).padStart(2, '0')}`, x: 36 + i * 20, y: 40, rot: 0 }
    }
    const v = vista(d, seleccionVacia())
    if (v.tipo !== 'nada') throw new Error(v.tipo)
    expect(v.redesConNombre).toHaveLength(8)
    expect(v.totalRedesConNombre).toBe(13)
    expect(v.redesConNombre[0].nombre).toBe('GND')
  })

  it('sin piezas el estado es «vacío», aunque no haya avisos', () => {
    expect(vista(documentoVacio(), seleccionVacia())).toMatchObject({ tipo: 'nada', piezas: 0, estado: 'vacio', totalAvisos: 0 })
  })

  it('sin selección usa los totales y los avisos que recibe en lugar de recalcular', () => {
    const d = divisor()
    const con = calcularConexiones(d, lib)
    const aviso = { texto: 'Prueba.', piezas: [] }
    expect(vistaInspector(d, lib, con, seleccionVacia(), nombresDeRedes(d, con), { piezas: 99, redes: 7 }, [aviso])).toMatchObject({
      tipo: 'nada', piezas: 99, redes: 7, estado: 'avisos', avisos: [aviso], totalAvisos: 1
    })
  })

  it('un terminal de alimentación: Nombre y el Voltaje de su riel; con un nombre que es un voltaje, el voltaje no se edita y dice por qué', () => {
    const d = documentoVacio()
    const t = (id: string, x: number, nombre: string) => (d.piezas[id] = { id, tipo: 'alimentacion', ref: id.toUpperCase(), x, y: 0, rot: 0, espejo: false, props: { nombre } })
    t('t1', 0, 'VCC')
    t('t2', 20, 'VCC')
    t('t3', 40, '-15V')
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: '12' } }
    const campos = (id: string) => {
      const v = vista(d, sel(['piezas', id]))
      if (v.tipo !== 'pieza') throw new Error(v.tipo)
      return v.props.map(({ id, nombre, texto, lectura, soloLectura, ayuda, enCaliente }) => ({ id, nombre, texto, lectura, soloLectura, ayuda, enCaliente }))
    }
    expect(campos('t1')).toEqual([
      { id: 'nombre', nombre: 'Nombre', texto: 'VCC', lectura: null, soloLectura: undefined, ayuda: undefined, enCaliente: false },
      { id: 'voltaje', nombre: 'Voltaje', texto: '12', lectura: '12 V', soloLectura: undefined, ayuda: 'Cambia el de los 2 terminales VCC.', enCaliente: true }
    ])
    expect(campos('t3')[1]).toEqual({ id: 'voltaje', nombre: 'Voltaje', texto: '-15', lectura: '-15 V', soloLectura: true, ayuda: 'El voltaje sale del nombre.', enCaliente: false })
  })

  it('una pieza: nombre, categoría, pines, propiedades leídas, posición y la red de cada pin', () => {
    expect(vista(divisor(), sel(['piezas', 'p_r1']))).toEqual({
      tipo: 'pieza', id: 'p_r1', ref: 'R1', nombre: 'Resistencia', categoria: 'Pasivos', defId: 'resistencia', tono: 'azul', pines: 2,
      props: [{ id: 'valor', nombre: 'Valor', texto: '1k', unidad: 'Ω', lectura: '1 kΩ', enCaliente: true, serie: 'elegida' }, { id: 'potencia', nombre: 'Potencia nominal', texto: '0.25 W', unidad: undefined, opciones: ['0.125 W', '0.25 W', '0.5 W', '1 W', '2 W', '5 W'], lectura: null, enCaliente: false }],
      rot: 0, espejo: false,
      conexiones: [{ pin: 'Pin 1', red: 'red 1' }, { pin: 'Pin 2', red: 'red 2' }]
    })
  })

  it('una pieza digital dice bajo su alimentación que es implícita y no toma corriente del circuito', () => {
    const d = documentoVacio()
    d.piezas.u = { id: 'u', tipo: 'nand', ref: 'U1', x: 0, y: 0, rot: 0, espejo: false, props: { alimentacion: '3.3 V' } }
    const v = vista(d, sel(['piezas', 'u']))
    if (v.tipo !== 'pieza') throw new Error(v.tipo)
    expect(v.props.find((c) => c.id === 'alimentacion')).toMatchObject({ texto: '3.3 V', ayuda: 'Alimentación implícita de 3.3 V: no tiene pines de VCC ni GND y no toma corriente del circuito.' })
    expect(v.props.find((c) => c.id === 'familia')!.ayuda).toBeUndefined()
  })

  it('la lista de alimentaciones ofrece solo las de la familia de la pieza', () => {
    const d = documentoVacio()
    const pieza = (id: string, familia: string, alimentacion: string): Pieza => ({ id, tipo: 'nand', ref: id.toUpperCase(), x: 0, y: 0, rot: 0, espejo: false, props: { familia, alimentacion } })
    const opciones = (familia: string, alimentacion = '5 V') => {
      d.piezas.u = pieza('u', familia, alimentacion)
      const v = vista(d, sel(['piezas', 'u']))
      if (v.tipo !== 'pieza') throw new Error(v.tipo)
      return v.props.find((c) => c.id === 'alimentacion')!.opciones
    }
    expect(opciones('74HC')).toEqual(['2 V', '3 V', '3.3 V', '4.5 V', '5 V', '6 V'])
    expect(opciones('74LS')).toEqual(['5 V'])
    expect(opciones('CD4000B')).toEqual(['3 V', '3.3 V', '4.5 V', '5 V', '6 V', '9 V', '10 V', '12 V', '15 V', '18 V'])
    // Un valor que la familia no admite (un .kir manipulado) se sigue viendo en la lista, para que el campo diga lo que hay.
    expect(opciones('74LS', '12 V')).toEqual(['5 V', '12 V'])
  })

  it('una lista cerrada no se lee como número; los pines con nombre van con mayúscula', () => {
    const v = vista(ledConBateria(), sel(['piezas', 'p_d1']))
    expect(v).toMatchObject({
      tipo: 'pieza', categoria: 'Semiconductores', defId: 'led', tono: 'violeta', rot: 90,
      props: [{ id: 'color', texto: 'rojo', opciones: ['rojo', 'verde', 'azul', 'amarillo', 'blanco'], lectura: null }],
      conexiones: [{ pin: 'Ánodo', red: 'red 2' }, { pin: 'Cátodo', red: 'GND' }]
    })
  })

  it('un pin suelto dice «sin conectar»', () => {
    const d = documentoVacio()
    d.piezas.a = { id: 'a', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {} }
    expect(vista(d, sel(['piezas', 'a']))).toMatchObject({ conexiones: [{ pin: 'Pin 1', red: 'sin conectar' }, { pin: 'Pin 2', red: 'sin conectar' }] })
  })

  it('varias, un cable, una etiqueta, una nota y una pieza desconocida', () => {
    const d = divisor()
    d.etiquetas.e = { id: 'e', nombre: 'VSAL', x: 6, y: -8, rot: 0 }
    d.notas.n = { id: 'n', x: 40, y: 0, ancho: 8, texto: 'hola' }
    d.piezas.x = { id: 'x', tipo: 'misterio', ref: 'X1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
    expect(vista(d, sel(['piezas', 'p_r1'], ['piezas', 'p_r2'], ['cables', 'c_a']))).toEqual({ tipo: 'varias', total: 3, piezas: 2, cables: 1, etiquetas: 0, notas: 0, figuras: 0, formato: null })
    // La etiqueta en la punta de c_a nombra esa red: VSAL, con el + de V1 y el pin 1 de R1.
    expect(vista(d, sel(['cables', 'c_a']))).toEqual({ tipo: 'cable', id: 'c_a', red: 'VSAL', conexiones: 2 })
    expect(vista(d, sel(['etiquetas', 'e']))).toMatchObject({ tipo: 'etiqueta', id: 'e', nombre: 'VSAL', red: 'VSAL', conexiones: 2, formato: { fuente: 'mono', alinear: null } })
    expect(vista(d, sel(['notas', 'n']))).toMatchObject({ tipo: 'nota', id: 'n', texto: 'hola', formato: { fuente: 'sans', tam: 2, alinear: 'izq' } })
    // Una nota y una etiqueta, y nada más: la sección Texto aplica a las dos.
    expect(vista(d, sel(['notas', 'n'], ['etiquetas', 'e']))).toMatchObject({ tipo: 'varias', formato: { notas: 1, etiquetas: 1, fuente: 'varios' } })
    expect(vista(d, sel(['piezas', 'x']))).toEqual({ tipo: 'desconocida', id: 'x', ref: 'X1', tipoPieza: 'misterio' })
  })

  it('una etiqueta con otro nombre que el de la red, sobre un pin sin cable, muestra la red real', () => {
    // R1 y R2 comparten el punto (14, -8); las etiquetas «A» y «VCC» están ahí: la red toma «A».
    const d = documentoVacio()
    d.piezas.r1 = { id: 'r1', tipo: 'resistencia', ref: 'R1', x: 10, y: -8, rot: 0, espejo: false, props: {} }
    d.piezas.r2 = { id: 'r2', tipo: 'resistencia', ref: 'R2', x: 18, y: -8, rot: 0, espejo: false, props: {} }
    d.etiquetas.a = { id: 'a', nombre: 'A', x: 14, y: -8, rot: 0 }
    d.etiquetas.v = { id: 'v', nombre: 'VCC', x: 14, y: -8, rot: 0 }
    const con = calcularConexiones(d, lib)
    expect(con.redDeEtiqueta.get('v')).toBe(con.redDeEtiqueta.get('a'))
    expect(vista(d, sel(['etiquetas', 'v']))).toMatchObject({ tipo: 'etiqueta', id: 'v', nombre: 'VCC', red: 'A', conexiones: 2 })
  })

  it('resumen de varios: singular y plural de cada clase, solo las que hay', () => {
    const v = (piezas: number, cables: number, etiquetas: number, notas: number) => resumenSeleccion({ total: piezas + cables + etiquetas + notas, piezas, cables, etiquetas, notas })
    expect(v(5, 5, 0, 0)).toBe('10 elementos: 5 piezas y 5 cables.')
    expect(v(1, 1, 0, 0)).toBe('2 elementos: 1 pieza y 1 cable.')
    expect(v(0, 2, 1, 1)).toBe('4 elementos: 2 cables, 1 etiqueta de red y 1 nota.')
    expect(v(2, 0, 2, 3)).toBe('7 elementos: 2 piezas, 2 etiquetas de red y 3 notas.')
    expect(v(0, 0, 0, 2)).toBe('2 elementos: 2 notas.')
    expect(v(1200, 300, 0, 0)).toBe('1,500 elementos: 1,200 piezas y 300 cables.')
  })

  it('nombrePin', () => {
    expect(nombrePin('2')).toBe('Pin 2')
    expect(nombrePin('ánodo')).toBe('Ánodo')
    expect(nombrePin('+')).toBe('+')
  })
})

describe('pista de la barra de estado', () => {
  const d = divisor()
  it.each([
    ['seleccionar', seleccionVacia(), 'Doble clic para agregar una pieza, o arrástrala desde la Librería'],
    ['seleccionar', sel(['piezas', 'p_r1']), 'R1 seleccionada · flechas para mover'],
    ['seleccionar', sel(['piezas', 'p_r1'], ['cables', 'c_a']), '2 elementos seleccionados · flechas para mover'],
    ['seleccionar', sel(['cables', 'c_a']), 'Cable seleccionado · arrastra un tramo para moverlo'],
    ['colocar', seleccionVacia(), 'Clic para colocar · Shift+clic para seguir · R y Shift+R giran, X e Y reflejan · Esc cancela'],
    ['cablear', seleccionVacia(), 'Clic fija una esquina · / invierte la L · Retroceso quita la esquina · Esc cancela']
  ] as const)('%s %#', (herramienta, seleccion, texto) => {
    expect(pistaDeEstado({ herramienta, seleccion, doc: d })).toBe(texto)
  })

  it('nombra las teclas vigentes del registro, no las de fábrica', () => {
    const propias: Record<string, string> = { girar: 'Ctrl+G', 'espejo-x': 'H', 'espejo-y': 'I', escape: 'Q', 'invertir-l': 'Ctrl+L' }
    const tecla = (id: string) => propias[id]
    expect(pistaDeEstado({ herramienta: 'colocar', seleccion: seleccionVacia(), doc: d }, tecla)).toBe('Clic para colocar · Shift+clic para seguir · Ctrl+G gira, H e I reflejan · Q cancela')
    expect(pistaDeEstado({ herramienta: 'cablear', seleccion: seleccionVacia(), doc: d }, tecla)).toBe('Clic fija una esquina · Ctrl+L invierte la L · Q cancela')
  })

  it('con la herramienta Figura dice qué se dibuja y qué hace Shift; una figura seleccionada, que se arrastran sus asas', () => {
    const base = { seleccion: seleccionVacia(), doc: d }
    expect(pistaDeEstado({ ...base, herramienta: 'figura', figuraPendiente: 'rectangulo' })).toBe('Arrastra para dibujar un rectángulo · Shift lo hace cuadrado · Esc cancela')
    expect(pistaDeEstado({ ...base, herramienta: 'figura', figuraPendiente: 'elipse' })).toBe('Arrastra para dibujar una elipse · Shift la hace círculo · Esc cancela')
    expect(pistaDeEstado({ ...base, herramienta: 'figura', figuraPendiente: 'flecha' })).toBe('Arrastra para dibujar una flecha · Shift la endereza a 45° · Esc cancela')
    expect(pistaDeEstado({ herramienta: 'seleccionar', seleccion: sel(['figuras', 'f1']), doc: d })).toBe('Figura seleccionada · arrastra un asa para cambiar su tamaño')
    // Un medidor o una sonda no son una nota.
    const conSonda = { ...d, sondas: { s1: { id: 's1', tipo: 'medidor' as const, x: 0, y: 0, ref: 'M1' } } }
    expect(pistaDeEstado({ herramienta: 'seleccionar', seleccion: sel(['sondas', 's1']), doc: conSonda })).toBe('M1 seleccionada · arrástrala por la red; Supr la quita')
  })
})

describe('pista de la vista previa', () => {
  const l = { t: 1.25, ratio: 0.996, redes: new Map(), piezas: new Map() }
  it('dice el tiempo simulado y el ritmo, o que está en pausa', () => {
    expect(pistaDeSimulacion('corriendo', l)).toBe('Simulando · t = 1.25 s · al 100 % del tiempo real · clic, Enter o Espacio en un interruptor, un botón o un fusible fundido para accionarlo')
    // Si no alcanza el tiempo real, la cifra va en ámbar en la barra y la pista no la repite.
    expect(pistaDeSimulacion('corriendo', { ...l, ratio: 0.63 })).toBe('Simulando · t = 1.25 s · clic, Enter o Espacio en un interruptor, un botón o un fusible fundido para accionarlo')
    expect(porcentajeLento(0.63)).toBe(63)
    expect(porcentajeLento(0.996)).toBeNull()
    expect(porcentajeLento(null)).toBeNull()
    expect(pistaDeSimulacion('pausada', { ...l, t: 0.5 })).toBe('En pausa · t = 500 ms')
    expect(pistaDeSimulacion('corriendo', l, { tecla: 'V', visibles: false })).toBe('Simulando · t = 1.25 s · al 100 % del tiempo real · clic, Enter o Espacio en un interruptor, un botón o un fusible fundido para accionarlo · V muestra los voltajes')
    expect(pistaDeSimulacion('pausada', { ...l, t: 0.5 }, { tecla: 'V', visibles: true })).toBe('En pausa · t = 500 ms · V oculta los voltajes')
    expect(pistaDeSimulacion('pausada', { ...l, t: 0.5 }, { tecla: undefined, visibles: true })).toBe('En pausa · t = 500 ms')
    expect(pistaDeSimulacion('arrancando', null)).toBe('Arrancando la vista previa…')
  })
})

describe('histéresis de la barra en ámbar', () => {
  it('entra de inmediato por debajo de 97 %, o tras un segundo por debajo de 99 %, y sale por encima de 99 %', () => {
    const h = new HisteresisDeRitmo()
    expect(h.actualizar(1, 0)).toBe(false)
    expect(h.actualizar(0.96, 100)).toBe(true)
    // Oscilar alrededor del 100 % no la apaga y prende cada lectura: sale solo por encima de 99 %.
    expect(h.actualizar(0.985, 200)).toBe(true)
    expect(h.actualizar(0.99, 300)).toBe(true)
    expect(h.actualizar(0.991, 400)).toBe(false)
    expect(h.actualizar(0.98, 500)).toBe(false)
    // Entre 97 y 99 % entra solo si dura un segundo.
    expect(h.actualizar(0.98, 1400)).toBe(false)
    expect(h.actualizar(0.98, 1500)).toBe(true)
  })

  it('un cruce breve por debajo de 99 % no la enciende, y sin lectura se apaga', () => {
    const h = new HisteresisDeRitmo()
    expect(h.actualizar(0.985, 0)).toBe(false)
    expect(h.actualizar(0.999, 500)).toBe(false)
    expect(h.actualizar(0.985, 900)).toBe(false)
    expect(h.actualizar(0.985, 1700)).toBe(false)
    expect(h.actualizar(0.96, 1800)).toBe(true)
    expect(h.actualizar(null, 1900)).toBe(false)
  })
})

describe('Registro', () => {
  const t = new Date(2026, 9, 13, 9, 5, 7)
  it('agrega al final con hora y número', () => {
    const l = agregarAlRegistro(agregarAlRegistro([], 'Uno.', 'aviso', t), 'Dos.', 'error', t)
    expect(l).toEqual([
      { n: 1, hora: '09:05:07', texto: 'Uno.', tipo: 'aviso', veces: 1 },
      { n: 2, hora: '09:05:07', texto: 'Dos.', tipo: 'error', veces: 1 }
    ])
  })

  it('el mismo mensaje seguido solo suma una vez más; se guardan los últimos', () => {
    let l = agregarAlRegistro([], 'Igual.', 'aviso', t)
    l = agregarAlRegistro(l, 'Igual.', 'aviso', t)
    expect(l).toEqual([{ n: 1, hora: '09:05:07', texto: 'Igual.', tipo: 'aviso', veces: 2 }])
    for (let i = 0; i < 5; i++) l = agregarAlRegistro(l, `M${i}.`, 'aviso', t, 3)
    expect(l.map((e) => e.texto)).toEqual(['M2.', 'M3.', 'M4.'])
    expect(horaCorta(new Date(2026, 0, 1, 23, 0, 59))).toBe('23:00:59')
  })

  it('una nota o etiqueta seleccionada que ya no existe no rompe la vista: sin formato', () => {
    const d = documentoVacio()
    expect(vista(d, sel(['notas', 'fantasma']))).toMatchObject({ tipo: 'nota', formato: null })
    expect(vista(d, sel(['etiquetas', 'fantasma']))).toMatchObject({ tipo: 'etiqueta', formato: null })
  })
})

describe('las sondas en el inspector', () => {
  // El divisor con XSC1 midiendo c_a (V1:+ y R1:1) en A, una sonda de voltaje y una de corriente en el mismo cable.
  const conSondas = (): Documento => ({
    ...divisor(),
    piezas: { ...divisor().piezas, o: { id: 'o', tipo: 'osciloscopio', ref: 'XSC1', x: 80, y: 0, rot: 0, espejo: false, props: {} } },
    sondas: {
      a: { id: 'a', tipo: 'osciloscopio', x: 2, y: -8, instrumento: 'o', entrada: 'A' },
      v: { id: 'v', tipo: 'voltaje', x: 0, y: -6 },
      i: { id: 'i', tipo: 'corriente', x: 4, y: -8, sentido: 'derecha' }
    }
  })
  it('una sonda elegida: qué es, qué mide y su sentido', () => {
    expect(vista(conSondas(), sel(['sondas', 'a']))).toEqual({ tipo: 'sonda', id: 'a', titulo: 'Sonda A de XSC1', mide: 'R1:1 y V1:+', sentido: null, medidor: null })
    expect(vista(conSondas(), sel(['sondas', 'i']))).toMatchObject({ tipo: 'sonda', titulo: 'Sonda de corriente hacia la derecha', sentido: 'Hacia la derecha' })
  })
  it('un medidor rápido: su ficha con referencia, función y qué mide', () => {
    const d = conSondas()
    d.sondas!.mv = { id: 'mv', tipo: 'medidor', x: 0, y: -8, magnitud: 'voltaje', modo: 'dc', pantalla: { dx: 7, dy: -6 }, ref: 'M1' }
    d.sondas!.mi = { id: 'mi', tipo: 'medidor', x: 2, y: -8, magnitud: 'corriente', modo: 'ac', pantalla: { dx: 7, dy: -6 }, ref: 'M2' }
    d.etiquetas.e = { id: 'e', nombre: 'VIN', x: 0, y: -8, rot: 0 }
    const v = vista(d, sel(['sondas', 'mv']))
    expect(v).toMatchObject({ tipo: 'sonda', titulo: 'Medidor M1', medidor: { ref: 'M1', magnitud: 'voltaje', modo: 'dc', puedeCorriente: false } })
    if (v.tipo !== 'sonda') throw new Error(v.tipo)
    expect(v.medidor!.descripcion).toBe('Mide la red VIN respecto a tierra.')
    const i = vista(d, sel(['sondas', 'mi']))
    if (i.tipo !== 'sonda') throw new Error(i.tipo)
    expect(i.medidor).toMatchObject({ magnitud: 'corriente', modo: 'ac', puedeCorriente: true })
    expect(i.medidor!.descripcion).toMatch(/^Mide la corriente del cable de .+ a .+\.$/)
  })
  it('sin selección, la lista de sondas', () => {
    const v = vista(conSondas(), sel())
    if (v.tipo !== 'nada') throw new Error(v.tipo)
    expect(v.sondas).toEqual([
      { id: 'a', texto: 'XSC1 · A ← R1:1' },
      { id: 'i', texto: 'Corriente · R1:1' },
      { id: 'v', texto: 'Voltaje · R1:1' }
    ])
  })
})

describe('la ficha compacta reparte los campos', () => {
  it('hasta cuatro campos se ven todos; con más, tres y el resto en «Más ajustes»', () => {
    expect(repartirCampos([1, 2])).toEqual({ vistos: [1, 2], mas: [] })
    expect(repartirCampos([1, 2, 3, 4])).toEqual({ vistos: [1, 2, 3, 4], mas: [] })
    expect(repartirCampos([1, 2, 3, 4, 5, 6])).toEqual({ vistos: [1, 2, 3], mas: [4, 5, 6] })
  })
})
