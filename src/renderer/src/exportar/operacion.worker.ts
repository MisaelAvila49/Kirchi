import init, { Simulator } from '../sim/pkg/kirchi_engine.js'
import type { NetlistMotor } from '../netlist/netlist'
import { resolverOperacion, tamañosDe, type CrudoOperacion } from './operacion'

export interface PedidoOperacion {
  netlist: NetlistMotor
  h: number
}
export type RespuestaOperacion = { ok: true; crudo: CrudoOperacion } | { ok: false; error: string }

const ctx = self as unknown as { postMessage(m: RespuestaOperacion): void; onmessage: ((e: MessageEvent<PedidoOperacion>) => void) | null }

/** Un solo trabajo: resuelve el punto de operación y responde. */
ctx.onmessage = async (e) => {
  try {
    const { memory } = await init()
    const { netlist, h } = e.data
    const crudo = resolverOperacion(new Simulator(JSON.stringify(netlist), h), memory, tamañosDe(netlist))
    ctx.postMessage({ ok: true, crudo })
  } catch (err) {
    ctx.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
