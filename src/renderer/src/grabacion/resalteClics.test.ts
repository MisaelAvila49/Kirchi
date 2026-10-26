import { describe, expect, it } from 'vitest'
import { DURACION_RESALTE_MS, instalarResalte, type DepsResalte } from './resalteClics'

function montar(activo = true) {
  const estado = { activo, anillos: [] as string[], quitados: [] as string[], esperas: [] as { f: () => void; ms: number }[], oyente: null as null | ((x: number, y: number) => void), escuchando: false }
  const d: DepsResalte = {
    escuchar: (f) => {
      estado.oyente = f
      estado.escuchando = true
      return () => void (estado.escuchando = false)
    },
    poner: (x, y) => {
      const id = `${x},${y}`
      estado.anillos.push(id)
      return () => void estado.quitados.push(id)
    },
    esperar: (f, ms) => void estado.esperas.push({ f, ms }),
    activo: () => estado.activo
  }
  return { estado, quitar: instalarResalte(d) }
}

describe('resalte de clics', () => {
  it('dibuja un anillo en el punto del clic y lo quita a los 400 ms', () => {
    const { estado } = montar()
    estado.oyente!(120, 80)
    expect(estado.anillos).toEqual(['120,80'])
    expect(estado.esperas[0].ms).toBe(400)
    expect(DURACION_RESALTE_MS).toBe(400)
    expect(estado.quitados).toEqual([])
    estado.esperas[0].f()
    expect(estado.quitados).toEqual(['120,80'])
  })
  it('no dibuja nada si no se está grabando', () => {
    const { estado } = montar(false)
    estado.oyente!(1, 2)
    expect(estado.anillos).toEqual([])
    estado.activo = true
    estado.oyente!(3, 4)
    expect(estado.anillos).toEqual(['3,4'])
  })
  it('al desinstalar deja de escuchar', () => {
    const { estado, quitar } = montar()
    quitar()
    expect(estado.escuchando).toBe(false)
  })
})
