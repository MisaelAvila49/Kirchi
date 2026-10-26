import { describe, expect, it } from 'vitest'
import { bytesDeSonda, MEMORIA_SONDAS, MUESTRAS_CANAL, MUESTRAS_MULTIMETRO, repartirMemoria } from './memoria'

describe('reparto de la memoria de las sondas', () => {
  it('un osciloscopio y un multímetro caben con sus tamaños completos', () => {
    const m = repartirMemoria(['canal', 'canal', 'canal', 'canal', 'multimetro', 'multimetro'])
    expect(m).toEqual([MUESTRAS_CANAL, MUESTRAS_CANAL, MUESTRAS_CANAL, MUESTRAS_CANAL, MUESTRAS_MULTIMETRO, MUESTRAS_MULTIMETRO])
  })

  it('con más canales, los canales bajan a la mitad hasta caber en 16 MiB', () => {
    // Dos osciloscopios caben con 131,072 por canal (14.4 MB); tres, con 65,536 (12.2 MB).
    expect((repartirMemoria(Array<'canal'>(8).fill('canal')) as number[]).every((x) => x === MUESTRAS_CANAL / 2)).toBe(true)
    const usos = Array<'canal'>(12).fill('canal')
    const m = repartirMemoria(usos) as number[]
    expect(m.every((x) => x === MUESTRAS_CANAL / 4)).toBe(true)
    expect(m.reduce((s, x) => s + bytesDeSonda(x), 0)).toBeLessThanOrEqual(MEMORIA_SONDAS)
  })

  it('sin sondas no reserva nada y con demasiadas lo dice', () => {
    expect(repartirMemoria([])).toEqual([])
    expect(typeof repartirMemoria(Array<'canal'>(80).fill('canal'))).toBe('string')
  })

  it('el tamaño de una sonda es el del motor (Sonda::bytes_de)', () => {
    expect(bytesDeSonda(262_144)).toBe(262_144 * 12 + 4096 * 56 + 256 * 8)
  })
})
