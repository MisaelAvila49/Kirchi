import init, { Simulator } from '../sim/pkg/kirchi_engine.js'

export { Simulator }

let memoria: WebAssembly.Memory | null = null

/** Carga el WASM del motor desde sus bytes (sin worker ni red). Cargarlo otra vez devuelve la misma memoria. */
export async function cargarMotor(wasm: Uint8Array): Promise<WebAssembly.Memory> {
  if (!memoria) memoria = (await init({ module_or_path: wasm })).memory
  return memoria
}

/** La memoria del motor ya cargado; falla si nadie lo cargó. */
export function memoriaDelMotor(): WebAssembly.Memory {
  if (!memoria) throw new Error('El motor no está cargado.')
  return memoria
}

export const motorCargado = (): boolean => memoria !== null
