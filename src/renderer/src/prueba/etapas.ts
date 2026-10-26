import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NetlistMotor } from '../netlist/netlist'

/** El amplificador de emisor común de las referencias de ngspice (2N2222, señal de 20 mV a 1 kHz). */
export const AMPLIFICADOR: NetlistMotor = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../engine/referencias/ec_amplificador.json'), 'utf8')).netlist

/** `k` etapas como esa en cadena, con la alimentación de 12 V y la señal comunes: 4 redes y 9 elementos por etapa (5 y 10 con un LED en serie con el colector, como en el circuito de la e2e). */
export function etapas(k: number, conLed = false): NetlistMotor {
  const q = AMPLIFICADOR.elements.find((e): e is Extract<NetlistMotor['elements'][number], { type: 'Q' }> => e.type === 'Q')!
  const el: NetlistMotor['elements'] = [
    { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 12 } },
    { type: 'V', a: 2, b: 0, wave: { kind: 'sine', offset: 0, amp: 0.02, freq: 1000 } }
  ]
  let n = 3
  for (let i = 0; i < k; i++) {
    const [b, c, e, o] = [n, n + 1, n + 2, n + 3]
    n += 4
    const a = conLed ? n++ : c
    el.push(
      { type: 'C', a: 2, b, farads: 1e-6 },
      { type: 'R', a: 1, b, ohms: 47000 },
      { type: 'R', a: b, b: 0, ohms: 10000 },
      { type: 'R', a: 1, b: a, ohms: 2200 },
      { type: 'R', a: e, b: 0, ohms: 470 },
      { type: 'C', a: e, b: 0, farads: 1e-5 },
      { type: 'C', a: c, b: o, farads: 1e-6 },
      { type: 'R', a: o, b: 0, ohms: 10000 },
      { ...q, c, b, e }
    )
    if (conLed) el.push({ type: 'D', a, b: c, is: 1e-14, n: 1 })
  }
  return { nodes: n, elements: el }
}

