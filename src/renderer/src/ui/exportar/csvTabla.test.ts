import { describe, expect, it } from 'vitest'
import { celdasDeRenglon, tablaDeCsv, tamañoDeTexto } from './csvTabla'

describe('vista previa del CSV como tabla', () => {
  it('separa comentarios, títulos y filas, y dice cuántas faltan', () => {
    const t = tablaDeCsv('# Kirchi · captura\n# Tramo: 1 ms a 8 ms\nt (s),V(IN) (V)\n0,1\n1,2\n2,3\n3,4\n', 2)
    expect(t.comentarios).toEqual(['# Kirchi · captura', '# Tramo: 1 ms a 8 ms'])
    expect(t.columnas).toEqual(['t (s)', 'V(IN) (V)'])
    expect(t.filas).toEqual([['0', '1'], ['1', '2']])
    expect(t.restantes).toBe(2)
    expect(t.total).toBe(4)
  })

  it('lee las comillas de un comentario con coma y las de una celda con comillas dobles', () => {
    expect(celdasDeRenglon('"# Kirchi · R1, R2",x')).toEqual(['# Kirchi · R1, R2', 'x'])
    expect(celdasDeRenglon('a,"b ""c""",')).toEqual(['a', 'b "c"', ''])
    const t = tablaDeCsv('"# Kirchi · OSC1, A"\nt,v\n1,2')
    expect(t.comentarios).toEqual(['# Kirchi · OSC1, A'])
  })

  it('un CSV sin datos da una tabla vacía y los bloques separados por un renglón en blanco no la rompen', () => {
    expect(tablaDeCsv('')).toMatchObject({ columnas: [], filas: [], restantes: 0, total: 0 })
    expect(tablaDeCsv('# a\nx,y\n1,2\n\nx,y\n3,4').total).toBe(3)
  })

  it('el tamaño se dice en bytes, kB o MB', () => {
    expect(tamañoDeTexto('abc')).toBe('3 B')
    expect(tamañoDeTexto('a'.repeat(37_400))).toBe('37 kB')
    expect(tamañoDeTexto('a'.repeat(2_500_000))).toBe('2.5 MB')
  })
})
