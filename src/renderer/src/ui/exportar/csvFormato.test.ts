import { describe, expect, it } from 'vitest'
import { aplicarFormatoCsv } from './csvFormato'
import { tablaDeCsv } from './csvTabla'

const filas = Array.from({ length: 25 }, (_, i) => `${i},${i * 2}`)
const csv = ['# Kirchi · OSC1', '"# A: 1 V/div, B: 2 V/div"', 't (s),A (V)', ...filas].join('\n') + '\n'

describe('formato del CSV exportado', () => {
  it('con coma y todas las muestras no toca nada', () => {
    expect(aplicarFormatoCsv(csv, { separadorCsv: 'coma', muestreoCsv: 1 })).toBe(csv)
  })

  it('punto y coma y tabulador cambian el separador, protegen los comentarios que lo llevan y lo dicen', () => {
    const pc = aplicarFormatoCsv(csv, { separadorCsv: 'punto-y-coma', muestreoCsv: 1 })
    expect(pc).toContain('0;0\n1;2\n')
    expect(pc).toContain('t (s);A (V)')
    expect(pc).toContain('# A: 1 V/div, B: 2 V/div')
    expect(pc).toContain('# Separador: punto y coma; decimal: punto.')
    const tab = aplicarFormatoCsv(csv, { separadorCsv: 'tab', muestreoCsv: 1 })
    expect(tab).toContain('t (s)\tA (V)\n0\t0\n')
    const t = tablaDeCsv(tab, 5, '\t')
    expect(t.columnas).toEqual(['t (s)', 'A (V)'])
    expect(t.total).toBe(25)
  })

  it('un comentario con el separador nuevo va entre comillas', () => {
    const pc = aplicarFormatoCsv('# a; b\nx,y\n1,2\n', { separadorCsv: 'punto-y-coma', muestreoCsv: 1 })
    expect(pc.split('\n')[0]).toBe('"# a; b"')
    expect(tablaDeCsv(pc, 5, ';').comentarios[0]).toBe('# a; b')
  })

  it('una de cada 10 conserva el primero, cada décimo y el último', () => {
    const r = aplicarFormatoCsv(csv, { separadorCsv: 'coma', muestreoCsv: 10 })
    const datos = r.split('\n').filter((l) => /^\d+,/.test(l))
    expect(datos.map((l) => l.split(',')[0])).toEqual(['0', '10', '20', '24'])
    expect(r).toContain('# Muestreo: una de cada 10')
  })

  it('cada bloque (un Bode) se reduce por separado y conserva su último renglón', () => {
    const dos = ['x,y', ...Array.from({ length: 12 }, (_, i) => `${i},0`), '', 'z,w', ...Array.from({ length: 5 }, (_, i) => `${i},1`)].join('\n') + '\n'
    const r = aplicarFormatoCsv(dos, { separadorCsv: 'coma', muestreoCsv: 10 })
    expect(r.split(String.fromCharCode(10)).filter((l) => !l.startsWith('#'))).toEqual(['x,y', '0,0', '10,0', '11,0', '', 'z,w', '0,1', '4,1', ''])
  })
})
