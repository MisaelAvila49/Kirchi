// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento } from '../doc/tipos'
import { anchoNotaAuto, anchoNotaMinimo, disposicionNota } from '../lienzo/medidas'
import { libreriaDePrueba } from '../prueba/libreria'
import { registrarAtajosDeLaVentana } from '../ui/atajosVentana'
import { registrarAtajosDelEditor } from './atajosEditor'
import { Editor } from './Editor'
import { seleccionVacia, type Seleccion } from './seleccion'
import { Atajos, type EventoTecla } from './teclado'

const lib = libreriaDePrueba().piezas
const ev = (key: string, m: Partial<EventoTecla> = {}): EventoTecla => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })

function armar() {
  const d: Documento = documentoVacio()
  d.notas.n = { id: 'n', x: 0, y: 0, ancho: anchoNotaAuto('Nota de prueba'), texto: 'Nota de prueba' }
  d.notas.m = { id: 'm', x: 0, y: 20, ancho: 40, texto: 'Ancho fijo', formato: { negrita: true }, anchoFijo: true }
  d.etiquetas.e = { id: 'e', nombre: 'VSAL', x: 40, y: 0, rot: 0 }
  d.piezas.r = { id: 'r', tipo: 'resistencia', ref: 'R1', x: 60, y: 0, rot: 0, espejo: false, props: {} }
  const registro: string[] = []
  const ed = new Editor(lib, d, idSecuencial(), { registrar: (t) => registro.push(t) })
  const a = new Atajos()
  registrarAtajosDelEditor(a, ed, { encuadrar: () => {} })
  return { ed, registro, a }
}
const elegir = (ed: Editor, pares: [keyof Seleccion, string][]) => {
  const s = seleccionVacia()
  for (const [c, id] of pares) s[c].add(id)
  ed.seleccionar(s)
}

describe('formato desde el editor', () => {
  it('un cambio se aplica a todas las notas y etiquetas seleccionadas en un solo paso de deshacer', () => {
    const { ed } = armar()
    elegir(ed, [['notas', 'n'], ['notas', 'm'], ['etiquetas', 'e']])
    expect(ed.cambiarFormato({ fuente: 'serif', tinta: 'rojo' })).toBe(true)
    expect(ed.doc.notas.n.formato).toEqual({ fuente: 'serif', tinta: 'rojo' })
    expect(ed.doc.notas.m.formato).toEqual({ fuente: 'serif', negrita: true, tinta: 'rojo' })
    expect(ed.doc.etiquetas.e.formato).toEqual({ fuente: 'serif', tinta: 'rojo' })
    ed.deshacer()
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
    expect(ed.doc.notas.m.formato).toEqual({ negrita: true })
    expect(ed.doc.etiquetas.e).not.toHaveProperty('formato')
  })

  it('el contorno se cambia en un paso para notas y etiquetas, y «auto» lo quita del archivo', () => {
    const { ed } = armar()
    elegir(ed, [['notas', 'n'], ['etiquetas', 'e']])
    expect(ed.cambiarFormato({ contorno: 'ninguno' })).toBe(true)
    expect(ed.doc.notas.n.formato).toEqual({ contorno: 'ninguno' })
    expect(ed.doc.etiquetas.e.formato).toEqual({ contorno: 'ninguno' })
    expect(ed.cambiarFormato({ contorno: 'ninguno' })).toBe(false)
    ed.deshacer()
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
    expect(ed.doc.etiquetas.e).not.toHaveProperty('formato')
    ed.cambiarFormato({ contorno: 'verde' })
    ed.cambiarFormato({ contorno: 'auto' })
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
  })

  it('volver a los valores por omisión quita el campo formato (el archivo queda como antes)', () => {
    const { ed } = armar()
    elegir(ed, [['notas', 'm']])
    ed.cambiarFormato({ negrita: false })
    expect(ed.doc.notas.m).not.toHaveProperty('formato')
  })

  it('el ancho automático sigue al formato; el que fijó el usuario se conserva', () => {
    const { ed } = armar()
    elegir(ed, [['notas', 'n'], ['notas', 'm']])
    ed.cambiarFormato({ tam: 5 })
    expect(ed.doc.notas.n.ancho).toBe(anchoNotaAuto('Nota de prueba', { tam: 5 }))
    expect(ed.doc.notas.n.ancho).toBeGreaterThan(anchoNotaAuto('Nota de prueba'))
    expect(ed.doc.notas.m.ancho).toBe(40)
  })

  it('con ancho fijado, una letra más grande no baja de la palabra más larga', () => {
    const d: Documento = documentoVacio()
    d.notas.v = { id: 'v', x: 0, y: 0, ancho: 12, texto: 'MULTIMETRO digital', anchoFijo: true }
    const ed = new Editor(lib, d, idSecuencial(), { registrar: () => {} })
    elegir(ed, [['notas', 'v']])
    ed.cambiarFormato({ tam: 10 })
    const n = ed.doc.notas.v
    expect(n.ancho).toBeGreaterThan(12)
    expect(n.ancho).toBe(anchoNotaMinimo(n))
    expect(Number.isInteger(n.ancho)).toBe(true)
    expect(disposicionNota(n).renglones.map((r) => r.texto)).toEqual(['MULTIMETRO', 'digital'])
  })

  it('el ancho de una nota sin ancho fijado solo se recalcula si cambia lo que mide el texto', () => {
    const d: Documento = documentoVacio()
    d.notas.v = { id: 'v', x: 0, y: 0, ancho: 99, texto: 'hola' }
    const ed = new Editor(lib, d, idSecuencial(), { registrar: () => {} })
    elegir(ed, [['notas', 'v']])
    ed.cambiarFormato({ tinta: 'rojo' })
    ed.cambiarFormato({ subrayado: true })
    ed.cambiarFormato({ alinear: 'centro' })
    expect(ed.doc.notas.v.ancho).toBe(99)
    ed.cambiarFormato({ negrita: true })
    expect(ed.doc.notas.v.ancho).toBe(anchoNotaAuto('hola', { negrita: true, tinta: 'rojo', subrayado: true, alinear: 'centro' }))
  })

  it('cambios seguidos del mismo control, en menos de 800 ms, son un solo paso de deshacer', () => {
    const { ed } = armar()
    let t = 1000
    ed.ahora = () => t
    elegir(ed, [['notas', 'n']])
    for (const fuente of ['serif', 'mono', 'sans', 'serif'] as const) {
      ed.cambiarFormato({ fuente }, { control: 'fuente' })
      t += 300
    }
    expect(ed.doc.notas.n.formato).toEqual({ fuente: 'serif' })
    ed.deshacer()
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
    // Otro control, o una pausa larga, abre otro paso.
    ed.cambiarFormato({ fuente: 'serif' }, { control: 'fuente' })
    ed.cambiarFormato({ tinta: 'rojo' }, { control: 'tinta' })
    t += 2000
    ed.cambiarFormato({ tinta: 'azul' }, { control: 'tinta' })
    ed.deshacer()
    expect(ed.doc.notas.n.formato).toEqual({ fuente: 'serif', tinta: 'rojo' })
    ed.deshacer()
    expect(ed.doc.notas.n.formato).toEqual({ fuente: 'serif' })
  })

  it('un cambio que deja el mismo valor no agrega paso', () => {
    const { ed } = armar()
    elegir(ed, [['notas', 'n']])
    expect(ed.cambiarFormato({ fuente: 'sans' }, { control: 'fuente' })).toBe(false)
    expect(ed.historial.puedeDeshacer).toBe(false)
  })

  it('Ctrl+B, Ctrl+I y Ctrl+U sin nada seleccionado no dicen nada ni sacuden', () => {
    const { ed, registro, a } = armar()
    elegir(ed, [])
    a.despachar(ev('b', { ctrlKey: true }))
    a.despachar(ev('i', { ctrlKey: true }))
    expect(registro).toEqual([])
  })

  it('Alt+F10 no choca con otro atajo', () => {
    const { a } = armar()
    registrarAtajosDeLaVentana(a, { hojaDeAtajos: () => {}, lienzoLimpio: () => {}, configuracion: () => {}, menuContextual: () => {}, enfocarFormato: () => {} })
    expect(a.conflictos()).toEqual([])
    expect(a.teclasDe('formato-barra')).toEqual(['Alt+F10'])
  })

  it('la alineación solo cambia notas; con solo etiquetas lo dice el Registro', () => {
    const { ed, registro } = armar()
    elegir(ed, [['etiquetas', 'e']])
    expect(ed.cambiarFormato({ alinear: 'centro' })).toBe(false)
    expect(registro).toEqual(['La alineación solo se aplica a notas.'])
    elegir(ed, [['etiquetas', 'e'], ['notas', 'n']])
    ed.cambiarFormato({ alinear: 'just' })
    expect(ed.doc.notas.n.formato).toEqual({ alinear: 'just' })
    expect(ed.doc.etiquetas.e).not.toHaveProperty('formato')
  })

  it('con piezas seleccionadas no hace nada y lo dice el Registro', () => {
    const { ed, registro, a } = armar()
    elegir(ed, [['piezas', 'r']])
    const antes = ed.doc
    a.despachar(ev('b', { ctrlKey: true }))
    expect(ed.doc).toBe(antes)
    expect(registro).toEqual(['El formato solo se aplica a notas y etiquetas de red.'])
  })

  it('Ctrl+B pone negrita a todos si alguno no la tiene y la quita si todos la tienen', () => {
    const { ed, a } = armar()
    elegir(ed, [['notas', 'n'], ['notas', 'm']])
    a.despachar(ev('b', { ctrlKey: true }))
    expect([ed.doc.notas.n.formato?.negrita, ed.doc.notas.m.formato?.negrita]).toEqual([true, true])
    a.despachar(ev('b', { ctrlKey: true }))
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
    expect(ed.doc.notas.m).not.toHaveProperty('formato')
    a.despachar(ev('i', { ctrlKey: true }))
    a.despachar(ev('u', { ctrlKey: true }))
    expect(ed.doc.notas.n.formato).toEqual({ cursiva: true, subrayado: true })
  })

  it('Ctrl+Shift+. y Ctrl+Shift+, recorren la serie ISO, cada texto desde su tamaño', () => {
    const { ed, a } = armar()
    elegir(ed, [['notas', 'n'], ['etiquetas', 'e']])
    a.despachar(ev('>', { ctrlKey: true, shiftKey: true, code: 'Period' }))
    expect([ed.doc.notas.n.formato?.tam, ed.doc.etiquetas.e.formato?.tam]).toEqual([2.5, 2.5])
    a.despachar(ev(':', { ctrlKey: true, shiftKey: true, code: 'Period' }))
    expect(ed.doc.notas.n.formato?.tam).toBe(3.5)
    for (let k = 0; k < 4; k++) a.despachar(ev(';', { ctrlKey: true, shiftKey: true, code: 'Comma' }))
    expect(ed.doc.notas.n.formato?.tam).toBe(1.8)
  })

  it('las alineaciones van con Ctrl+Shift (izquierda con Q: Ctrl+Shift+L es del lienzo limpio) y no chocan con R ni con L', () => {
    const { ed, a } = armar()
    elegir(ed, [['notas', 'n']])
    a.despachar(ev('E', { ctrlKey: true, shiftKey: true }))
    expect(ed.doc.notas.n.formato).toEqual({ alinear: 'centro' })
    a.despachar(ev('R', { ctrlKey: true, shiftKey: true }))
    expect(ed.doc.notas.n.formato).toEqual({ alinear: 'der' })
    a.despachar(ev('J', { ctrlKey: true, shiftKey: true }))
    expect(ed.doc.notas.n.formato).toEqual({ alinear: 'just' })
    a.despachar(ev('Q', { ctrlKey: true, shiftKey: true }))
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
    expect(ed.herramienta).toBe('seleccionar')
  })

  it('el registro de atajos del editor no tiene conflictos', () => {
    const { a } = armar()
    expect(a.conflictos()).toEqual([])
  })

  it('mientras se escribe en un campo los atajos de formato no actúan', () => {
    const { ed, a } = armar()
    elegir(ed, [['notas', 'n']])
    const campo = document.createElement('textarea')
    a.despachar(ev('b', { ctrlKey: true, target: campo }))
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
  })
})

describe('ficha de texto: vista previa y aplicar', () => {
  it('la vista previa cambia lo que se dibuja y no el documento ni el historial', () => {
    const { ed } = armar()
    const antes = ed.doc
    ed.previsualizarTexto('nota', 'n', { texto: 'Otro texto', formato: { tam: 5, tinta: 'rojo' } })
    expect(ed.doc).toBe(antes)
    expect(ed.docVista.notas.n.texto).toBe('Otro texto')
    expect(ed.docVista.notas.n.formato).toEqual({ tam: 5, tinta: 'rojo' })
    expect(ed.estado().puedeDeshacer).toBe(false)
    ed.previsualizarTexto('nota', 'n', null)
    expect(ed.docVista).toBe(ed.doc)
  })

  it('aplicar guarda texto y formato en un solo paso de deshacer, y solo lo que difiere', () => {
    const { ed } = armar()
    expect(ed.aplicarTexto('nota', 'n', { texto: 'Hola', formato: { tam: 2, negrita: true } })).toBeNull()
    expect(ed.doc.notas.n.texto).toBe('Hola')
    expect(ed.doc.notas.n.formato).toEqual({ negrita: true })
    ed.deshacer()
    expect(ed.doc.notas.n.texto).toBe('Nota de prueba')
    expect(ed.doc.notas.n).not.toHaveProperty('formato')
    expect(ed.estado().puedeDeshacer).toBe(false)
  })

  it('una etiqueta sin nombre o una nota vacía se rechazan con su mensaje', () => {
    const { ed } = armar()
    expect(ed.aplicarTexto('etiqueta', 'e', { texto: '  ' })).toBe('Escribe el nombre de la red.')
    expect(ed.aplicarTexto('nota', 'n', { texto: '' })).toBe('Escribe el texto de la nota.')
    expect(ed.doc.etiquetas.e.nombre).toBe('VSAL')
    expect(ed.aplicarTexto('etiqueta', 'e', { texto: 'VOUT', formato: { tinta: 'azul' } })).toBeNull()
    expect(ed.doc.etiquetas.e).toMatchObject({ nombre: 'VOUT', formato: { tinta: 'azul' } })
  })

  it('un cambio sin diferencias no escribe nada', () => {
    const { ed } = armar()
    expect(ed.aplicarTexto('nota', 'n', { texto: 'Nota de prueba', formato: {} })).toBeNull()
    expect(ed.estado().puedeDeshacer).toBe(false)
  })
})
