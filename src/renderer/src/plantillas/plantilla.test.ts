// @vitest-environment happy-dom
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { escribirKir, leerKir } from '../archivo/kir'
import { todo } from '../editor/seleccion'
import { documentoVacio } from '../doc/tipos'
import { divisor, ledConBateria } from '../prueba/circuitos'
import { libreriaDePrueba } from '../prueba/libreria'
import { Editor } from '../editor/Editor'
import { idSecuencial } from '../doc/ids'
import { conDescripcion, documentoDeFragmento, empaquetarPlantilla, fragmentoParaColocar, ENTRADA_META, ENTRADA_VISTA, fragmentoDeDocumento, fragmentoDeSeleccion, leerPlantilla, LIMITE_META, MAX_DESCRIPCION, vistaDeFragmento } from './plantilla'

const lib = libreriaDePrueba().piezas

describe('plantilla con sondas', () => {
  it('guardar y leer conserva la sonda del osciloscopio y su entrada, en un archivo de formato 5', () => {
    const d = divisor()
    d.piezas.p_o = { id: 'p_o', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: -8, rot: 0, espejo: false, props: {} }
    d.sondas = { s_1: { id: 's_1', tipo: 'osciloscopio', x: 0, y: -6, instrumento: 'p_o', entrada: 'A' } }
    const f = fragmentoDeSeleccion(d, todo(d), lib)!
    expect(f.sondas).toHaveLength(1)
    const bytes = empaquetarPlantilla(f, { nombre: 'Con osciloscopio', descripcion: '' }, lib, '0.0.1')
    const r = leerPlantilla(bytes, 'x')
    if (!r.ok) throw new Error(r.error)
    expect(r.fragmento.sondas).toHaveLength(1)
    expect(r.fragmento.sondas![0]).toMatchObject({ tipo: 'osciloscopio', instrumento: 'p_o', entrada: 'A', x: f.sondas![0].x, y: f.sondas![0].y })
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBeGreaterThanOrEqual(5)
  })

  it('sin sondas el archivo no cambia de formato', () => {
    const d = divisor()
    const bytes = empaquetarPlantilla(fragmentoDeSeleccion(d, todo(d), lib)!, { nombre: 'x', descripcion: '' }, lib, '0.0.1')
    expect(JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato).toBeLessThan(5)
  })
})

describe('plantilla: ida y vuelta', () => {
  it('guarda lo seleccionado y lo vuelve a leer con la misma geometría, ficha y miniatura', () => {
    const d = divisor()
    const f = fragmentoDeSeleccion(d, todo(d))!
    const bytes = empaquetarPlantilla(f, { nombre: 'Divisor', descripcion: 'Dos resistencias de 1 kΩ.' }, lib, '0.0.1')
    const r = leerPlantilla(bytes, 'otro')
    if (!r.ok) throw new Error(r.error)
    expect(r.meta).toEqual({ nombre: 'Divisor', descripcion: 'Dos resistencias de 1 kΩ.' })
    expect(r.fragmento.piezas.map((p) => [p.ref, p.tipo, p.x, p.y, p.rot, p.props]).sort()).toEqual(f.piezas.map((p) => [p.ref, p.tipo, p.x, p.y, p.rot, p.props]).sort())
    expect(r.fragmento.cables.map((c) => c.puntos)).toEqual(f.cables.map((c) => c.puntos))
    const z = unzipSync(bytes)
    expect(Object.keys(z).sort()).toEqual(['circuito.json', ENTRADA_META, ENTRADA_VISTA, 'manifest.json'].sort())
    expect(strFromU8(z[ENTRADA_VISTA])).toMatch(/^<svg [^>]*viewBox="[^"]+"/)
  })

  it('un .kir de plantilla se abre como circuito normal (las entradas extra se ignoran)', () => {
    const d = ledConBateria()
    const bytes = empaquetarPlantilla(fragmentoDeDocumento(d)!, { nombre: 'LED', descripcion: '' }, lib, '0.0.1')
    const l = leerKir(bytes)
    expect(l.ok && Object.keys(l.doc.piezas).length).toBe(4)
  })

  it('la miniatura es determinista y no lleva scripts ni texto del usuario', () => {
    const d = divisor()
    const f = fragmentoDeSeleccion(d, todo(d))!
    const a = empaquetarPlantilla(f, { nombre: '<script>alert(1)</script>', descripcion: '<img onerror=x>' }, lib, '0.0.1')
    const b = empaquetarPlantilla(f, { nombre: '<script>alert(1)</script>', descripcion: '<img onerror=x>' }, lib, '0.0.1')
    expect(a).toEqual(b)
    const svg = strFromU8(unzipSync(a)[ENTRADA_VISTA])
    expect(svg).not.toMatch(/script|onerror|<img|<text/i)
  })

  it('la vista cubre las piezas y los cables y deja margen', () => {
    const d = divisor()
    const v = vistaDeFragmento(fragmentoDeSeleccion(d, todo(d))!, lib)
    expect(v.lineas.some((l) => l.cable)).toBe(true)
    expect(v.lineas.some((l) => !l.cable)).toBe(true)
    expect(v.ancho).toBeGreaterThan(10)
    expect(vistaDeFragmento({ origen: { x: 0, y: 0 }, piezas: [], cables: [], etiquetas: [], notas: [], figuras: [] }, lib).viewBox).toBe('0 0 10 10')
  })

  it('fragmentoDeSeleccion de nada es null', () => {
    const d = divisor()
    expect(fragmentoDeSeleccion(d, { ...todo(d), piezas: new Set(), cables: new Set() })).toBeNull()
  })
})

describe('plantilla: entrada hostil', () => {
  const circuito = () => escribirKir(divisor(), '0.0.1')

  it('lo que no es un zip, o no es de Kirchi, se rechaza con el mensaje de abrir un .kir', () => {
    expect(leerPlantilla(new Uint8Array([1, 2, 3]), 'x')).toMatchObject({ ok: false })
    expect(leerPlantilla(zipSync({ 'otro.txt': strToU8('hola') }), 'x')).toMatchObject({ ok: false })
    expect(leerPlantilla(new Uint8Array(0), 'x')).toMatchObject({ ok: false })
  })

  it('un circuito.json que descomprime a más del tope se rechaza (mismo tope que abrir un .kir)', () => {
    const grande = zipSync({
      'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato: 1, version: '0' })),
      'circuito.json': strToU8('{"relleno":"' + 'a'.repeat(70 * 2 ** 20) + '"}')
    })
    expect(leerPlantilla(grande, 'x')).toMatchObject({ ok: false, error: expect.stringMatching(/demasiado grande/) })
  })

  it('una ficha pasada del tope no se descomprime y se usa el nombre del archivo', () => {
    const z = unzipSync(circuito())
    const bomba = zipSync({ ...z, [ENTRADA_META]: strToU8('{"nombre":"' + 'a'.repeat(LIMITE_META + 10) + '"}') })
    const r = leerPlantilla(bomba, 'Del archivo')
    expect(r).toMatchObject({ ok: true, meta: { nombre: 'Del archivo', descripcion: '' } })
  })

  it('una ficha rota o de tipos raros cae al nombre del archivo y recorta lo largo', () => {
    const z = unzipSync(circuito())
    expect(leerPlantilla(zipSync({ ...z, [ENTRADA_META]: strToU8('no es json') }), 'Archivo')).toMatchObject({ ok: true, meta: { nombre: 'Archivo' } })
    expect(leerPlantilla(zipSync({ ...z, [ENTRADA_META]: strToU8('{"nombre":3,"descripcion":{}}') }), 'Archivo')).toMatchObject({ ok: true, meta: { nombre: 'Archivo', descripcion: '' } })
    const larga = leerPlantilla(zipSync({ ...z, [ENTRADA_META]: strToU8(JSON.stringify({ nombre: 'N', descripcion: 'd'.repeat(5000) })) }), 'Archivo')
    expect(larga.ok && larga.meta.descripcion.length).toBe(MAX_DESCRIPCION)
  })

  it('un circuito de formato más nuevo no se coloca', () => {
    const z = unzipSync(circuito())
    const nuevo = zipSync({ ...z, 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato: 99, version: '9' })) })
    expect(leerPlantilla(nuevo, 'x')).toMatchObject({ ok: false, error: expect.stringMatching(/más nueva/) })
  })

  it('un circuito vacío no es una plantilla', () => {
    const vacio = escribirKir({ piezas: {}, cables: {}, etiquetas: {}, notas: {} } as never, '0.0.1')
    expect(leerPlantilla(vacio, 'x')).toMatchObject({ ok: false, error: expect.stringMatching(/vacía/) })
  })

  it('el texto de la ficha pierde los caracteres de control', () => {
    const z = unzipSync(circuito())
    const r = leerPlantilla(zipSync({ ...z, [ENTRADA_META]: strToU8(JSON.stringify({ nombre: 'A\u0000B\u0007', descripcion: 'x\u0001y' })) }), 'Archivo')
    expect(r).toMatchObject({ ok: true, meta: { nombre: 'AB', descripcion: 'xy' } })
  })
})

describe('colocar una plantilla no agrega sus notas', () => {
  const conNota = () => {
    const d = divisor()
    d.notas.n_1 = { id: 'n_1', x: 30, y: 0, ancho: 20, texto: 'Vsalida = V · R2 / (R1 + R2)', formato: { tinta: 'gris', contorno: 'ninguno' } }
    return d
  }
  it('el fragmento para colocar sale sin notas y conserva todo lo demás', () => {
    const f = fragmentoDeSeleccion(conNota(), todo(conNota()))!
    expect(f.notas).toHaveLength(1)
    const g = fragmentoParaColocar(f)
    expect(g.notas).toEqual([])
    expect(g.piezas).toHaveLength(f.piezas.length)
    expect(g.cables).toHaveLength(f.cables.length)
  })
  it('una plantilla que solo trae una nota la conserva (si no, no habría nada que colocar)', () => {
    const d = documentoDeFragmento({ origen: { x: 0, y: 0 }, piezas: [], cables: [], etiquetas: [], notas: [conNota().notas.n_1], figuras: [] })
    const f = fragmentoDeSeleccion(d, todo(d))!
    expect(fragmentoParaColocar(f).notas).toHaveLength(1)
  })
  it('colocada en el editor, la plantilla pone sus piezas y cables y ninguna nota; el portapapeles (Ctrl+V) sí copia las notas', () => {
    const f = fragmentoDeSeleccion(conNota(), todo(conNota()))!
    const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
    ed.tolerancia = 0.5
    ed.cargar(documentoVacio())
    expect(ed.empezarColocarFragmento(fragmentoParaColocar(f), { x: 100, y: 100 })).toBe(true)
    ed.abajo({ x: 100, y: 100 })
    ed.arriba({ x: 100, y: 100 })
    expect(Object.keys(ed.doc.piezas)).toHaveLength(4)
    expect(Object.keys(ed.doc.notas)).toEqual([])
  })
})

describe('plantillas propias conservan las notas de la selección', () => {
  it('guardar, leer y colocar una plantilla propia trae la nota con su posición relativa y su formato', () => {
    const d = divisor()
    d.notas.n_1 = { id: 'n_1', x: 30, y: 0, ancho: 20, texto: 'Vsalida = V · R2 / (R1 + R2)', formato: { tinta: 'gris', contorno: 'ninguno' } }
    const f = fragmentoDeSeleccion(d, todo(d), lib)!
    const bytes = empaquetarPlantilla(f, { nombre: 'Con nota', descripcion: '' }, lib, '0.0.1')
    const r = leerPlantilla(bytes, 'x')
    if (!r.ok) throw new Error(r.error)
    const g = fragmentoParaColocar(r.fragmento, true)
    expect(g.notas).toHaveLength(1)
    expect(g.notas[0]).toMatchObject({ texto: 'Vsalida = V · R2 / (R1 + R2)', formato: { tinta: 'gris', contorno: 'ninguno' } })
    const ed = new Editor(lib, undefined, idSecuencial(), { registrar: () => {} })
    ed.tolerancia = 0.5
    ed.cargar(documentoVacio())
    expect(ed.empezarColocarFragmento(g, { x: 100, y: 100 })).toBe(true)
    ed.abajo({ x: 100, y: 100 })
    ed.arriba({ x: 100, y: 100 })
    const notas = Object.values(ed.doc.notas)
    expect(notas).toHaveLength(1)
    const rel = (x: number) => x - Math.min(...Object.values(ed.doc.piezas).map((p) => p.x))
    const relOrig = f.notas[0].x - Math.min(...f.piezas.map((p) => p.x))
    expect(rel(notas[0].x)).toBeCloseTo(relOrig, 5)
    expect(notas[0].formato).toEqual({ tinta: 'gris', contorno: 'ninguno' })
  })
  it('una incluida sigue sin traer sus notas', () => {
    const d = divisor()
    d.notas.n_1 = { id: 'n_1', x: 30, y: 0, ancho: 20, texto: 'x', formato: { tinta: 'gris', contorno: 'ninguno' } }
    expect(fragmentoParaColocar(fragmentoDeSeleccion(d, todo(d), lib)!).notas).toEqual([])
  })
})

describe('cambiar la descripción de una plantilla', () => {
  const base = () => {
    const d = divisor()
    return empaquetarPlantilla(fragmentoDeSeleccion(d, todo(d), lib)!, { nombre: 'Divisor', descripcion: 'Antes.' }, lib, '0.0.1')
  }
  it('cambia solo la descripción: el circuito, el nombre y la miniatura quedan como estaban', () => {
    const a = base()
    const r = conDescripcion(a, 'Después, con otra frase.')
    if (!r.ok) throw new Error(r.error)
    const antes = unzipSync(a), despues = unzipSync(r.bytes)
    expect(Object.keys(despues).sort()).toEqual(Object.keys(antes).sort())
    for (const k of ['circuito.json', 'manifest.json', ENTRADA_VISTA]) expect(strFromU8(despues[k]), k).toBe(strFromU8(antes[k]))
    expect(JSON.parse(strFromU8(despues[ENTRADA_META]))).toEqual({ nombre: 'Divisor', descripcion: 'Después, con otra frase.' })
    const leida = leerPlantilla(r.bytes, 'x')
    expect(leida.ok && leida.meta).toEqual({ nombre: 'Divisor', descripcion: 'Después, con otra frase.' })
  })
  it('usa la misma validación que el diálogo de guardar: limpia los caracteres inválidos, recorta a 300 y admite vaciarla', () => {
    const larga = conDescripcion(base(), 'x'.repeat(MAX_DESCRIPCION + 50) + ' ')
    if (!larga.ok) throw new Error(larga.error)
    const l = leerPlantilla(larga.bytes, 'x')
    expect(l.ok && l.meta.descripcion.length).toBe(MAX_DESCRIPCION)
    const vacia = conDescripcion(base(), '   ')
    if (!vacia.ok) throw new Error(vacia.error)
    const v = leerPlantilla(vacia.bytes, 'x')
    expect(v.ok && v.meta.descripcion).toBe('')
  })
  it('conserva las sondas que viajan con el instrumento (formato 5) y los textos fijados', () => {
    const d = divisor()
    d.piezas.p_o = { id: 'p_o', tipo: 'osciloscopio', ref: 'XSC1', x: 60, y: -8, rot: 0, espejo: false, props: {} }
    d.sondas = { s_1: { id: 's_1', tipo: 'osciloscopio', x: 0, y: -6, instrumento: 'p_o', entrada: 'A' } }
    d.piezas.p_r1.textos = { ref: { lugar: 'abajo' } }
    const bytes = empaquetarPlantilla(fragmentoDeSeleccion(d, todo(d), lib)!, { nombre: 'N', descripcion: 'a' }, lib, '0.0.1')
    const r = conDescripcion(bytes, 'b')
    if (!r.ok) throw new Error(r.error)
    const l = leerPlantilla(r.bytes, 'x')
    if (!l.ok) throw new Error(l.error)
    expect(l.fragmento.sondas).toHaveLength(1)
    expect(l.fragmento.piezas.find((p) => p.ref === 'R1')!.textos!.ref).toEqual({ lugar: 'abajo' })
  })
  it('un archivo que no es un zip o es una bomba se rechaza con un motivo', () => {
    expect(conDescripcion(new Uint8Array([1, 2, 3, 4, 5]), 'x')).toMatchObject({ ok: false })
    const grande = zipSync({ 'circuito.json': strToU8('x'.repeat(3 * 2 ** 20)), 'manifest.json': strToU8('{}') })
    const r = conDescripcion(grande, 'x')
    expect(r).toMatchObject({ ok: false })
  })
})
