import { describe, expect, it } from 'vitest'
import type { AjustesOsciloscopio } from '../../instrumentos/ajustes'
import { CANALES_PANTALLA, CIFRAS_COLUMNA, MUESTRAS_CSV, type PantallaSab } from '../../sim/protocoloInstrumentos'
import { csvDeCaptura, esComentarioCsv, lineasDeCaptura } from './exportarCaptura'

const a: AjustesOsciloscopio = {
  canales: (['A', 'B', 'C', 'D'] as const).map((canal) => ({ canal, on: canal === 'A' || canal === 'B', vdiv: canal === 'A' ? 1 : 0.5, pos: 0, acople: canal === 'B' ? 'AC' : 'DC' })),
  matematico: false, base: 1e-3, disparoCentro: false, disparo: { fuente: 'A', subida: true, nivel: 0.5, modo: 'auto' }, medidas: [{ canal: 'A', medida: 'vpp' }], ideal: false
}

function pantalla(huecoB = false): PantallaSab {
  const ncol = 100
  const columnas = new Float32Array(CANALES_PANTALLA * ncol * CIFRAS_COLUMNA)
  for (let j = 0; j < ncol; j++) columnas.set([0.25, 0.25, 0.25, 0.25, 0], (1 * ncol + j) * CIFRAS_COLUMNA)
  const muestras = new Float32Array(CANALES_PANTALLA * MUESTRAS_CSV)
  for (let k = 0; k < MUESTRAS_CSV; k++) {
    muestras[k] = k / 1000
    muestras[MUESTRAS_CSV + k] = huecoB && k < 10 ? Number.NaN : 0.25
  }
  const medidas = Array.from({ length: CANALES_PANTALLA }, () => Array.from({ length: 8 }, () => ({ valor: 2, razon: '' as const })))
  return {
    version: 3, t0: 0.01, dt: 1e-4, ncol, tDisparo: 0.011, estado: 'disparado', tCaptura: 0.02, csv: { t0: 0.01, dt: 5e-6, n: MUESTRAS_CSV },
    completoHasta: Array(CANALES_PANTALLA).fill(0.02), medidas, columnas, muestras
  }
}

describe('exportar una captura', () => {
  it('el CSV: cabecera con los ajustes, nombres y 2,001 renglones con punto decimal y comas', () => {
    const csv = csvDeCaptura('XSC1', a, pantalla()).trimEnd().split('\n')
    expect(csv[0]).toBe('# Kirchi · osciloscopio XSC1')
    expect(csv[1]).toBe('# Base de tiempo: 1 ms/div; disparo: A; subida; 500 mV; Automático')
    expect(csv[2]).toBe('# A: 1 V/div DC; B: 500 mV/div AC')
    expect(csv[3]).toBe('# Captura a t = 20.00 ms; 2001 instantes cada 5.000 µs')
    expect(csv[4]).toBe('# t = 0 es el inicio de la captura (t simulado = 10.00 ms).')
    expect(csv[5]).toBe('t (s),A (V),B (V)')
    expect(csv).toHaveLength(6 + MUESTRAS_CSV)
    // El tiempo parte de 0 en el inicio de la captura, no en el tiempo simulado de la pantalla.
    expect(csv[6]).toBe('0,0,0.25')
    expect(csv[6 + 1000]).toBe('0.005,1,0.25')
    expect(csv.every((l) => !l.startsWith('#') || !l.includes(','))).toBe(true)
  })

  it('un instante que el búfer no cubre sale de la columna de la pantalla y la cabecera lo dice', () => {
    const csv = csvDeCaptura('XSC1', a, pantalla(true)).trimEnd().split('\n')
    expect(csv[5]).toBe('# Algunos valores salen de las columnas de la pantalla: el búfer de muestras no cubría esos instantes.')
    expect(csv[7]).toBe('0,0,0.25')
  })

  it('una pantalla sin muestras (decisión P20) sale toda de sus columnas, con 2,001 renglones', () => {
    const p = { ...pantalla(), csv: { t0: 0.01, dt: 5e-6, n: 0 } }
    const csv = csvDeCaptura('XSC1', a, p).trimEnd().split('\n')
    expect(csv[3]).toBe('# Captura a t = 20.00 ms; 2001 instantes cada 5.000 µs')
    expect(csv[5]).toBe('# Los valores salen de las columnas de la pantalla: la captura no trae sus muestras.')
    expect(csv).toHaveLength(7 + MUESTRAS_CSV)
    // El canal A no tiene columnas en la prueba (todas en 0) y el B, 0.25.
    expect(csv[7]).toBe('0,0,0.25')
  })

  /** Las celdas de un CSV leídas como una hoja de cálculo (RFC 4180: comillas dobles, "" dentro). */
  function celdas(csv: string): string[][] {
    const filas: string[][] = [[]]
    let celda = ''
    let entre = false
    for (let i = 0; i < csv.length; i++) {
      const ch = csv[i]
      if (entre) {
        if (ch === '"' && csv[i + 1] === '"') (celda += '"'), i++
        else if (ch === '"') entre = false
        else celda += ch
      } else if (ch === '"' && celda === '') entre = true
      else if (ch === ',') filas.at(-1)!.push(celda), (celda = '')
      else if (ch === '\n') filas.at(-1)!.push(celda), (celda = ''), filas.push([])
      else celda += ch
    }
    if (celda !== '') filas.at(-1)!.push(celda)
    return filas.filter((f) => f.length)
  }

  it('el texto del documento no se vuelve fórmula al abrir el CSV en una hoja de cálculo (OWASP), y los números siguen números', () => {
    // Una referencia escrita a propósito: con comas abriría celdas nuevas y con =, +, -, @, tabulador o retorno al principio
    // la hoja de cálculo la evaluaría como fórmula.
    for (const ref of ['=HYPERLINK("http://x","clic")', 'XSC1,=1+1,@SUM(A1),+2', '-2+3', '@A1', '\tX', 'a"b\nc']) {
      const p = pantalla()
      for (let k = 0; k < MUESTRAS_CSV; k++) p.muestras[k] = -0.5 - k / 1000
      const tabla = celdas(csvDeCaptura(ref, a, p))
      for (const f of tabla)
        for (const c of f) {
          const numero = c !== '' && Number.isFinite(Number(c))
          if (!numero) expect(c, `«${c}» con la referencia ${JSON.stringify(ref)}`).not.toMatch(/^[=+\-@\t\r]/)
        }
      // La primera línea es una sola celda con la referencia entera (con la comilla de escape si hacía falta).
      expect(tabla[0]).toHaveLength(1)
      expect(tabla[0][0]).toContain(ref.replace(/^[=+\-@\t\r]/, ''))
      // Los valores negativos son números, sin comilla.
      const datos = tabla.find((f) => f[0] === '0')!
      expect(datos[1]).toBe('-0.5')
    }
  })

  it('un renglón de comentario escapado con comilla (referencia con coma) también cuenta como comentario', () => {
    const csv = csvDeCaptura('X,1', a, pantalla()).split('\n')
    expect(csv[0]).toBe('"# Kirchi · osciloscopio X,1"')
    expect(esComentarioCsv(csv[0])).toBe(true)
    expect(esComentarioCsv('# Kirchi')).toBe(true)
    expect(esComentarioCsv('t (s),A (V)')).toBe(false)
    expect(esComentarioCsv('0,0.25')).toBe(false)
  })

  it('un hueco interior de un canal sale con celdas vacías y un comentario con su rango', () => {
    const p = pantalla()
    // El canal B pierde las columnas 40 a 49 (t simulado 0.014 a 0.015 s) y vuelve a tener dato después.
    for (let j = 40; j < 50; j++) p.columnas[(1 * 100 + j) * CIFRAS_COLUMNA + 4] = 8
    const lineas = csvDeCaptura('XSC1', a, p).trimEnd().split('\n')
    const aviso = lineas.find((l) => l.startsWith('# B: sin datos'))
    expect(aviso).toBe('# B: sin datos de t = 4.000 ms a 5.000 ms (hueco en la captura); sus celdas van vacías.')
    const datos = lineas.filter((l) => /^\d/.test(l)).map((l) => l.split(','))
    const dentro = datos.filter((f) => Number(f[0]) >= 0.004 && Number(f[0]) < 0.005)
    expect(dentro.length).toBeGreaterThan(100)
    expect(dentro.every((f) => f[2] === '')).toBe(true)
    // Antes y después del hueco el canal sí tiene valor, y A nunca queda vacío.
    expect(datos.find((f) => Number(f[0]) === 0.003)![2]).toBe('0.25')
    expect(datos.find((f) => Number(f[0]) === 0.006)![2]).toBe('0.25')
    expect(datos.every((f) => f[1] !== '')).toBe(true)
  })

  it('las líneas del PNG: escalas con la letra de cada canal, el disparo, las medidas y el tiempo', () => {
    const l = lineasDeCaptura('XSC1', a, pantalla())
    expect(l.map((x) => x.map((s) => s.texto).join(''))).toEqual([
      'XSC1 · 1 ms/div · disparo A subida 500 mV · Automático',
      'A 1 V/div DC   B 500 mV/div AC',
      'A Vpp 2.000 V',
      'Captura a t = 20.00 ms'
    ])
    expect(l[1].filter((s) => s.canal).map((s) => s.canal)).toEqual(['A', 'B'])
  })
})
