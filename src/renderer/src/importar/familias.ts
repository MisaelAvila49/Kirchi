import type { FormatoAjeno, PiezaAjena } from './ajeno'

export type ClaseAjena =
  | 'resistencia' | 'capacitor' | 'capacitor-electrolitico' | 'inductor'
  | 'diodo' | 'zener' | 'led' | 'schottky'
  | 'npn' | 'pnp' | 'nmos' | 'pmos' | 'njf' | 'pjf'
  | 'amp-op' | 'comparador' | 'regulador-positivo' | 'regulador-negativo'
  | 'fuente-voltaje' | 'fuente-corriente' | 'fuente-vcvs' | 'fuente-cccs' | 'fuente-vccs' | 'fuente-ccvs'
  | 'potenciometro' | 'interruptor' | 'tierra'
  | 'compuerta-and' | 'nand' | 'or' | 'nor' | 'xor' | 'xnor' | 'not'
  | 'entrada-logica' | 'salida-logica' | 'temporizador-555'
  | 'resistencia-pull' | 'led-bicolor' | 'zumbador' | 'motor-pasos'
  | 'bufer-244' | 'registro-164' | 'registro-165' | 'registro-595' | 'decodificador-4511' | 'decodificador-248'

/** Pieza de Kirchi más cercana a cada clase; `props` fija lo que distingue a la clase dentro de la pieza (el schottky es un diodo 1N5819). */
export interface Familia {
  pieza: string
  props?: Record<string, string>
  /** Propiedad de la pieza que elige el número de entradas. */
  entradas?: string
  /** La pieza se parece pero no es lo mismo: el informe la lista como aproximada con este motivo. */
  aproximada?: string
  /** Valor que se usa cuando el origen no trae uno numérico (una resistencia de pull-up sin valor). */
  valorPorOmision?: string
  /** Pin ajeno (en mayúsculas) a pin de Kirchi, cuando los nombres no coinciden; varios pines ajenos pueden ir al mismo. */
  pines?: Record<string, string>
}

export const FAMILIAS: Record<ClaseAjena, Familia> = {
  resistencia: { pieza: 'resistencia' },
  capacitor: { pieza: 'capacitor' },
  'capacitor-electrolitico': { pieza: 'capacitor-electrolitico' },
  inductor: { pieza: 'inductor' },
  diodo: { pieza: 'diodo' },
  zener: { pieza: 'zener' },
  led: { pieza: 'led' },
  schottky: { pieza: 'diodo', props: { modelo: '1N5819' } },
  npn: { pieza: 'npn' },
  pnp: { pieza: 'pnp' },
  nmos: { pieza: 'mosfet-n' },
  pmos: { pieza: 'mosfet-p' },
  njf: { pieza: 'jfet-n' },
  pjf: { pieza: 'jfet-p' },
  'amp-op': { pieza: 'amp-op' },
  comparador: { pieza: 'comparador' },
  'regulador-positivo': { pieza: 'regulador-positivo' },
  'regulador-negativo': { pieza: 'regulador-negativo' },
  'fuente-voltaje': { pieza: 'fuente-dc' },
  'fuente-corriente': { pieza: 'fuente-corriente' },
  'fuente-vcvs': { pieza: 'fuente-vcvs' },
  'fuente-cccs': { pieza: 'fuente-cccs' },
  'fuente-vccs': { pieza: 'fuente-vccs' },
  'fuente-ccvs': { pieza: 'fuente-ccvs' },
  potenciometro: { pieza: 'potenciometro' },
  interruptor: { pieza: 'interruptor' },
  tierra: { pieza: 'tierra' },
  'compuerta-and': { pieza: 'and', entradas: 'entradas' },
  nand: { pieza: 'nand', entradas: 'entradas' },
  or: { pieza: 'or', entradas: 'entradas' },
  nor: { pieza: 'nor', entradas: 'entradas' },
  xor: { pieza: 'xor', entradas: 'entradas' },
  xnor: { pieza: 'xnor', entradas: 'entradas' },
  not: { pieza: 'not' },
  'entrada-logica': { pieza: 'estado-logico' },
  'salida-logica': { pieza: 'punta-logica' },
  'temporizador-555': { pieza: 'temporizador-555' },
  'resistencia-pull': { pieza: 'resistencia', valorPorOmision: '10k' },
  'led-bicolor': { pieza: 'led', aproximada: 'Kirchi no tiene LED de dos colores: se importó un LED de un color.' },
  zumbador: { pieza: 'zumbador', aproximada: 'Kirchi no tiene bocina: se importó un zumbador.' },
  'motor-pasos': {
    pieza: 'motor-pasos-unipolar',
    aproximada: 'Se importó el motor a pasos unipolar 28BYJ-48 y los dos comunes quedaron unidos.',
    pines: { AC: 'COM', BC: 'COM', A1: 'A', A2: 'A2', B1: 'B', B2: 'B2' }
  },
  'bufer-244': { pieza: 'bufer-244' },
  'registro-164': { pieza: 'registro-164' },
  'registro-165': { pieza: 'registro-165' },
  'registro-595': { pieza: 'registro-595' },
  'decodificador-4511': {
    pieza: 'decodificador-7seg',
    props: { familia: 'CD4000B', salidas: 'activas en alto' },
    aproximada: 'Kirchi no tiene las entradas LT, BI y LE del 4511: quedan sin conectar.'
  },
  'decodificador-248': {
    pieza: 'decodificador-7seg',
    props: { familia: '74LS', salidas: 'activas en alto' },
    aproximada: 'Kirchi no tiene las entradas LT, BI y RBI del 74LS248: quedan sin conectar.'
  },
}

const COMPUERTAS: Record<string, ClaseAjena> = { and: 'compuerta-and', nand: 'nand', or: 'or', nor: 'nor', xor: 'xor', xnor: 'xnor' }

/** Compuerta de la serie 74xx o 4000 por su número (`00` es NAND de 2 entradas, `27` NOR de 3), con su número de entradas. */
const COMPUERTAS_74: Record<string, [ClaseAjena, number]> = {
  '00': ['nand', 2], '10': ['nand', 3], '20': ['nand', 4], '30': ['nand', 8],
  '02': ['nor', 2], '27': ['nor', 3], '4002': ['nor', 4],
  '04': ['not', 1], '08': ['compuerta-and', 2], '11': ['compuerta-and', 3], '21': ['compuerta-and', 4],
  '32': ['or', 2], '86': ['xor', 2], '266': ['xnor', 2],
  '4001': ['nor', 2], '4011': ['nand', 2], '4081': ['compuerta-and', 2], '4071': ['or', 2], '4070': ['xor', 2], '4077': ['xnor', 2], '4069': ['not', 1],
}

function de74(nombre: string): [ClaseAjena, number] | null {
  const n = nombre.toUpperCase()
  // Un 74xx1Gnn trae una sola compuerta del tipo nn.
  const m = /^74[A-Z]*1G(\d\d)/.exec(n) ?? /^74[A-Z]*?(\d{2,4})(?![\d])/.exec(n) ?? /^(?:CD|HEF|HCF)?(40\d\d)/.exec(n)
  return (m ? COMPUERTAS_74[m[1] as string] : undefined) ?? null
}

const es555 = (n: string): boolean => /^(ne|lm|tlc|icm|ca|sa)?555/i.test(n)


/** Polaridad o canal que el origen declara en una propiedad o en el nombre del modelo. */
function polaridad(p: PiezaAjena, pareja: [string, string]): string | null {
  const texto = [p.props.tipoModelo, p.props.clase, p.props.tipo, p.modelo].filter(Boolean).join(' ').toLowerCase()
  if (texto.includes(pareja[1])) return pareja[1]
  if (texto.includes(pareja[0])) return pareja[0]
  return null
}

function deSpice(p: PiezaAjena): ClaseAjena | null {
  const letra = (p.ref[0] ?? '').toUpperCase()
  const simple: Record<string, ClaseAjena> = {
    R: 'resistencia', C: 'capacitor', L: 'inductor', V: 'fuente-voltaje', I: 'fuente-corriente',
    E: 'fuente-vcvs', F: 'fuente-cccs', G: 'fuente-vccs', H: 'fuente-ccvs',
  }
  if (simple[letra]) return simple[letra]
  const modelo = (p.modelo ?? '').toLowerCase()
  if (letra === 'D') return modelo.includes('zener') ? 'zener' : modelo.includes('led') ? 'led' : modelo.includes('schottky') ? 'schottky' : 'diodo'
  const par: Record<string, [string, string]> = { Q: ['npn', 'pnp'], M: ['nmos', 'pmos'], J: ['njf', 'pjf'] }
  if (par[letra]) return polaridad(p, par[letra]) as ClaseAjena | null
  return null
}

/** Amplificadores operacionales que LTspice guarda fuera de su carpeta OpAmps. */
const OPAMPS_LTSPICE = new Set(['ad820', 'ad712', 'lt1211', 'lm308'])

function deLtspice(p: PiezaAjena): ClaseAjena | null {
  const n = p.tipo.replace(/\\/g, '/').toLowerCase()
  const base = n.split('/').pop() ?? n
  if (n.includes('opamp') || OPAMPS_LTSPICE.has(base)) return 'amp-op'
  if (base === 'ne555') return 'temporizador-555'
  if (n.startsWith('digital/')) {
    if (base === 'inv') return 'not'
    return Object.hasOwn(COMPUERTAS, base) ? COMPUERTAS[base] : null
  }
  const tabla: Record<string, ClaseAjena> = {
    res: 'resistencia', cap: 'capacitor', polcap: 'capacitor-electrolitico', ind: 'inductor', diode: 'diodo', zener: 'zener',
    led: 'led', schottky: 'schottky', npn: 'npn', pnp: 'pnp', nmos: 'nmos', pmos: 'pmos', njf: 'njf', pjf: 'pjf',
    voltage: 'fuente-voltaje', current: 'fuente-corriente', e: 'fuente-vcvs', f: 'fuente-cccs', g: 'fuente-vccs', h: 'fuente-ccvs',
  }
  return Object.hasOwn(tabla, base) ? tabla[base] : null
}

/** Los códigos de Falstad distinguen mayúsculas (`r` es resistencia, `R` es un riel). */
function deFalstad(p: PiezaAjena): ClaseAjena | null {
  const p_ = p.props.pnp === '-1' || p.props.canal === 'p'
  switch (p.tipo) {
    case 'r': return 'resistencia'
    case 'c': return 'capacitor'
    case 'l': return 'inductor'
    case 'd': return 'diodo'
    case 'z': return 'zener'
    case '162': return 'led'
    case 't': return p_ ? 'pnp' : 'npn'
    case 'f': return p_ ? 'pmos' : 'nmos'
    case 'j': return p_ ? 'pjf' : 'njf'
    case 'a': return 'amp-op'
    case 'v': return 'fuente-voltaje'
    case 'i': return 'fuente-corriente'
    case '174': return 'potenciometro'
    case 's': return 'interruptor'
    case 'g': return 'tierra'
    case '150': return 'compuerta-and'
    case '151': return 'nand'
    case '152': return 'or'
    case '153': return 'nor'
    case '154': return 'xor'
    case 'I': return 'not'
    case 'L': return 'entrada-logica'
    case 'M': return 'salida-logica'
    default: return null
  }
}

/** Símbolo de una librería de proyecto (`pic_programmer:R`, `video_schlib:C`): se clasifica por el nombre tras los dos puntos. */
function deSimbolo(nombre: string): ClaseAjena | null {
  const n = nombre.toLowerCase()
  if (/^(r|r_small|r_us|r-device|res|resistor)$/.test(n) || /^rc?\d{4}/.test(n)) return 'resistencia'
  if (/^(cp|cp1|cp_small|c_polarized|cap_elec)$/.test(n) || n.startsWith('cteb_')) return 'capacitor-electrolitico'
  if (/^(c|c_small|c-device|cap|capacitor)$/.test(n) || /^c[cl]\d{2,4}/.test(n) || /^grm\d/.test(n)) return 'capacitor'
  if (/^(l|l_small|inductor)$/.test(n)) return 'inductor'
  if (/^(d|d_small|diode)$/.test(n)) return 'diodo'
  if (/^(d_schottky|diodesch|schottky)/.test(n)) return 'schottky'
  if (/^(d_zener|zener)/.test(n)) return 'zener'
  if (n.startsWith('led')) return 'led'
  if (n.startsWith('pot') || n.startsWith('r_pot')) return 'potenciometro'
  if (/^(vdc|vsin|vpulse)$/.test(n)) return 'fuente-voltaje'
  if (n === 'idc') return 'fuente-corriente'
  const q = /^q_(npn|pnp)/.exec(n)
  return q ? (q[1] as ClaseAjena) : null
}

function deKicad(p: PiezaAjena): ClaseAjena | null {
  const [lib, nombre = ''] = p.tipo.includes(':') ? p.tipo.split(/:(.*)/s) : ['', p.tipo]
  const n = nombre.toLowerCase()
  if (lib === 'Amplifier_Operational') return 'amp-op'
  if (lib === 'Comparator') return 'comparador'
  if (lib === 'Regulator_Linear') return /^(l|lm|mc)?79/i.test(nombre) ? 'regulador-negativo' : 'regulador-positivo'
  if (lib === 'Timer') return es555(nombre) ? 'temporizador-555' : null
  if (lib.startsWith('74') || lib === '4xxx') return de74(nombre)?.[0] ?? null
  if (lib === 'power') return n === 'gnd' || n === 'earth' ? 'tierra' : null
  if (lib === 'Simulation_SPICE') {
    const t: Record<string, ClaseAjena> = {
      vdc: 'fuente-voltaje', vsin: 'fuente-voltaje', vpulse: 'fuente-voltaje', idc: 'fuente-corriente', isin: 'fuente-corriente',
      ipulse: 'fuente-corriente', esource: 'fuente-vcvs', gsource: 'fuente-vccs', fsource: 'fuente-cccs', hsource: 'fuente-ccvs',
      opamp: 'amp-op', npn: 'npn', pnp: 'pnp', nmos: 'nmos', pmos: 'pmos', diode: 'diodo',
    }
    return Object.hasOwn(t, n) ? t[n] : null
  }
  if (lib === 'Device' || lib === 'Switch') {
    if (n === 'r' || n === 'r_small' || n === 'r_us') return 'resistencia'
    if (n.startsWith('r_potentiometer') || n.startsWith('r_pot')) return 'potenciometro'
    if (n === 'c' || n === 'c_small') return 'capacitor'
    if (n.startsWith('c_polarized')) return 'capacitor-electrolitico'
    if (n === 'l' || n === 'l_small') return 'inductor'
    if (n === 'd' || n === 'd_small') return 'diodo'
    if (n.startsWith('d_zener')) return 'zener'
    if (n.startsWith('d_schottky')) return 'schottky'
    if (n.startsWith('led')) return 'led'
    if (n.startsWith('sw_')) return 'interruptor'
    const q = /^q_(npn|pnp|nmos|pmos|njfet|pjfet)/.exec(n)
    if (q) return q[1].replace('jfet', 'jf') as ClaseAjena
    return null
  }
  return lib === '' ? null : deSimbolo(nombre)
}

function deProteus(p: PiezaAjena): ClaseAjena | null {
  const n = p.tipo.toUpperCase()
  if (n === 'RES' || n === 'RESISTOR') return 'resistencia'
  if (n === 'CAP' || n === 'CAPACITOR') return 'capacitor'
  if (n.startsWith('CAP-ELEC')) return 'capacitor-electrolitico'
  if (n === 'IND' || n === 'INDUCTOR') return 'inductor'
  if (n === 'DIODE') return 'diodo'
  if (n === 'ZENER') return 'zener'
  if (/^LED-BI(BY|RG)/.test(n)) return 'led-bicolor'
  if (n.startsWith('LED')) return 'led'
  if (n === 'PULLDOWN' || n === 'PULLUP') return 'resistencia-pull'
  if (n === 'LOGICTOGGLE' || n === 'LOGICSTATE') return 'entrada-logica'
  if (n === 'SPEAKER') return 'zumbador'
  if (n === 'MOTOR-STEPPER') return 'motor-pasos'
  if (n === '4511') return 'decodificador-4511'
  const msi = /^(?:SN)?74(?:HCT?|LS|ALS|F|S)?(244|164|165|595|248)N?$/.exec(n)
  if (msi) return ({ 244: 'bufer-244', 164: 'registro-164', 165: 'registro-165', 595: 'registro-595', 248: 'decodificador-248' } as Record<string, ClaseAjena>)[msi[1] as string]!
  if (n === 'NPN') return 'npn'
  if (n === 'PNP') return 'pnp'
  if (n === 'NMOSFET' || n === 'NMOS') return 'nmos'
  if (n === 'PMOSFET' || n === 'PMOS') return 'pmos'
  if (n === 'NJF') return 'njf'
  if (n === 'PJF') return 'pjf'
  if (n === 'OPAMP') return 'amp-op'
  if (es555(n)) return 'temporizador-555'
  const g = /^(AND|NAND|OR|NOR|XOR|XNOR|NOT)(?:[-_ ]?\d)?$/.exec(n)
  if (g) return g[1] === 'NOT' ? 'not' : COMPUERTAS[(g[1] as string).toLowerCase()]
  if (n.startsWith('74')) return de74(n)?.[0] ?? null
  if (n.startsWith('POT')) return 'potenciometro'
  if (n.startsWith('SW-') || n === 'SWITCH') return 'interruptor'
  return null
}

/** La clase de una pieza ajena según cómo la nombra su programa, o null si no es de ninguna conocida. */
export function claseDe(formato: FormatoAjeno, p: PiezaAjena): ClaseAjena | null {
  switch (formato) {
    case 'spice': return deSpice(p)
    case 'ltspice': return deLtspice(p)
    case 'falstad': return deFalstad(p)
    case 'kicad': return deKicad(p)
    case 'proteus': return deProteus(p)
  }
}

/** Entradas de la compuerta según el origen, o null si el origen no lo dice (la pieza queda con las que trae por omisión). */
export function entradasDe(formato: FormatoAjeno, p: PiezaAjena): number | null {
  if (formato === 'falstad') return Number.isFinite(Number(p.props.entradas)) && p.props.entradas ? Number(p.props.entradas) : null
  if (formato === 'kicad') return de74((p.tipo.split(':').pop() ?? p.tipo))?.[1] ?? null
  if (formato === 'proteus') {
    const m = /(\d)$/.exec(p.tipo)
    if (/^(AND|NAND|OR|NOR|XOR|XNOR)/i.test(p.tipo) && m) return Number(m[1])
    return p.tipo.startsWith('74') ? (de74(p.tipo)?.[1] ?? null) : null
  }
  return null
}
