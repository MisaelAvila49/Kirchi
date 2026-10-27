import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// @ts-expect-error módulo .mjs de scripts, sin tipos
import { aplicarTablas } from './aplicar-datos.mjs'
// @ts-expect-error módulo .mjs de scripts, sin tipos
import { formatearDatos, reemplazarDatos } from './formatoDatos.mjs'

const CON_FUENTES = `{
  "id": "a",
  "pines": [{ "id": "1", "x": 0 }],
  "fuentes": {
    "X": "texto con \\" comillas, llaves { } y corchetes ]"
  },
  "limites": { "v": 1 }
}
`
const SIN_FUENTES = `{
  "id": "b",
  "props": []
}
`
const DATOS = {
  por: 'modelo',
  equivalencias: { falstad: 't', kicad: 'Device:Q_NPN_EBC' },
  valores: {
    '2N3904': {
      comprobado: { fecha: '2026-10-26', fuente: 'hoja' },
      fabricante: 'onsemi',
      presentaciones: [{ patillas: { E: '1', B: '2', C: '3' }, encapsulado: 'TO-92', lcsc: { numero: 'C1', sinVerificar: true } }],
      pendiente: { hoja: 'x' }
    },
    BC547: { virtual: true }
  }
}

let raiz: string
const validador = (archivos: Record<string, string>) => {
  const errores: string[] = []
  for (const [ruta, texto] of Object.entries(archivos)) {
    if (!ruta.endsWith('pieza.json')) continue
    const d = JSON.parse(texto)
    if (d.datos && 'malo' in d.datos) errores.push(`${ruta}: datos malo`)
  }
  return errores
}
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8')

beforeEach(() => {
  raiz = mkdtempSync(join(tmpdir(), 'datos-pieza-'))
  for (const [dir, texto] of [
    ['x/a', CON_FUENTES],
    ['x/b', SIN_FUENTES],
    ['y/c', SIN_FUENTES.replace('"b"', '"c"').replace(/\n/g, '\r\n')]
  ]) {
    mkdirSync(join(raiz, dir), { recursive: true })
    writeFileSync(join(raiz, dir, 'pieza.json'), texto)
  }
})
afterEach(() => rmSync(raiz, { recursive: true, force: true }))

describe('formato de datos', () => {
  it('inserta después de fuentes sin tocar el resto del archivo', () => {
    const r = reemplazarDatos(CON_FUENTES, DATOS)
    const i = r.indexOf('  "datos":')
    expect(r.slice(0, i)).toBe(`${CON_FUENTES.slice(0, CON_FUENTES.indexOf(',\n  "limites"'))},\n`)
    expect(r.endsWith(',\n  "limites": { "v": 1 }\n}\n')).toBe(true)
    expect(JSON.parse(r).datos.valores.BC547.virtual).toBe(true)
  })

  it('inserta al final si no hay fuentes y conserva CRLF', () => {
    const r = reemplazarDatos(SIN_FUENTES.replace(/\n/g, '\r\n'), DATOS)
    expect(r.startsWith('{\r\n  "id": "b",\r\n  "props": [],\r\n  "datos": {\r\n')).toBe(true)
    expect(r.replace(/\r\n/g, '')).not.toContain('\n')
    expect(JSON.parse(r).datos.por).toBe('modelo')
  })

  it('reemplaza un bloque existente y deja el texto fuera byte a byte', () => {
    const uno = reemplazarDatos(CON_FUENTES, DATOS)
    const dos = reemplazarDatos(uno, { ...DATOS, por: 'tipo' })
    const i = uno.indexOf('  "datos":')
    expect(dos.slice(0, i)).toBe(uno.slice(0, i))
    expect(dos.slice(dos.indexOf(',\n  "limites"'))).toBe(uno.slice(uno.indexOf(',\n  "limites"')))
    expect(JSON.parse(dos).datos.por).toBe('tipo')
  })

  it('reemplaza igual cuando datos está en medio del archivo', () => {
    const texto = '{\n  "id": "a",\n  "datos": { "valores": {} },\n  "z": 1\n}\n'
    const r = reemplazarDatos(texto, DATOS)
    expect(r.startsWith('{\n  "id": "a",\n  "datos": {')).toBe(true)
    expect(r.endsWith('},\n  "z": 1\n}\n')).toBe(true)
  })

  it('formatear dos veces el mismo contenido da el mismo texto', () => {
    const una = formatearDatos(DATOS, 2)
    expect(formatearDatos(JSON.parse(una), 2)).toBe(una)
    const archivo = reemplazarDatos(SIN_FUENTES, DATOS)
    expect(reemplazarDatos(archivo, JSON.parse(archivo).datos)).toBe(archivo)
  })

  it('pone un renglón por fila y por presentación y ordena las claves conocidas', () => {
    const texto = formatearDatos(DATOS, 2)
    const lineas = texto.split('\n')
    expect(lineas[0]).toBe('{')
    expect(lineas[1]).toBe('    "por": "modelo",')
    expect(lineas.find((l) => l.includes('"BC547"'))).toBe('      "BC547": { "virtual": true }')
    const pres = lineas.find((l) => l.includes('"encapsulado": "TO-92"'))!
    expect(pres.trim().startsWith('{ "encapsulado": "TO-92", "patillas": { "E": "1", "B": "2", "C": "3" }')).toBe(true)
    expect(lineas.every((l) => l.length <= 160)).toBe(true)
    expect(texto.indexOf('"fabricante"')).toBeLessThan(texto.indexOf('"presentaciones"'))
    expect(texto.indexOf('"pendiente"')).toBeLessThan(texto.indexOf('"comprobado"'))
    expect(texto.indexOf('"kicad"')).toBeLessThan(texto.indexOf('"falstad"'))
  })

  it('parte una presentación que no cabe en 160 columnas', () => {
    const unidades = Array.from({ length: 4 }, (_, i) => ({ nombre: `Compuerta ${i + 1}`, patillas: { A: String(i * 3 + 1), B: String(i * 3 + 2), Y: String(i * 3 + 3) } }))
    const d = { valores: { '*': { presentaciones: [{ encapsulado: 'DIP-14', patillas: { A: '1', B: '2', Y: '3' }, alimentacion: { VCC: '14', GND: '7' }, unidades }] } } }
    const t = formatearDatos(d, 2)
    expect(t.split('\n').every((l) => l.length <= 160)).toBe(true)
    expect(JSON.parse(t)).toEqual(d)
  })
})

describe('aplicar tablas', () => {
  const tabla = { a: DATOS, b: { valores: { '*': { virtual: true } } } }

  it('dos corridas dan los mismos bytes', () => {
    aplicarTablas({ tablas: [tabla], raiz, validar: validador })
    const primera = ['x/a', 'x/b'].map((d) => leer(`${d}/pieza.json`))
    const r = aplicarTablas({ tablas: [tabla], raiz, validar: validador })
    expect(r.cambios).toEqual([])
    expect(['x/a', 'x/b'].map((d) => leer(`${d}/pieza.json`))).toEqual(primera)
    expect(JSON.parse(primera[0]).datos.valores['2N3904'].fabricante).toBe('onsemi')
  })

  it('comprobar no escribe y distingue entre cambiar y no cambiar', () => {
    const r = aplicarTablas({ tablas: [tabla], raiz, comprobar: true, validar: validador })
    expect(r.cambios.sort()).toEqual(['x/a/pieza.json', 'x/b/pieza.json'])
    expect(leer('x/a/pieza.json')).toBe(CON_FUENTES)
    aplicarTablas({ tablas: [tabla], raiz, validar: validador })
    expect(aplicarTablas({ tablas: [tabla], raiz, comprobar: true, validar: validador }).cambios).toEqual([])
  })

  it('cuenta filas, presentaciones, pendientes y números sin verificar', () => {
    const r = aplicarTablas({ tablas: [tabla], raiz, comprobar: true, validar: validador })
    expect(r.resumen).toEqual({ piezas: 2, filas: 3, presentaciones: 1, pendientes: 1, sinVerificar: 1 })
  })

  it('una tabla con un error no escribe ningún archivo', () => {
    const r = aplicarTablas({ tablas: [{ a: DATOS, b: { malo: 1, valores: {} } }], raiz, validar: validador })
    expect(r.errores.length).toBe(1)
    expect(leer('x/a/pieza.json')).toBe(CON_FUENTES)
    expect(leer('x/b/pieza.json')).toBe(SIN_FUENTES)
  })

  it('una pieza que no existe aborta, salvo que se permita', () => {
    const t = { a: DATOS, nadie: { valores: {} } }
    const r = aplicarTablas({ tablas: [t], raiz, validar: validador })
    expect(r.errores[0]).toContain('nadie')
    expect(leer('x/a/pieza.json')).toBe(CON_FUENTES)
    const ok = aplicarTablas({ tablas: [t], raiz, validar: validador, permitirAusentes: true })
    expect(ok.errores).toEqual([])
    expect(ok.ausentes).toEqual(['nadie'])
    expect(JSON.parse(leer('x/a/pieza.json')).datos.por).toBe('modelo')
  })

  it('mezcla varias tablas por pieza y por fila, y avisa de un choque', () => {
    const otra = { a: { valores: { BC547: { fabricante: 'onsemi' } }, equivalencias: { ltspice: 'npn' } } }
    aplicarTablas({ tablas: [tabla, otra], raiz, validar: validador })
    const d = JSON.parse(leer('x/a/pieza.json')).datos
    expect(d.valores.BC547).toEqual({ virtual: true, fabricante: 'onsemi' })
    expect(d.equivalencias).toEqual({ falstad: 't', kicad: 'Device:Q_NPN_EBC', ltspice: 'npn' })
    const choque = aplicarTablas({ tablas: [tabla, { a: { por: 'otro', valores: {} } }], raiz, comprobar: true, validar: validador })
    expect(choque.errores[0]).toContain('por')
  })

  it('solo cuentan los errores que el cambio agrega a los que ya había', () => {
    const conPrevio = (a: Record<string, string>) => ['error previo', ...validador(a)]
    expect(aplicarTablas({ tablas: [tabla], raiz, validar: conPrevio }).errores).toEqual([])
  })
})
