import { describe, expect, it } from 'vitest'
import type { FromWorker, ToWorker } from './protocol'
import { MAX_ELEMENTS, MAX_NODES, MAX_REDES_DIGITALES, readSim, SAB_LENGTH, SLOT, writeSim } from './protocol'

describe('protocolo de memoria compartida', () => {
  it('lo escrito se lee igual y aumenta la secuencia', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 1.25, 0.98, 37, [0, 5, 4.3, 4.1], [1e-3, 2e-3])
    writeSim(view, 1.5, 1, 40, [0, 0, 0.2, 4.0], [-5e-3, 5e-3])
    const r = readSim(view, 4, 2)
    expect(r.time).toBe(1.5)
    expect(r.ratio).toBe(1)
    expect(r.capacity).toBe(40)
    expect(r.seq).toBe(2)
    expect(Array.from(r.voltages)).toEqual([0, 0, 0.2, 4.0])
    expect(Array.from(r.currents)).toEqual([-5e-3, 5e-3])
    // La secuencia es un entero que sube de 2 en 2 (impar mientras se escribe).
    expect(Atomics.load(new Int32Array(view.buffer), SLOT.seq * 2) % 2).toBe(0)
  })

  it('la lectura es una copia', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 0, 1, 1, [0, 1], [3])
    const r = readSim(view, 2, 1)
    view[SLOT.voltages + 1] = 9
    view[SLOT.currents] = 9
    expect(r.voltages[1]).toBe(1)
    expect(r.currents[0]).toBe(3)
  })

  it('la segunda lectura y el estado de cada elemento van después de las corrientes', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 0, 1, 1, [0, 1], [3, 4], [5e-6, 940], [1, 0])
    const r = readSim(view, 2, 2)
    expect(Array.from(r.aux)).toEqual([5e-6, 940])
    expect(Array.from(r.estado)).toEqual([1, 0])
    expect(SLOT.aux).toBe(SLOT.currents + MAX_ELEMENTS)
    expect(SLOT.estado).toBe(SLOT.aux + MAX_ELEMENTS)
  })

  it('el nivel y las tres medidas de cada red digital van después del estado de los elementos', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 0, 1, 1, [0, 1], [3], [0], [1], [1, 2], [1000, 0.5, 7, 0, 0, 1])
    const r = readSim(view, 2, 1, 2)
    expect(Array.from(r.niveles)).toEqual([1, 2])
    expect(Array.from(r.medidas)).toEqual([1000, 0.5, 7, 0, 0, 1])
    // Sin redes digitales las dos listas vienen vacías.
    expect(readSim(view, 2, 1).niveles).toHaveLength(0)
    expect(SLOT.niveles).toBe(SLOT.estado + MAX_ELEMENTS)
    expect(SLOT.medidas).toBe(SLOT.niveles + MAX_REDES_DIGITALES)
    expect(SLOT.promedio).toBe(SLOT.medidas + 3 * MAX_REDES_DIGITALES)
    // La potencia media de cada elemento y la rapidez, al final.
    expect(SLOT.promedioP).toBe(SLOT.promedioI + MAX_ELEMENTS)
    expect(SLOT.rapidez).toBe(SLOT.promedioP + MAX_ELEMENTS)
    // El instante en que se cerró el promedio: una lectura que lo repite no lo vuelve a contar (el quemado, los destellos).
    expect(SLOT.promedioFin).toBe(SLOT.rapidez + 1)
    expect(SAB_LENGTH).toBe(SLOT.promedioFin + 1)
  })

  it('el promedio del intervalo va después, dentro del mismo seqlock; sin escribirlo se conserva y con null se anula', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 0, 1, 1, [0, 1], [3], [0], [0], [], [], { duracion: 0.1, voltajes: [0, 0.9], corrientes: [2.9] })
    expect(readSim(view, 2, 1).promedio).toEqual({ duracion: 0.1, fin: 0, voltages: Float64Array.from([0, 0.9]), currents: Float64Array.from([2.9]), potencias: Float64Array.from([0]) })
    writeSim(view, 0.5, 1, 1, [0, 1], [3], [0], [0], [], [], { duracion: 0.1, fin: 0.5, voltajes: [0, 0.9], corrientes: [2.9] })
    expect(readSim(view, 2, 1).promedio?.fin).toBe(0.5)
    writeSim(view, 0.01, 1, 1, [0, 1], [3])
    expect(readSim(view, 2, 1).promedio?.voltages[1]).toBe(0.9)
    writeSim(view, 0.02, 1, 1, [0, 1], [3], [0], [0], [], [], null)
    expect(readSim(view, 2, 1).promedio).toBeNull()
  })

  it('el tope de redes digitales es el del motor', () => {
    expect(MAX_REDES_DIGITALES).toBe(4096)
  })

  it('las corrientes caben después de todos los voltajes', () => {
    expect(SLOT.currents).toBe(SLOT.voltages + MAX_NODES)
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 0, 1, 1, new Float64Array(MAX_NODES).fill(7), new Float64Array(MAX_ELEMENTS).fill(2))
    const r = readSim(view, MAX_NODES, MAX_ELEMENTS)
    expect(r.voltages.every((v) => v === 7)).toBe(true)
    expect(r.currents.every((v) => v === 2)).toBe(true)
  })

  it('una escritura a medias (secuencia impar) no se acepta: se reintenta y se avisa que la lectura no es consistente', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 1, 1, 1, [0, 1], [2])
    const i32 = new Int32Array(view.buffer)
    // El escritor empezó otra escritura y dejó el tiempo a medias.
    Atomics.add(i32, SLOT.seq * 2, 1)
    view[SLOT.time] = 99
    const r = readSim(view, 2, 1)
    expect(r.consistente).toBe(false)
    Atomics.add(i32, SLOT.seq * 2, 1)
    const ok = readSim(view, 2, 1)
    expect(ok.consistente).toBe(true)
    expect(ok.seq).toBe(2)
    expect(ok.time).toBe(99)
  })

  it('una escritura que ocurre durante la copia hace repetirla', () => {
    const view = new Float64Array(SAB_LENGTH)
    writeSim(view, 1, 1, 1, [0, 1], [2])
    let veces = 0
    // Escribe a mitad de la primera copia, como lo haría el worker.
    const espia = new Proxy(view, {
      get(t, k) {
        if (k === 'slice' && veces++ === 0) {
          return (...a: [number, number]) => {
            writeSim(t, 2, 1, 1, [0, 7], [3])
            return t.slice(...a)
          }
        }
        const v = Reflect.get(t, k)
        return typeof v === 'function' ? v.bind(t) : v
      }
    }) as Float64Array
    const r = readSim(espia, 2, 1)
    expect(r.consistente).toBe(true)
    expect(r.time).toBe(2)
    expect(Array.from(r.voltages)).toEqual([0, 7])
    expect(Array.from(r.currents)).toEqual([3])
  })
})

describe('mensaje de perilla', () => {
  it('lleva canal, valor y secuencia, y su rechazo se distingue del paso por indice -1 - canal', () => {
    const m: ToWorker = { type: 'perilla', canal: 0, valor: 85, seq: 4 }
    const r: FromWorker = { type: 'rechazado', id: 1, indice: -1 - m.canal, message: 'canal 0: la cola de cambios está llena', seq: m.seq }
    expect(r.indice).toBe(-1)
    expect(JSON.parse(JSON.stringify(m))).toEqual(m)
  })
})
