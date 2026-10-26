import { describe, expect, it } from 'vitest'
import type { ResultadoAbrir } from '../compartido/archivos'
import { abrirSoltadoCon } from './soltado'

const RES: ResultadoAbrir = { ok: false, error: 'x', recientes: [] }

describe('abrirSoltadoCon (preload)', () => {
  it('la ruta sale del File en el preload y es lo único que viaja al proceso principal', async () => {
    const pedidas: string[] = []
    const f = new File(['x'], 'p.kir')
    const abrir = abrirSoltadoCon((g) => (g === f ? 'C:\\Users\\ana\\p.kir' : ''), async (r) => (pedidas.push(r), RES))
    expect(await abrir(f)).toBe(RES)
    expect(pedidas).toEqual(['C:\\Users\\ana\\p.kir'])
  })

  it('ataque: un File armado en la página (sin ruta) o algo que no es File no llega al proceso principal', async () => {
    const pedidas: string[] = []
    const abrir = abrirSoltadoCon(
      (g) => {
        if (!(g instanceof File)) throw new TypeError('no es un File')
        return ''
      },
      async (r) => (pedidas.push(r), RES)
    )
    expect(await abrir(new File(['x'], '\\\\atacante@80\\s\\x.kir'))).toBeNull()
    expect(await abrir('\\\\atacante@80\\s\\x.kir' as unknown as File)).toBeNull()
    expect(await abrir({ name: 'x.kir', path: '\\\\atacante\\s\\x.kir' } as unknown as File)).toBeNull()
    expect(pedidas).toEqual([])
  })
})
