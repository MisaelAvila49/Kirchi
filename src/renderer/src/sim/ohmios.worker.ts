import init, { Simulator } from './pkg/kirchi_engine.js'
import { medirOhmios, T_PUNTO_DE_OPERACION, type LecturaOhmios } from '../instrumentos/ohmetro'
import type { NetlistMotor } from '../netlist/netlist'

/** Lo que pide la ventana: la netlist, su paso y los óhmetros por medir (el elemento de cada uno y su rango de partida). */
export interface PedidoOhmios {
  netlist: NetlistMotor
  h: number
  multimetros: { id: string; elemento: number; rango: number; continuidad?: boolean }[]
}

export type RespuestaOhmios = { ok: true; lecturas: ({ id: string; continuidad?: boolean } & LecturaOhmios)[] } | { ok: false; error: string }

const ctx = self as unknown as { postMessage(m: RespuestaOhmios): void; onmessage: ((e: MessageEvent<PedidoOhmios>) => void) | null }

/** Un solo trabajo: resuelve el punto de operación de cada óhmetro con las fuentes apagadas y responde. */
ctx.onmessage = async (e) => {
  try {
    await init()
    const { netlist, h, multimetros } = e.data
    const lecturas = multimetros.map((m) => ({
      id: m.id,
      continuidad: m.continuidad,
      ...medirOhmios(netlist, m.elemento, m.rango, (json) => {
        const sim = new Simulator(json, h)
        sim.advance_to(T_PUNTO_DE_OPERACION, 1e6)
        return sim
      }, m.continuidad)
    }))
    ctx.postMessage({ ok: true, lecturas })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
