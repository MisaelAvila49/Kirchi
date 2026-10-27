/**
 * Texto de los subcircuitos de ngspice del termistor, la fotorresistencia y el motor a pasos. Lo comparten el exportador y
 * `scripts/referencias-ngspice.mjs`, para que los análisis y las referencias del motor usen exactamente las mismas ecuaciones.
 * Sin importaciones y solo con sintaxis que Node borra al leer, para que el script lo cargue directo.
 */

export interface ParamsTermistor {
  tipo: 'ntc' | 'ptc'
  r25: number
  beta: number
  /** Tabla R/T de pares [°C, Ω], ascendente en temperatura; sustituye a la fórmula de `beta`. */
  rt?: [number, number][]
  delta: number
  tau: number
  /** La temperatura ambiente entra por un tercer terminal `amb` (volts = °C) en lugar del parámetro: para referencias con ambiente variable. */
  ambNodo?: boolean
}

export interface ParamsLdr {
  r10: number
  gamma: number
  roscuro: number
  tau_sube: number
  tau_baja: number
  /** La luz entra por un tercer terminal `lux` (volts = lx) y `lux0` es la inicial: para referencias con luz variable. */
  luxNodo?: boolean
}

export interface ParamsPasos {
  unipolar?: boolean
  r: number
  l: number
  k_mutua?: number
  km: number
  dientes: number
  td: number
  j: number
  bm: number
}

const num = (v: number): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Un parámetro del subcircuito no es un número finito.')
  return Object.is(v, -0) ? '0' : String(v)
}
/** Un número dentro de una expresión: los negativos entre paréntesis. */
const np = (v: number): string => (v < 0 ? `(${num(v)})` : num(v))

/**
 * Termistor con calentamiento propio. Terminales `a b` y parámetro `amb` (°C, la temperatura ambiente del canal).
 * El nodo `th` es el calentamiento en kelvin: la potencia v²/R entra a una conductancia `delta` y una capacidad `tau`·`delta`.
 */
export function subcircuitoTermistor(nombre: string, p: ParamsTermistor): string {
  const signo = p.tipo === 'ptc' ? -1 : 1
  const tc = p.ambNodo ? 'v(amb)+v(th)' : 'amb+v(th)'
  let r: string
  if (p.rt && p.rt.length >= 2) {
    const t0 = p.rt[0][0]
    const tn = p.rt[p.rt.length - 1][0]
    const pares = p.rt.map(([t, ohms]) => `${num(t)},${num(Math.log(ohms))}`).join(',')
    r = `exp(pwl(min(max(${tc},${np(t0)}),${np(tn)}),${pares}))`
  } else {
    const tk = `min(max(${tc}+273.15,100),3000)`
    r = `${num(p.r25)}*exp(${signo === 1 ? '' : '-'}${num(p.beta)}*(1/${tk}-1/298.15))`
  }
  return [
    p.ambNodo ? `.subckt ${nombre} a b amb` : `.subckt ${nombre} a b params: amb=25`,
    `bres rt 0 v=min(max(${r},1e-6),1e15)`,
    'bi a b i=(v(a)-v(b))/v(rt)',
    'bp 0 th i=(v(a)-v(b))*(v(a)-v(b))/v(rt)',
    `rth th 0 ${num(1 / p.delta)}`,
    `cth th 0 ${num(p.tau * p.delta)}`,
    '.ends'
  ].join('\n')
}

/**
 * Fotorresistencia. Terminales `a b` y parámetro `lux`. El nodo `s` es la conductancia normalizada (g · r10) que sigue a la de la luz
 * con `tau_sube` o `tau_baja` según la dirección, y arranca en su régimen.
 */
export function subcircuitoLdr(nombre: string, p: ParamsLdr): string {
  const g = num(p.gamma)
  const piso = num(p.r10 / p.roscuro)
  if (p.luxNodo) {
    return [
      `.subckt ${nombre} a b lux params: lux0=10`,
      `.param obj0={max((max(lux0,0)/10)^${g},${piso})}`,
      `bobj obj 0 v=max((max(v(lux),0)/10)^${g},${piso})`,
      `bs 0 s i=(v(obj)-v(s))/(v(s)<v(obj) ? ${num(p.tau_sube)} : ${num(p.tau_baja)})`,
      'cs s 0 1 ic={obj0}',
      `bi a b i=(v(a)-v(b))*v(s)/${num(p.r10)}`,
      '.ends'
    ].join('\n')
  }
  return [
    `.subckt ${nombre} a b params: lux=10`,
    `.param obj={max((max(lux,0)/10)^${g},${piso})}`,
    `bs 0 s i=(obj-v(s))/(v(s)<obj ? ${num(p.tau_sube)} : ${num(p.tau_baja)})`,
    'cs s 0 1 ic={obj}',
    `bi a b i=(v(a)-v(b))*v(s)/${num(p.r10)}`,
    '.ends'
  ].join('\n')
}

/**
 * Motor a pasos de dos fases. Terminales `a1 a2 b1 b2` (bipolar) o `a1 a2 b1 b2 ca cb` (unipolar) y parámetro `tc`, el par de carga
 * (N·m) ya dividido por la reducción. Los nodos `w` (rad/s) y `th` (rad) son la velocidad y el ángulo del rotor.
 */
export function subcircuitoPasos(nombre: string, p: ParamsPasos): string {
  const uni = p.unipolar === true
  const L: string[] = [`.subckt ${nombre} a1 a2 b1 b2${uni ? ' ca cb' : ''} params: tc=0`]
  const n = num(p.dientes)
  L.push(`bga ga 0 v=-sin(${n}*v(th))`, `bgb gb 0 v=cos(${n}*v(th))`)
  // Cada rama: R, L, un medidor de corriente y la fuerza contraelectromotriz km · ω · g.
  const rama = (id: string, de: string, a: string, g: string): void => {
    L.push(`r${id} ${de} p${id} ${num(p.r)}`, `l${id} p${id} q${id} ${num(p.l)}`, `vs${id} q${id} e${id} dc 0`, `be${id} e${id} ${a} v=${num(p.km)}*v(w)*v(${g})`)
  }
  const corrientes: Record<string, string[]> = { a: [], b: [] }
  if (uni) {
    // Las dos mitades de una fase comparten la toma: la segunda se recorre de la toma al extremo, y así el acoplamiento es positivo.
    rama('a1', 'a1', 'ca', 'ga')
    rama('a2', 'ca', 'a2', 'ga')
    rama('b1', 'b1', 'cb', 'gb')
    rama('b2', 'cb', 'b2', 'gb')
    const k = num(p.k_mutua ?? 0.99)
    L.push(`ka la1 la2 ${k}`, `kb lb1 lb2 ${k}`)
    corrientes.a = ['a1', 'a2']
    corrientes.b = ['b1', 'b2']
  } else {
    rama('a', 'a1', 'a2', 'ga')
    rama('b', 'b1', 'b2', 'gb')
    corrientes.a = ['a']
    corrientes.b = ['b']
  }
  const suma = (fase: string): string => corrientes[fase].map((id) => `i(vs${id})`).join('+')
  const te = `${num(p.km)}*((${suma('a')})*v(ga)+(${suma('b')})*v(gb))-${num(p.td)}*sin(4*${n}*v(th))-tc*tanh(v(w)/0.1)`
  L.push(`bt 0 w i=${te}`, `cj w 0 ${num(p.j)} ic=0`, `rfric w 0 ${num(1 / p.bm)}`, 'bth 0 th i=v(w)', 'cth th 0 1 ic=0', 'rth th 0 1e12', '.ends')
  return L.join('\n')
}

/** Genera el subcircuito de una clase por su nombre: lo usa el script de referencias con los parámetros en JSON. */
export function generarSubcircuito(clase: string, nombre: string, params: unknown): string {
  switch (clase) {
    case 'termistor':
      return subcircuitoTermistor(nombre, params as ParamsTermistor)
    case 'ldr':
      return subcircuitoLdr(nombre, params as ParamsLdr)
    case 'pasos':
      return subcircuitoPasos(nombre, params as ParamsPasos)
    default:
      throw new Error(`No hay generador de subcircuito para «${clase}».`)
  }
}
