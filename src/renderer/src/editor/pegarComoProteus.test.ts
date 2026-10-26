// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../doc/ids'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { libreriaDePrueba } from '../prueba/libreria'
import { registrarAtajosDelEditor } from './atajosEditor'
import { Editor } from './Editor'
import { seleccionDe } from './seleccion'
import { Atajos, type EventoTecla } from './teclado'

/** Copiar y pegar como Proteus: lo pegado y duplicado toma la siguiente referencia libre (R1 → R3 si hay R1 y R2);
 * terminales de alimentación y etiquetas conservan su nombre. Cubre Ctrl+V, «Pegar aquí», Ctrl+D y «Duplicar». */

const lib = libreriaDePrueba().piezas
const P = (id: string, tipo: string, ref: string, x: number, y: number, props: Record<string, string> = {}): Pieza => ({ id, tipo, ref, x, y, rot: 0, espejo: false, props })
const ev = (key: string, m: Partial<EventoTecla> = {}): EventoTecla => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...m })

function circuito(): Documento {
  const d = documentoVacio()
  for (const p of [
    P('r1', 'resistencia', 'R1', 0, 0, { valor: '1k' }),
    P('r2', 'resistencia', 'R2', 0, 20),
    P('c1', 'capacitor', 'C1', 20, 0),
    P('vcc', 'alimentacion', 'PWR1', 40, 0, { nombre: 'VCC' })
  ])
    d.piezas[p.id] = p
  d.etiquetas.e1 = { id: 'e1', nombre: 'SALIDA', x: 60, y: 0, rot: 0 }
  return d
}

function preparar() {
  const ed = new Editor(lib, circuito(), idSecuencial())
  const atajos = new Atajos()
  registrarAtajosDelEditor(atajos, ed, { encuadrar: () => undefined })
  const s = seleccionDe('piezas', 'r1')
  s.piezas.add('c1').add('vcc')
  s.etiquetas.add('e1')
  ed.seleccionar(s)
  return { ed, atajos }
}

/** Lo nuevo en el documento (lo que no estaba en el circuito de partida), por colección. */
function nuevos(ed: Editor) {
  const antes = circuito()
  return {
    piezas: Object.values(ed.doc.piezas).filter((p) => !Object.hasOwn(antes.piezas, p.id)),
    etiquetas: Object.values(ed.doc.etiquetas).filter((e) => !Object.hasOwn(antes.etiquetas, e.id))
  }
}

const caminos: [string, (c: ReturnType<typeof preparar>) => void][] = [
  ['Ctrl+V', ({ ed, atajos }) => {
    atajos.despachar(ev('c', { ctrlKey: true }))
    ed.mover({ x: 100, y: 60 })
    atajos.despachar(ev('v', { ctrlKey: true }))
  }],
  ['«Pegar aquí» del menú', ({ ed }) => {
    ed.copiar()
    // Como la ventana: el menú deja el cursor en el punto del clic derecho y pega ahí.
    ed.cursor = ed.objetivoMenu({ x: 100, y: 60 }).en
    ed.pegar()
  }],
  ['Ctrl+D', ({ ed, atajos }) => {
    ed.mover({ x: 100, y: 60 })
    atajos.despachar(ev('d', { ctrlKey: true }))
  }],
  ['«Duplicar» del menú', ({ ed }) => ed.duplicar({ x: 100, y: 60 })]
]

describe.each(caminos)('pegar como Proteus: %s', (_, hacer) => {
  it('las piezas toman la siguiente referencia libre de su prefijo; el terminal y la etiqueta conservan su nombre', () => {
    const c = preparar()
    hacer(c)
    const { piezas, etiquetas } = nuevos(c.ed)
    expect(piezas.map((p) => p.ref).sort()).toEqual(['C2', 'PWR2', 'R3'])
    expect(piezas.find((p) => p.tipo === 'resistencia')?.props.valor).toBe('1k')
    expect(piezas.find((p) => p.tipo === 'alimentacion')?.props.nombre).toBe('VCC')
    expect(etiquetas.map((e) => e.nombre)).toEqual(['SALIDA'])
    // Mismo nombre, misma red: el terminal pegado se une con el original y la etiqueta pegada con la suya.
    const vcc = c.ed.con.redDePin.get('vcc:1')
    const copia = piezas.find((p) => p.tipo === 'alimentacion')!
    expect(c.ed.con.redDePin.get(`${copia.id}:1`)).toBe(vcc)
    // Un solo paso de deshacer.
    c.ed.deshacer()
    expect(nuevos(c.ed).piezas).toEqual([])
  })
})

describe('pegar como Proteus: prefijos', () => {
  it('una referencia cambiada a mano con su propio prefijo sigue con él (RL1 → RL2); una sin número toma el de la pieza', () => {
    const d = circuito()
    d.piezas.r1 = { ...d.piezas.r1, ref: 'RL1' }
    d.piezas.r2 = { ...d.piezas.r2, ref: 'Rcarga' }
    const ed = new Editor(lib, d, idSecuencial())
    const s = seleccionDe('piezas', 'r1')
    s.piezas.add('r2')
    ed.seleccionar(s)
    ed.duplicar({ x: 100, y: 60 })
    const refs = Object.values(ed.doc.piezas).filter((p) => !Object.hasOwn(d.piezas, p.id)).map((p) => p.ref).sort()
    // R: ninguna lleva número con ese prefijo («RL1» es de RL), así que «Rcarga» pasa a R1.
    expect(refs).toEqual(['R1', 'RL2'])
  })
})
