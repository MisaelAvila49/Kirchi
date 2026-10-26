import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { MAX_FIGURAS } from '../doc/figuras'
import { documentoVacio, type Documento } from '../doc/tipos'
import { divisor } from '../prueba/circuitos'
import { Historial } from '../doc/historial'
import { documentoDeDatos, ERRORES_KIR, errorDeConversion, escribirKir, FORMATO_ACTUAL, formatoDe, leerKir, leerKirCon, serializarDocumento } from './kir'

const completo = (): Documento => {
  const d = divisor()
  d.etiquetas.e1 = { id: 'e1', nombre: 'VSAL', x: 14, y: -8, rot: 0 }
  d.notas.n1 = { id: 'n1', x: 20, y: 20, ancho: 40, texto: 'Práctica 3' }
  return d
}
const zip = (archivos: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(archivos).map(([k, v]) => [k, strToU8(v)])))
const manif = (formato = FORMATO_ACTUAL) => JSON.stringify({ app: 'kirchi', formato, version: '0.0.1' })

describe('.kir', () => {
  it('ida y vuelta idéntica', () => {
    const d = completo()
    const r = leerKir(escribirKir(d, '0.0.1'))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc).toEqual(d)
      expect(r.soloLectura).toBe(false)
      expect(r.avisos).toEqual([])
    }
  })

  it('las etiquetas en sus cuatro orientaciones (las del reflejo incluidas) hacen la ida y vuelta sin pedir un formato nuevo', () => {
    const d = documentoVacio()
    for (const rot of [0, 90, 180, 270] as const) d.etiquetas[`e${rot}`] = { id: `e${rot}`, nombre: 'VCC', x: rot, y: 0, rot }
    const r = leerKir(escribirKir(d, '0.0.1'))
    expect(r.ok && r.doc).toEqual(d)
    expect(formatoDe(d)).toBe(1)
  })

  it('una nota y una figura fuera de la rejilla (Alt) hacen la ida y vuelta y piden el formato 8', () => {
    const d = documentoVacio()
    d.notas.n = { id: 'n', x: -26.8, y: 3.25, ancho: 8, texto: 'hola' }
    d.figuras = { f: { id: 'f', tipo: 'linea', x1: 0.5, y1: 0, x2: 10.75, y2: 4.1, orden: 0 } as any }
    const bytes = escribirKir(d, '0.0.1')
    const r = leerKir(bytes)
    expect(r.ok && r.doc).toEqual(d)
    expect(r.ok && r.avisos).toEqual([])
    expect(formatoDe(d)).toBe(8)
  })

  it('serialización canónica: mismo texto sin importar el orden de inserción', () => {
    const a = documentoVacio(), b = documentoVacio()
    const p1 = { id: 'p1', tipo: 't', ref: 'R1', x: 0, y: 0, rot: 0 as const, espejo: false, props: { b: '1', a: '2' } }
    const p2 = { ...p1, id: 'p2', ref: 'R2' }
    a.piezas.p1 = p1
    a.piezas.p2 = p2
    b.piezas.p2 = p2
    b.piezas.p1 = p1
    expect(serializarDocumento(a)).toBe(serializarDocumento(b))
    expect(serializarDocumento(a).indexOf('"a"')).toBeLessThan(serializarDocumento(a).indexOf('"b"'))
  })

  it('escribir dos veces da los mismos bytes', () => {
    expect(escribirKir(completo(), '0.0.1')).toEqual(escribirKir(completo(), '0.0.1'))
  })

  it.each([
    [new Uint8Array([1, 2, 3]), ERRORES_KIR.noZip],
    [zip({ 'manifest.json': manif() }), ERRORES_KIR.incompleto],
    [zip({ 'manifest.json': '{', 'circuito.json': '{}' }), ERRORES_KIR.version],
    [zip({ 'manifest.json': JSON.stringify({ app: 'otra', formato: 1 }), 'circuito.json': '{}' }), ERRORES_KIR.ajeno],
    [zip({ 'manifest.json': manif(), 'circuito.json': '{"piezas":' }), ERRORES_KIR.circuito]
  ])('rechaza archivos dañados (%#)', (bytes, mensaje) => {
    const r = leerKir(bytes)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe(mensaje)
  })

  it('los mensajes son oraciones con punto y no nombran las partes internas del archivo', () => {
    for (const m of Object.values(ERRORES_KIR)) {
      expect(m).toMatch(/^[A-ZÁÉÍÓÚ].*\.$/)
      expect(m).not.toMatch(/manifest|circuito\.json|ZIP/)
    }
  })

  it('el mensaje de conversión fallida es una oración con punto, como los demás', () => {
    expect(errorDeConversion(1)).toBe('No se pudo convertir el archivo del formato 1.')
    expect(errorDeConversion(1)).toMatch(/^[A-ZÁÉÍÓÚ].*\.$/)
  })

  it('formato más nuevo abre en solo lectura', () => {
    const r = leerKir(zip({ 'manifest.json': manif(FORMATO_ACTUAL + 1), 'circuito.json': '{}' }))
    expect(r.ok && r.soloLectura).toBe(true)
    if (r.ok) expect(r.avisos).toEqual([`El archivo es de una versión más nueva de Kirchi (formato ${FORMATO_ACTUAL + 1}): se abre en solo lectura.`])
  })

  it('descarta elementos mal formados con aviso y conserva tipos desconocidos', () => {
    const datos = {
      piezas: {
        p1: { id: 'p1', tipo: 'no-existe', ref: 'X1', x: 0, y: 0, rot: 0, espejo: false, props: {} },
        p2: { id: 'p2', tipo: 'resistencia', ref: 'R1', x: 0.5, y: 0, rot: 0, espejo: false, props: {} }
      },
      cables: { c1: { id: 'c1', puntos: [{ x: 0, y: 0 }, { x: 3, y: 4 }] } }
    }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.doc.piezas)).toEqual(['p1'])
      expect(r.doc.cables).toEqual({})
      expect(r.avisos).toEqual(['Se descartó la pieza R1: posición no entera.', 'Se descartó un cable: tramo no ortogonal.'])
    }
  })

  it('un archivo sin formato se abre y se guarda idéntico, byte por byte', () => {
    const antes = escribirKir(completo(), '0.0.1')
    const r = leerKir(antes)
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos).toEqual([])
    expect(escribirKir(r.doc, '0.0.1')).toEqual(antes)
    expect(serializarDocumento(r.doc)).not.toContain('formato')
  })

  it('un archivo con formato se abre y se guarda idéntico, byte por byte', () => {
    const d = completo()
    d.notas.n1 = { ...d.notas.n1, anchoFijo: true, formato: { fuente: 'serif', tam: 3.5, negrita: true, cursiva: true, subrayado: true, tinta: 'rojo', alinear: 'just' } }
    d.etiquetas.e1 = { ...d.etiquetas.e1, formato: { fuente: 'sans', tam: 2.5, tinta: 'azul' } }
    const antes = escribirKir(d, '0.0.1')
    const r = leerKir(antes)
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos).toEqual([])
    expect(r.doc).toEqual(d)
    expect(escribirKir(r.doc, '0.0.1')).toEqual(antes)
  })

  it('el alto fijado de una nota se abre y se guarda idéntico; sin alto, el archivo no lo menciona', () => {
    const d = completo()
    d.notas.n1 = { ...d.notas.n1, anchoFijo: true, alto: 12 }
    const antes = escribirKir(d, '0.0.1')
    const r = leerKir(antes)
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos).toEqual([])
    expect(r.doc.notas.n1.alto).toBe(12)
    expect(r.doc).toEqual(d)
    expect(escribirKir(r.doc, '0.0.1')).toEqual(antes)
    expect(serializarDocumento(completo())).not.toContain('"alto"')
  })

  it.each([[0], [-3], [2.5], [321], ['12'], [null]])('un alto %j no válido se descarta con un aviso y la nota se conserva', (alto) => {
    const datos = { notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 20, texto: 'hola', alto } } }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.notas.n1).toEqual({ id: 'n1', x: 0, y: 0, ancho: 20, texto: 'hola' })
    expect(r.avisos).toEqual(['Se descartó «alto» de la nota: debe ser un entero de 1 a 320.'])
  })

  it('el contorno de una nota y de una etiqueta se abre y se guarda idéntico; sin contorno el archivo no lo menciona', () => {
    const d = completo()
    d.notas.n1 = { ...d.notas.n1, formato: { contorno: 'ninguno', tinta: 'azul' } }
    d.etiquetas.e1 = { ...d.etiquetas.e1, formato: { contorno: 'rojo' } }
    const antes = escribirKir(d, '0.0.1')
    const r = leerKir(antes)
    if (!r.ok) throw new Error(r.error)
    expect(r.avisos).toEqual([])
    expect(r.doc).toEqual(d)
    expect(escribirKir(r.doc, '0.0.1')).toEqual(antes)
    expect(serializarDocumento(completo())).not.toContain('contorno')
  })

  it('un contorno desconocido se descarta con un aviso y el resto del formato se conserva', () => {
    const datos = { notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 20, texto: 'hola', formato: { contorno: 'auto', negrita: true } } } }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.notas.n1.formato).toEqual({ negrita: true })
    expect(r.avisos).toEqual(['Se descartó el contorno «auto» de la nota.'])
  })

  it('el formato fuera de rango o desconocido se descarta con un aviso y el texto conserva lo demás', () => {
    const datos = {
      notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 20, texto: 'hola', anchoFijo: 'sí', formato: { tam: 40, negrita: true, tinta: 'morado', brillo: 3 } } },
      etiquetas: { e1: { id: 'e1', nombre: 'VSAL', x: 0, y: 10, rot: 0, formato: { alinear: 'centro', fuente: 'comic', tam: 2.55 } } }
    }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.notas.n1).toEqual({ id: 'n1', x: 0, y: 0, ancho: 20, texto: 'hola', formato: { negrita: true } })
    expect(r.doc.etiquetas.e1).toEqual({ id: 'e1', nombre: 'VSAL', x: 0, y: 10, rot: 0 })
    // Las etiquetas se leen antes que las notas.
    expect(r.avisos).toEqual([
      'Se descartó la alineación de la etiqueta VSAL: solo las notas se alinean.',
      'Se descartó la fuente «comic» de la etiqueta VSAL.',
      'Se descartó el tamaño 2.55 mm de la etiqueta VSAL: lleva un solo decimal.',
      'Se descartó el tamaño 40 mm de la nota: el máximo es 20 mm.',
      'Se descartó la tinta «morado» de la nota.',
      'Se descartó «brillo» del formato de la nota: no es una propiedad de formato.',
      'Se descartó «anchoFijo» de la nota: solo admite true.'
    ])
  })

  it('los textos se leen en NFC y un archivo que ya está en NFC se guarda idéntico', () => {
    const combinado = 'e' + String.fromCharCode(0x301)
    const datos = {
      notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 20, texto: 'pr' + combinado + 'ctica' } },
      etiquetas: { e1: { id: 'e1', nombre: 'V' + combinado, x: 0, y: 10, rot: 0 } }
    }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.notas.n1.texto).toBe('pr' + String.fromCharCode(0xe9) + 'ctica')
    expect(r.doc.etiquetas.e1.nombre).toBe('V' + String.fromCharCode(0xe9))
    const antes = escribirKir(r.doc, '0.0.1')
    const otra = leerKir(antes)
    if (!otra.ok) throw new Error(otra.error)
    expect(escribirKir(otra.doc, '0.0.1')).toEqual(antes)
  })

  it('una nota más angosta que 5 mm se ajusta al leerla y avisa', () => {
    const datos = { notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 1, texto: 'hola' } } }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.notas.n1.ancho).toBe(4)
    expect(r.avisos).toEqual(['Se ajustó el ancho de la nota a 5 mm.'])
  })

  it('un formato con los valores por omisión escritos se lee sin formato', () => {
    const datos = { notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 20, texto: 'hola', formato: { tam: 2, fuente: 'sans', tinta: 'tinta' } } } }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.notas.n1).not.toHaveProperty('formato')
    expect(r.avisos).toEqual([])
  })

  it('5,000 piezas y 5,000 cables se escriben y leen en menos de 500 ms', () => {
    const d = documentoVacio()
    for (let i = 0; i < 5000; i++) {
      d.piezas[`p${i}`] = { id: `p${i}`, tipo: 'resistencia', ref: `R${i + 1}`, x: (i % 70) * 16, y: Math.floor(i / 70) * 16, rot: 0, espejo: false, props: { valor: '1k' } }
      d.cables[`c${i}`] = { id: `c${i}`, puntos: [{ x: (i % 70) * 16 + 4, y: Math.floor(i / 70) * 16 }, { x: (i % 70) * 16 + 12, y: Math.floor(i / 70) * 16 }] }
    }
    const t0 = performance.now()
    const bytes = escribirKir(d, '0.0.1')
    const r = leerKir(bytes)
    const ms = performance.now() - t0
    console.log(`kir 5000: ${bytes.length} bytes, ${ms.toFixed(0)} ms`)
    expect(r.ok).toBe(true)
    expect(ms).toBeLessThan(500)
  })
})

describe('.kir: lectura segura', () => {
  const pieza = (o: object = {}) => ({ id: 'p1', tipo: 't', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {}, ...o })
  const leer = (datos: unknown) => leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))

  it('no descomprime archivos ajenos (zip bomb)', () => {
    const bytes = zipSync({
      'manifest.json': strToU8(manif()),
      'circuito.json': strToU8('{}'),
      'relleno.bin': [new Uint8Array(100 * 2 ** 20), { level: 9 }]
    })
    const t0 = performance.now()
    const r = leerKir(bytes)
    expect(r.ok).toBe(true)
    expect(performance.now() - t0).toBeLessThan(200)
  })

  it('rechaza un circuito.json demasiado grande', () => {
    const bytes = zipSync({ 'manifest.json': strToU8(manif()), 'circuito.json': [new Uint8Array(65 * 2 ** 20).fill(32), { level: 9 }] })
    const r = leerKir(bytes)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('demasiado grande')
  })

  it('descarta campos extra y ids inválidos, y no contamina el prototipo', () => {
    const r = leer({ piezas: { p1: pieza({ extra: 1, props: { a: '1', ['__proto__']: 'x' } }), '__proto__': pieza({ id: '__proto__' }), 'a:b': pieza({ id: 'a:b' }) } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.doc.piezas)).toEqual(['p1'])
      expect(r.doc.piezas.p1).toEqual(pieza({ props: { a: '1' } }))
      expect(r.avisos).toContain('Se descartó la propiedad «__proto__» de la pieza R1.')
      expect(r.avisos.some((a) => a.includes('identificador inválido'))).toBe(true)
      expect(({} as Record<string, unknown>).x).toBeUndefined()
    }
  })

  it('limita coordenadas y valida etiquetas, notas y cables', () => {
    const r = leer({
      piezas: { p1: pieza({ x: 2 ** 20 + 1 }) },
      etiquetas: { e1: { id: 'e1', nombre: '  ', x: 0, y: 0, rot: 0 } },
      notas: { n1: { id: 'n1', x: 0, y: 0, ancho: 0, texto: 'a' } },
      cables: { c1: { id: 'c1', puntos: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }, c2: { id: 'c2', puntos: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 }] } }
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.piezas).toEqual({})
      expect(r.doc.etiquetas).toEqual({})
      expect(r.doc.notas).toEqual({})
      expect(Object.keys(r.doc.cables)).toEqual(['c2'])
      expect(r.doc.cables.c2.puntos).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }])
      expect(r.avisos).toContain('Se descartó la pieza R1: posición fuera de rango.')
      expect(r.avisos).toContain('Se descartó un cable: menos de dos puntos.')
      expect(r.avisos).toContain('Se descartó una etiqueta de red: sin nombre.')
      expect(r.avisos).toContain('Se descartó una nota: posición fuera de rango.')
    }
  })

  it('una colección dañada se descarta entera con un aviso', () => {
    const r = leer({ piezas: [1, 2], notas: 'x' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.avisos).toEqual(['Se descartaron las piezas: la lista está dañada.', 'Se descartaron las notas: la lista está dañada.'])
  })

  it('documentoDeDatos valida como un archivo y rechaza lo que no es un objeto', () => {
    const d = completo()
    expect(documentoDeDatos(JSON.parse(serializarDocumento(d)))).toEqual({ doc: d, avisos: [] })
    expect(documentoDeDatos({ cables: { c1: { id: 'c1', puntos: [{ x: 0, y: 0 }, { x: 3, y: 4 }] } } })?.avisos).toEqual(['Se descartó un cable: tramo no ortogonal.'])
    for (const v of [null, 3, 'x', []]) expect(documentoDeDatos(v)).toBeNull()
  })

  it('una migración que falla o falta devuelve error', () => {
    const bytes = zip({ 'manifest.json': manif(1), 'circuito.json': '{}' })
    const falla = leerKirCon(bytes, { 1: () => { throw new Error('x') } }, 2)
    expect(falla.ok).toBe(false)
    if (!falla.ok) expect(falla.error).toContain('No se pudo convertir el archivo del formato 1')
    expect(leerKirCon(bytes, {}, 2).ok).toBe(false)
    expect(leerKirCon(bytes, { 1: (d) => d }, 2).ok).toBe(true)
  })

  it('el historial congela los elementos del documento leído y del reemplazado', () => {
    const r = leerKir(escribirKir(completo(), '0.0.1'))
    if (!r.ok) throw new Error('no leyó')
    const h = new Historial(r.doc)
    expect(Object.isFrozen(Object.values(h.doc.piezas)[0])).toBe(true)
    const r2 = leerKir(escribirKir(completo(), '0.0.1'))
    if (!r2.ok) throw new Error('no leyó')
    h.reemplazar(r2.doc)
    expect(Object.isFrozen(Object.values(h.doc.cables)[0])).toBe(true)
  })
})

describe('.kir: texto con caracteres que XML no admite', () => {
  it('quita controles y normaliza a NFC en referencias, nombres, notas y propiedades', () => {
    const d = completo()
    const circuito = JSON.parse(serializarDocumento(d))
    circuito.piezas.p_r1 = { ...Object.values<any>(circuito.piezas)[0], id: 'p_r1', ref: 'R\u000B1', props: { valor: '4\u00007' } }
    circuito.etiquetas.e1.nombre = 'VS\u0001AL'
    circuito.notas.n1.texto = 'Ome\u0301ga\uFFFE'
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(circuito) }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.doc.piezas.p_r1.ref).toBe('R1')
      expect(r.doc.piezas.p_r1.props.valor).toBe('47')
      expect(r.doc.etiquetas.e1.nombre).toBe('VSAL')
      expect(r.doc.notas.n1.texto).toBe('Oméga')
    }
  })
})

describe('.kir: identificadores peligrosos', () => {
  it.each(['__proto__', 'constructor', 'prototype'])('el id «%s» se descarta como inválido y no toca el prototipo', (id) => {
    const pieza = (i: string, ref: string) => `{"id":"${i}","tipo":"resistencia","ref":"${ref}","x":0,"y":0,"rot":0,"espejo":false,"props":{}}`
    const json = `{"piezas":{"${id}":${pieza(id, 'R9')},"p1":${pieza('p1', 'R1')}},"cables":{},"etiquetas":{},"notas":{}}`
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': json }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(Object.keys(r.doc.piezas)).toEqual(['p1'])
      expect(Object.getPrototypeOf(r.doc.piezas)).toBe(Object.prototype)
      expect(Object.getOwnPropertyNames(r.doc.piezas)).toEqual(['p1'])
      expect(r.avisos).toEqual(['Se descartó la pieza R9: identificador inválido.'])
    }
  })
})

describe('.kir: tabla de alimentaciones (formato 2)', () => {
  const terminal = (id: string, ref: string, props: Record<string, string>) => ({ id, tipo: 'alimentacion', ref, x: 0, y: 0, rot: 0 as const, espejo: false, props })
  const formatoDe = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato
  const leer = (datos: unknown) => leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
  const viejo = (piezas: Record<string, unknown>) => zip({ 'manifest.json': manif(1), 'circuito.json': JSON.stringify({ piezas, cables: {}, etiquetas: {}, notas: {} }) })

  it('el formato actual es 7 (análisis); un archivo de formato 2 se abre y se puede editar', () => {
    expect(FORMATO_ACTUAL).toBe(8)
    const d = completo()
    d.piezas.t1 = terminal('t1', 'PWR1', { nombre: 'VCC' })
    const r = leerKir(zip({ 'manifest.json': manif(2), 'circuito.json': serializarDocumento(d) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.soloLectura).toBe(false)
    expect(r.doc).toEqual(d)
  })

  it('un circuito sin terminales ni rieles se escribe en formato 1 y con los mismos bytes que antes', () => {
    const d = completo()
    expect(formatoDe(escribirKir(d, '0.0.1'))).toBe(1)
    expect(serializarDocumento(d)).not.toMatch(/alimentaciones/)
    // Una tabla vacía (el último riel volvió al de omisión) no deja rastro.
    expect(escribirKir({ ...d, alimentaciones: {} }, '0.0.1')).toEqual(escribirKir(d, '0.0.1'))
  })

  it('con un terminal o un riel se escribe en formato 2 (una versión anterior lo abre en solo lectura) y la tabla va de ida y vuelta', () => {
    const d = completo()
    d.piezas.t1 = terminal('t1', 'PWR1', { nombre: 'VCC' })
    expect(formatoDe(escribirKir(d, '0.0.1'))).toBe(2)
    d.alimentaciones = { a_1: { id: 'a_1', nombre: 'VCC', voltaje: '15' } }
    const r = leerKir(escribirKir(d, '0.0.1'))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc).toEqual(d)
    expect(r.avisos).toEqual([])
  })

  it('una tabla con rieles malos los descarta con aviso: voltaje que no se lee, nombre que ya es un voltaje, nombre repetido', () => {
    const r = leer({
      alimentaciones: {
        a1: { id: 'a1', nombre: 'VCC', voltaje: 'mucho' },
        a2: { id: 'a2', nombre: '+15V', voltaje: '3' },
        a3: { id: 'a3', nombre: 'VEE', voltaje: '-12' },
        a4: { id: 'a4', nombre: 'VEE', voltaje: '-9' },
        a5: { id: 'a5', nombre: '', voltaje: '5' }
      }
    })
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.alimentaciones).toEqual({ a3: { id: 'a3', nombre: 'VEE', voltaje: '-12' } })
    expect(r.avisos).toEqual([
      'Se descartó el riel VCC: voltaje no válido.',
      'Se descartó el riel +15V: su nombre ya es un voltaje.',
      'Se descartó el riel VEE: está repetido.',
      'Se descartó un riel: sin nombre.'
    ])
  })

  it('al escribir se descartan los rieles que ningún terminal usa (por la llave del nombre: «V−» usa el riel «V-»)', () => {
    const d = completo()
    d.piezas.t1 = terminal('t1', 'PWR1', { nombre: 'V−' })
    d.piezas.t2 = terminal('t2', 'PWR2', {})
    d.alimentaciones = {
      a_1: { id: 'a_1', nombre: 'V-', voltaje: '-9' },
      a_2: { id: 'a_2', nombre: 'VCC', voltaje: '12' },
      a_3: { id: 'a_3', nombre: 'VDD', voltaje: '3.3' }
    }
    const r = leerKir(escribirKir(d, '0.0.1'))
    if (!r.ok) throw new Error(r.error)
    // VDD no tiene terminales: no se guarda. VCC es el de t2 (sin nombre).
    expect(Object.keys(r.doc.alimentaciones!)).toEqual(['a_1', 'a_2'])
    // Sin ningún riel usado, la tabla no se escribe.
    const sinUsar = { ...completo(), alimentaciones: { a_3: d.alimentaciones.a_3 } }
    expect(escribirKir(sinUsar, '0.0.1')).toEqual(escribirKir(completo(), '0.0.1'))
  })

  it('dos rieles con la misma llave («V-» y «V−») son el mismo: el segundo se descarta por repetido', () => {
    const r = leer({ alimentaciones: { a1: { id: 'a1', nombre: 'V-', voltaje: '-9' }, a2: { id: 'a2', nombre: 'V−', voltaje: '-12' } } })
    if (!r.ok) throw new Error(r.error)
    expect(Object.keys(r.doc.alimentaciones!)).toEqual(['a1'])
    expect(r.avisos).toEqual(['Se descartó el riel V−: está repetido.'])
  })

  it('un archivo de formato 1 pasa el voltaje de cada terminal a su riel y lo quita de la pieza', () => {
    const r = leerKir(viejo({ t1: terminal('t1', 'PWR1', { nombre: 'VCC', voltaje: '12' }), t2: terminal('t2', 'PWR2', { nombre: 'VCC', voltaje: '12' }), t3: terminal('t3', 'PWR3', { voltaje: '3.3' }) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.soloLectura).toBe(false)
    expect(Object.values(r.doc.piezas).map((p) => p.props)).toEqual([{ nombre: 'VCC' }, { nombre: 'VCC' }, {}])
    // t3 no tenía nombre: es VCC, y su 3.3 V discrepa del primero.
    expect(Object.values(r.doc.alimentaciones!).map(({ nombre, voltaje }) => [nombre, voltaje])).toEqual([['VCC', '12']])
    expect(r.avisos).toEqual(['VCC tenía 12 V y 3.3 V en PWR1 y PWR3: se usó 12 V. Renombra uno como «+3.3V».'])
  })

  it('formato 1: una pieza con id «__proto__» se descarta como identificador inválido y no deja riel', () => {
    const bytes = zip({ 'manifest.json': manif(1), 'circuito.json': '{"piezas":{"__proto__":{"id":"__proto__","tipo":"alimentacion","ref":"PWR9","x":0,"y":0,"rot":0,"espejo":false,"props":{"nombre":"VCC","voltaje":"12"}},"t1":' + JSON.stringify(terminal('t1', 'PWR1', { nombre: 'VDD', voltaje: '5' })) + '},"cables":{},"etiquetas":{},"notas":{}}' })
    const r = leerKir(bytes)
    if (!r.ok) throw new Error(r.error)
    expect(Object.keys(r.doc.piezas)).toEqual(['t1'])
    expect(Object.getPrototypeOf(r.doc.piezas)).toBe(Object.prototype)
    expect(r.doc.alimentaciones ?? {}).toEqual({})
    expect(r.avisos).toEqual(['Se descartó la pieza PWR9: identificador inválido.'])
  })

  it('formato 1: los nombres y voltajes se limpian antes de agruparlos, la raya corta es un menos y los avisos no llevan caracteres de control', () => {
    const r = leerKir(viejo({ t1: terminal('t1', 'PWR\u00011', { nombre: 'V\u0001CC', voltaje: '–12' }), t2: terminal('t2', 'PWR2', { nombre: 'VCC', voltaje: '7' }) }))
    if (!r.ok) throw new Error(r.error)
    expect(Object.values(r.doc.alimentaciones!).map(({ nombre, voltaje }) => [nombre, voltaje])).toEqual([['VCC', '–12']])
    expect(r.avisos).toEqual(['VCC tenía -12 V y 7 V en PWR1 y PWR2: se usó -12 V. Renombra uno como «+7V».'])
  })

  it('un riel con un voltaje enorme o con caracteres de control se valida ya limpio', () => {
    const r = leer({ alimentaciones: { a1: { id: 'a1', nombre: 'VCC', voltaje: '1' + '0'.repeat(400) }, a2: { id: 'a2', nombre: 'VEE', voltaje: '-\u00019' } } })
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.alimentaciones).toEqual({ a2: { id: 'a2', nombre: 'VEE', voltaje: '-9' } })
    expect(r.avisos).toEqual(['Se descartó el riel VCC: voltaje no válido.'])
  })

  it('el nombre de un terminal se recorta a 24 caracteres al leerlo', () => {
    const r = leer({ piezas: { t1: terminal('t1', 'PWR1', { nombre: '1'.repeat(310) + 'V' }) } })
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.piezas.t1.props.nombre).toHaveLength(24)
    expect(r.avisos).toEqual(['Se recortó el nombre de PWR1 a 24 caracteres.'])
  })

  it('formato 1: el VCC simétrico del amplificador (5, 15 y −15 V) se abre con 5 V y un aviso que propone los nombres', () => {
    const r = leerKir(viejo({ t1: terminal('t1', 'PWR1', { nombre: 'VCC', voltaje: '5' }), t2: terminal('t2', 'PWR2', { nombre: 'VCC', voltaje: '15' }), t3: terminal('t3', 'PWR3', { nombre: 'VCC', voltaje: '-15' }) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.alimentaciones ?? {}).toEqual({})
    expect(r.avisos).toEqual(['VCC tenía 5 V, 15 V y -15 V en PWR1, PWR2 y PWR3: se usó 5 V. Renombra los demás con su voltaje, como «+15V» y «-15V».'])
  })

  it('formato 1: un voltaje igual al de omisión no se guarda, uno que no se lee se descarta con aviso, y un nombre con voltaje manda', () => {
    const r = leerKir(viejo({ t1: terminal('t1', 'PWR1', { nombre: 'VEE', voltaje: '-5' }), t2: terminal('t2', 'PWR2', { nombre: 'VDD', voltaje: 'mucho' }), t3: terminal('t3', 'PWR3', { nombre: '+12V', voltaje: '5' }), t4: terminal('t4', 'PWR4', { nombre: '+5V', voltaje: '5' }) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.alimentaciones ?? {}).toEqual({})
    expect(Object.values(r.doc.piezas).every((p) => !('voltaje' in p.props))).toBe(true)
    expect(r.avisos).toEqual(['Se descartó el voltaje «mucho» de PWR2: no es un valor válido.', '+12V tenía 5 V en PWR3: ahora el voltaje sale del nombre (12 V).'])
  })
})

describe('.kir: textos movidos a mano (formato 3)', () => {
  const formatoDe = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato
  const leer = (datos: unknown) => leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify(datos) }))
  const conTextos = (textos: unknown) => ({ piezas: { p1: { id: 'p1', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0, espejo: false, props: {}, textos } } })

  it('van de ida y vuelta, y solo con ellos el archivo pasa a formato 3 (una versión anterior lo abre en solo lectura)', () => {
    const d = completo()
    expect(formatoDe(escribirKir(d, '0.0.1'))).toBe(1)
    d.piezas.p_r1 = { ...d.piezas.p_r1, textos: { ref: { lugar: 'abajo-izquierda' }, valor: { x: 3.25, y: -4 } } }
    const bytes = escribirKir(d, '0.0.1')
    expect(formatoDe(bytes)).toBe(3)
    const r = leerKir(bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.doc).toEqual(d)
    expect(r.avisos).toEqual([])
  })

  it('volver todo a su lugar automático quita el campo y el archivo vuelve a su formato y a sus bytes de antes', () => {
    const d = completo()
    const antes = escribirKir(d, '0.0.1')
    const sin = { ...d, piezas: { ...d.piezas, p_r1: { ...d.piezas.p_r1, textos: {} } } }
    expect(escribirKir(sin, '0.0.1')).toEqual(antes)
  })

  it('lo que no vale se descarta con un aviso y la pieza se queda: lugar desconocido, coordenadas fuera de tope, llaves de más', () => {
    const r = leer(conTextos({ ref: { lugar: 'centro' }, valor: { x: 2, y: 1e9 }, otro: { lugar: 'abajo' } }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.piezas.p1).not.toHaveProperty('textos')
    expect(r.avisos).toEqual(['Se descartó la posición a mano de 3 textos de R1: no es válida.'])
    const bien = leer(conTextos({ ref: { lugar: 'derecha' }, valor: 'abajo' }))
    if (!bien.ok) throw new Error(bien.error)
    expect(bien.doc.piezas.p1.textos).toEqual({ ref: { lugar: 'derecha' } })
    expect(bien.avisos).toEqual(['Se descartó la posición a mano de un texto de R1: no es válida.'])
  })

  it('un campo dañado (no es un objeto, o trae __proto__) no tira la pieza ni toca prototipos', () => {
    for (const textos of [[1, 2], 'abajo', 7, null]) {
      const r = leer(conTextos(textos))
      if (!r.ok) throw new Error(r.error)
      expect(r.doc.piezas.p1).not.toHaveProperty('textos')
      expect(r.avisos).toEqual(['Se descartó la posición a mano de los textos de R1: no es válida.'])
    }
    const r = leerKir(zip({ 'manifest.json': manif(), 'circuito.json': '{"piezas":{"p1":{"id":"p1","tipo":"resistencia","ref":"R1","x":0,"y":0,"rot":0,"espejo":false,"props":{},"textos":{"__proto__":{"lugar":"abajo"},"ref":{"lugar":"abajo"}}}}}' }))
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.piezas.p1.textos).toEqual({ ref: { lugar: 'abajo' } })
    expect(Object.getPrototypeOf(r.doc.piezas.p1.textos)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).lugar).toBeUndefined()
  })
})

describe('.kir: figuras de dibujo (formato 4)', () => {
  const formatoDe = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['manifest.json'])).formato
  const leer = (figuras: unknown) => leerKir(zip({ 'manifest.json': manif(), 'circuito.json': JSON.stringify({ figuras }) }))
  const marco = { id: 'f_1', tipo: 'rectangulo' as const, x1: -4, y1: -12, x2: 20, y2: 12, orden: 0, tinta: 'azul' as const, grosor: 0.35 as const, relleno: true as const }
  const flecha = { id: 'f_2', tipo: 'flecha' as const, x1: 30, y1: -10, x2: 16, y2: -6, orden: 1, punta: 'dos' as const, trazo: 'guiones' as const }

  it('van de ida y vuelta, y solo con ellas el archivo pasa a formato 4', () => {
    const d = completo()
    expect(formatoDe(escribirKir(d, '0.0.1'))).toBe(1)
    d.figuras = { f_1: marco, f_2: flecha }
    const bytes = escribirKir(d, '0.0.1')
    expect(formatoDe(bytes)).toBe(4)
    const r = leerKir(bytes)
    if (!r.ok) throw new Error(r.error)
    expect(r.doc).toEqual(d)
    expect(r.avisos).toEqual([])
    expect(escribirKir(r.doc, '0.0.1')).toEqual(bytes)
  })

  it('un circuito sin figuras (o con la colección vacía) queda con sus bytes y su formato de antes', () => {
    const d = completo()
    const antes = escribirKir(d, '0.0.1')
    expect(escribirKir({ ...d, figuras: {} }, '0.0.1')).toEqual(antes)
    expect(serializarDocumento(d)).not.toContain('figuras')
    // Textos movidos a mano y figuras: manda el formato más nuevo.
    d.piezas.p_r1 = { ...d.piezas.p_r1, textos: { ref: { lugar: 'abajo' } } }
    expect(formatoDe(escribirKir(d, '0.0.1'))).toBe(3)
    d.figuras = { f_1: marco }
    expect(formatoDe(escribirKir(d, '0.0.1'))).toBe(4)
  })

  it('una figura dañada se descarta con su motivo y un valor alterado con su aviso, sin tirar las demás', () => {
    const r = leer({
      f_1: { ...marco, x2: 'veinte' },
      f_2: { ...flecha, grosor: 3 },
      f_3: { id: 'otra', tipo: 'linea', x1: 0, y1: 0, x2: 4, y2: 0, orden: 0 }
    })
    if (!r.ok) throw new Error(r.error)
    expect(Object.keys(r.doc.figuras ?? {})).toEqual(['f_2'])
    // El grosor alterado ya no está: la flecha queda con el de omisión.
    expect(r.doc.figuras?.f_2).toEqual({ id: 'f_2', tipo: 'flecha', x1: 30, y1: -10, x2: 16, y2: -6, orden: 1, punta: 'dos', trazo: 'guiones' })
    expect(r.avisos).toEqual([
      'Se descartó una figura: posición no válida.',
      'Se descartó «grosor» de una figura: debe ser 0.25, 0.35, 0.5 o 0.7.',
      'Se descartó una figura: su id no coincide con la llave.'
    ])
  })

  it('una lista de figuras dañada se descarta entera con un aviso; vacía, el documento no trae la colección', () => {
    const r = leer([1, 2])
    if (!r.ok) throw new Error(r.error)
    expect(r.doc).not.toHaveProperty('figuras')
    expect(r.avisos).toEqual(['Se descartaron las figuras: la lista está dañada.'])
    const v = leer({})
    if (!v.ok) throw new Error(v.error)
    expect(v.doc).not.toHaveProperty('figuras')
  })

  it('más figuras que el tope: se quedan las primeras con un aviso y el archivo se abre', () => {
    const muchas: Record<string, unknown> = {}
    for (let i = 0; i < MAX_FIGURAS + 3; i++) muchas[`f_${i}`] = { id: `f_${i}`, tipo: 'linea', x1: 0, y1: i, x2: 4, y2: i, orden: i }
    const r = leer(muchas)
    if (!r.ok) throw new Error(r.error)
    expect(Object.keys(r.doc.figuras ?? {})).toHaveLength(MAX_FIGURAS)
    expect(r.doc.figuras?.f_0).toBeDefined()
    expect(r.avisos).toEqual([`Se descartaron 3 figuras: un circuito admite hasta ${MAX_FIGURAS.toLocaleString('es-MX')}.`])
  })

  it('un archivo de formato 3 se abre igual y se puede editar', () => {
    const d = completo()
    const r = leerKir(zip({ 'manifest.json': manif(3), 'circuito.json': serializarDocumento(d) }))
    if (!r.ok) throw new Error(r.error)
    expect(r.soloLectura).toBe(false)
    expect(r.doc).toEqual(d)
  })
})
