import type { DefCircuito, Parte } from '../plantillas/armar'
import { nombreDeVoltaje } from '../conexiones/nombres'
import { textoDeIngenieria } from '../valores/series'
import { formatearValor } from '../valores/valores'
import type { ResultadoNotch, ResultadoPasaBanda, ResultadoRechazaBanda } from './filtros'
import { potenciaNominal, type EntradaAmplificador, type EntradaAstable, type EntradaDivisor, type EntradaFiltro, type EntradaLed, type EntradaMonoestable, type ResultadoAmplificador, type ResultadoAstable, type ResultadoDivisor, type ResultadoFiltro, type ResultadoLed, type ResultadoMonoestable } from './formulas'
import { cablesDe, etiquetasDe, parte } from './disposicion'
import { ELECTROLITICO_DESDE } from './redondeo'

/** Circuito de «Generar circuito» con los valores comerciales del cálculo y el acomodo de `disposicion.ts`: cables dados,
 * textos fijos y sin notas.
 * Las coordenadas son de rejilla fina y no dependen de los valores. */

export interface Armado {
  def: DefCircuito
  /** Nombre propuesto para «Guardar como plantilla». */
  nombre: string
  descripcion: string
}

const t = textoDeIngenieria
const V = (x: number) => formatearValor(x, 'V')
const R = (x: number) => formatearValor(x, 'Ω')
const C = (x: number) => formatearValor(x, 'F')
const Hz = (x: number) => formatearValor(x, 'Hz')
const S = (x: number) => formatearValor(x, 's')

/** Las propiedades de una resistencia: el valor y, si disipa más de 1/4 W, la potencia nominal que lo aguanta. */
const resistencia = (valor: number, potencia = 0): Record<string, string> => {
  const n = potenciaNominal(potencia)
  return n ? { valor: t(valor), potencia: n } : { valor: t(valor) }
}

/** Un capacitor de tiempo: desde 1 µF es electrolítico (con polaridad) y el resto cerámico o de película. */
const electrolitico = (c: number) => c >= ELECTROLITICO_DESDE * 0.999

export function circuitoDivisor(e: EntradaDivisor, r: ResultadoDivisor): Armado {
  return {
    def: {
      partes: [
        parte('divisor', 'v1', 'fuente-dc', { voltaje: t(e.vin) }),
        parte('divisor', 'r1', 'resistencia', resistencia(r.r1c, r.p1)),
        parte('divisor', 'r2', 'resistencia', resistencia(r.r2c, r.p2)),
        parte('divisor', 'g1', 'tierra')
      ],
      conexiones: [['v1.+', 'r1.1'], ['r1.2', 'r2.1'], ['v1.-', 'g1.1'], ['r2.2', 'g1.1']],
      cables: cablesDe('divisor'),
      etiquetas: etiquetasDe('divisor')
    },
    nombre: `Divisor ${V(e.vin)} a ${V(e.vout)}`,
    descripcion: `R1 de ${R(r.r1c)} y R2 de ${R(r.r2c)} dan ${V(r.voutReal)} con ${V(e.vin)}.`
  }
}

export function circuitoLed(e: EntradaLed, r: ResultadoLed, color: string): Armado {
  return {
    def: {
      partes: [
        parte('led', 'v1', 'fuente-dc', { voltaje: t(e.vs) }),
        parte('led', 'r1', 'resistencia', resistencia(r.rc, r.potencia)),
        parte('led', 'd1', 'led', { color }),
        parte('led', 'g1', 'tierra')
      ],
      conexiones: [['v1.+', 'r1.1'], ['r1.2', 'd1.A'], ['v1.-', 'g1.1'], ['d1.K', 'g1.1']],
      cables: cablesDe('led'),
      etiquetas: etiquetasDe('led')
    },
    nombre: `LED ${color} a ${V(e.vs)}`,
    descripcion: `Una resistencia de ${R(r.rc)} deja pasar unos ${formatearValor(r.iReal, 'A')} por el LED con ${V(e.vs)}.`
  }
}

export function circuitoFiltro(e: EntradaFiltro, r: ResultadoFiltro): Armado {
  const bajas = e.tipo === 'bajas'
  const id = bajas ? 'bajas' : 'altas'
  const partes: Parte[] = bajas
    ? [
        parte(id, 'g1', 'generador', { frecuencia: t(r.fcReal), amplitud: '2' }),
        parte(id, 'r1', 'resistencia', { valor: t(r.rc) }),
        parte(id, 'c1', 'capacitor', { valor: t(r.cc) }),
        parte(id, 't1', 'tierra')
      ]
    : [
        parte(id, 'g1', 'generador', { frecuencia: t(r.fcReal), amplitud: '2' }),
        parte(id, 'c1', 'capacitor', { valor: t(r.cc) }),
        parte(id, 'r1', 'resistencia', { valor: t(r.rc) }),
        parte(id, 't1', 'tierra')
      ]
  return {
    def: {
      partes,
      conexiones: bajas
        ? [['g1.+', 'r1.1'], ['r1.2', 'c1.1'], ['g1.COM', 't1.1'], ['c1.2', 't1.1']]
        : [['g1.+', 'c1.1'], ['c1.2', 'r1.1'], ['g1.COM', 't1.1'], ['r1.2', 't1.1']],
      cables: cablesDe(id),
      etiquetas: etiquetasDe(id)
    },
    nombre: `Filtro RC paso ${bajas ? 'bajas' : 'altas'} ${Hz(r.fcReal)}`,
    descripcion: `R de ${R(r.rc)} y C de ${C(r.cc)}: frecuencia de corte ${Hz(r.fcReal)}. El generador está en esa frecuencia, donde la señal baja a 70.7 %.`
  }
}

/** El 555 con su alimentación, su capacitor de control y el LED de salida: lo común al astable y al monoestable. */
const base555 = (id: 'astable' | 'monoestable'): { cabeza: Parte[]; cola: Parte[]; conexiones: [string, string][] } => ({
  cabeza: [parte(id, 'u1', 'temporizador-555', { modelo: 'NE555' }), parte(id, 'p1', 'alimentacion', { nombre: '+5V' }), parte(id, 'p2', 'alimentacion', { nombre: '+5V' })],
  // Lo que va después de las piezas de tiempo, para que R1 y C1 sean las primeras referencias de su tipo.
  cola: [
    parte(id, 'c2', 'capacitor', { valor: '10n' }),
    parte(id, 'r3', 'resistencia', { valor: '330' }),
    parte(id, 'd1', 'led', { color: 'rojo' }),
    parte(id, 'g1', 'tierra'),
    parte(id, 'g3', 'tierra'),
    parte(id, 'g4', 'tierra')
  ],
  conexiones: [['p1.1', 'u1.8'], ['u1.4', 'u1.8'], ['u1.1', 'g1.1'], ['u1.5', 'c2.1'], ['c2.2', 'g3.1'], ['u1.3', 'r3.1'], ['r3.2', 'd1.A'], ['d1.K', 'g4.1']]
})

export function circuitoAstable(e: EntradaAstable, r: ResultadoAstable): Armado {
  const b = base555('astable')
  const el = electrolitico(r.cc)
  const [mas, menos] = el ? ['c1.+', 'c1.-'] : ['c1.1', 'c1.2']
  return {
    def: {
      partes: [
        ...b.cabeza,
        parte('astable', 'r1', 'resistencia', { valor: t(r.r1c) }),
        parte('astable', 'r2', 'resistencia', { valor: t(r.r2c) }),
        parte('astable', 'c1', el ? 'capacitor-electrolitico' : 'capacitor', { valor: t(r.cc) }),
        ...b.cola,
        parte('astable', 'g2', 'tierra')
      ],
      conexiones: [
        ...b.conexiones,
        ['p2.1', 'r1.1'], ['r1.2', 'u1.7'], ['r1.2', 'r2.1'], ['r2.2', mas], ['u1.6', 'u1.2'], ['r2.2', 'u1.2'], [menos, 'g2.1']
      ],
      cables: cablesDe('astable'),
      etiquetas: etiquetasDe('astable')
    },
    nombre: `555 astable ${Hz(r.fReal)}`,
    descripcion: `R1 de ${R(r.r1c)}, R2 de ${R(r.r2c)} y C de ${C(r.cc)}: ${Hz(r.fReal)} con ciclo de trabajo de ${(r.dReal * 100).toFixed(1)} %. Parpadea un LED.`
  }
}

/** Frecuencia y ciclo del disparo del monoestable: el pulso en bajo dura la cuarta parte de T, y el periodo es 2.5 T. */
export function disparoMonoestable(tReal: number): { frecuencia: string; ciclo: string } {
  return { frecuencia: t(0.4 / tReal), ciclo: '90 %' }
}

export function circuitoMonoestable(e: EntradaMonoestable, r: ResultadoMonoestable): Armado {
  const b = base555('monoestable')
  const el = electrolitico(r.cc)
  const [mas, menos] = el ? ['c1.+', 'c1.-'] : ['c1.1', 'c1.2']
  const d = disparoMonoestable(r.tReal)
  return {
    def: {
      partes: [
        ...b.cabeza,
        parte('monoestable', 'r1', 'resistencia', { valor: t(r.rc) }),
        parte('monoestable', 'c1', el ? 'capacitor-electrolitico' : 'capacitor', { valor: t(r.cc) }),
        parte('monoestable', 'v2', 'fuente-pulso', { alto: '5', frecuencia: d.frecuencia, ciclo: d.ciclo }),
        ...b.cola,
        parte('monoestable', 'g2', 'tierra'),
        parte('monoestable', 'g5', 'tierra')
      ],
      conexiones: [
        ...b.conexiones,
        ['p2.1', 'r1.1'], ['r1.2', 'u1.7'], ['u1.7', 'u1.6'], [mas, 'u1.6'], [menos, 'g2.1'], ['u1.2', 'v2.+'], ['v2.-', 'g5.1']
      ],
      cables: cablesDe('monoestable'),
      etiquetas: etiquetasDe('monoestable')
    },
    nombre: `555 monoestable ${S(r.tReal)}`,
    descripcion: `R de ${R(r.rc)} y C de ${C(r.cc)}: cada disparo da un pulso de ${S(r.tReal)}. Un generador de pulsos hace de disparo.`
  }
}

export function circuitoAmplificador(e: EntradaAmplificador, r: ResultadoAmplificador, modelo: string): Armado {
  const inv = e.tipo === 'inversor'
  // El voltaje del riel se limpia del error de coma flotante (0.30000000000000004) y el nombre sale del formato único de los terminales.
  const riel = Number(e.vs.toPrecision(6))
  const id = inv ? 'inversor' : 'noinversor'
  const cabeza: Parte[] = [
    parte(id, 'u1', 'amp-op', { modelo }),
    parte(id, 'p1', 'alimentacion', { nombre: nombreDeVoltaje(riel) }),
    parte(id, 'p2', 'alimentacion', { nombre: nombreDeVoltaje(-riel) })
  ]
  const rf = parte(id, 'r2', 'resistencia', { valor: t(r.rfc) })
  const carga: Parte[] = [parte(id, 'rl', 'resistencia', { valor: '10k' }), parte(id, 'g3', 'tierra')]
  const def: DefCircuito = inv
    ? {
        partes: [
          ...cabeza,
          parte(id, 'r1', 'resistencia', { valor: t(r.rinc) }),
          rf,
          parte(id, 'v1', 'fuente-dc', { voltaje: t(e.vin) }),
          ...carga,
          parte(id, 'g1', 'tierra'),
          parte(id, 'g2', 'tierra')
        ],
        conexiones: [
          ['p1.1', 'u1.V+'], ['p2.1', 'u1.V-'], ['v1.+', 'r1.1'], ['r1.2', 'u1.-'], ['u1.+', 'g1.1'], ['r2.1', 'u1.-'], ['r2.2', 'u1.OUT'],
          ['u1.OUT', 'rl.1'], ['rl.2', 'g3.1'], ['v1.-', 'g2.1']
        ],
        cables: cablesDe(id),
      etiquetas: etiquetasDe(id)
      }
    : {
        partes: [
          ...cabeza,
          parte(id, 'r1', 'resistencia', { valor: t(r.rinc) }),
          rf,
          parte(id, 'v1', 'fuente-dc', { voltaje: t(e.vin) }),
          ...carga,
          parte(id, 'g1', 'tierra'),
          parte(id, 'g2', 'tierra')
        ],
        conexiones: [
          ['p1.1', 'u1.V+'], ['p2.1', 'u1.V-'], ['v1.+', 'u1.+'], ['v1.-', 'g2.1'], ['r1.1', 'g1.1'], ['r1.2', 'u1.-'], ['r2.1', 'u1.-'], ['r2.2', 'u1.OUT'],
          ['u1.OUT', 'rl.1'], ['rl.2', 'g3.1']
        ],
        cables: cablesDe(id),
      etiquetas: etiquetasDe(id)
      }
  const g = String(Number(Math.abs(r.gReal).toPrecision(3)))
  return {
    def,
    nombre: `Amplificador ${inv ? 'inversor' : 'no inversor'} de ganancia ${inv ? '−' : ''}${g}`,
    descripcion: `${modelo} con alimentación de ±${V(e.vs)}, ${inv ? 'Rin' : 'R a tierra'} de ${R(r.rinc)} y Rf de ${R(r.rfc)}. Entrada de prueba de ${V(e.vin)}.`
  }
}

// --------------------------------------------------------------------------------------------------------- Filtros de banda

/** El generador de los filtros de banda es ideal (sin resistencia de salida): lo que mide el motor es la respuesta de la ficha. */
const senal = (f: number): Record<string, string> => ({ frecuencia: t(f), amplitud: '2', ideal: 'sí' })

export function circuitoPasaBanda(r: ResultadoPasaBanda): Armado {
  return {
    def: {
      partes: [
        parte('pasabanda', 'g1', 'generador', senal(r.f0)),
        parte('pasabanda', 'c1', 'capacitor', { valor: t(r.c1c) }),
        parte('pasabanda', 'r1', 'resistencia', { valor: t(r.r1c) }),
        parte('pasabanda', 'r2', 'resistencia', { valor: t(r.r2c) }),
        parte('pasabanda', 'c2', 'capacitor', { valor: t(r.c2c) }),
        parte('pasabanda', 't1', 'tierra'),
        parte('pasabanda', 't2', 'tierra'),
        parte('pasabanda', 't3', 'tierra')
      ],
      conexiones: [['g1.+', 'c1.1'], ['c1.2', 'r1.1'], ['c1.2', 'r2.1'], ['r2.2', 'c2.1'], ['g1.COM', 't1.1'], ['r1.2', 't2.1'], ['c2.2', 't3.1']],
      cables: cablesDe('pasabanda'),
      etiquetas: etiquetasDe('pasabanda')
    },
    nombre: `Filtro pasa banda ${Hz(r.flReal)} a ${Hz(r.fhReal)}`,
    descripcion: `Pasa altas de ${R(r.r1c)} y ${C(r.c1c)} (corte ${Hz(r.flReal)}) y luego pasa bajas de ${R(r.r2c)} y ${C(r.c2c)} (corte ${Hz(r.fhReal)}). El generador está en el centro, ${Hz(r.f0)}.`
  }
}

export function circuitoRechazaBanda(r: ResultadoRechazaBanda): Armado {
  const riel = 15
  return {
    def: {
      partes: [
        parte('rechazabanda', 'g1', 'generador', senal(r.f0)),
        parte('rechazabanda', 'r1', 'resistencia', { valor: t(r.r1c) }),
        parte('rechazabanda', 'c1', 'capacitor', { valor: t(r.cc) }),
        parte('rechazabanda', 'c2', 'capacitor', { valor: t(r.cc) }),
        parte('rechazabanda', 'r2', 'resistencia', { valor: t(r.r2c) }),
        parte('rechazabanda', 'r3', 'resistencia', { valor: t(r.rs) }),
        parte('rechazabanda', 'r4', 'resistencia', { valor: t(r.rs) }),
        parte('rechazabanda', 'r5', 'resistencia', { valor: t(r.rs) }),
        parte('rechazabanda', 'u1', 'amp-op', { modelo: 'LM741' }),
        parte('rechazabanda', 'p1', 'alimentacion', { nombre: nombreDeVoltaje(riel) }),
        parte('rechazabanda', 'p2', 'alimentacion', { nombre: nombreDeVoltaje(-riel) }),
        parte('rechazabanda', 't1', 'tierra'),
        parte('rechazabanda', 't2', 'tierra'),
        parte('rechazabanda', 't3', 'tierra'),
        parte('rechazabanda', 't4', 'tierra')
      ],
      conexiones: [
        ['g1.+', 'r1.1'], ['g1.+', 'c2.1'], ['r1.2', 'c1.1'], ['r1.2', 'r3.1'], ['r3.2', 'u1.-'], ['c2.2', 'r2.1'], ['r2.1', 'r4.1'], ['r4.2', 'u1.-'],
        ['r5.1', 'u1.-'], ['r5.2', 'u1.OUT'], ['u1.+', 't4.1'], ['p1.1', 'u1.V+'], ['p2.1', 'u1.V-'], ['g1.COM', 't1.1'], ['c1.2', 't2.1'], ['r2.2', 't3.1']
      ],
      cables: cablesDe('rechazabanda'),
      etiquetas: etiquetasDe('rechazabanda')
    },
    nombre: `Filtro rechaza banda ${Hz(r.flReal)} a ${Hz(r.fhReal)}`,
    descripcion: `Pasa bajas de ${R(r.r1c)} y ${C(r.cc)} (corte ${Hz(r.flReal)}) y pasa altas de ${C(r.cc)} y ${R(r.r2c)} (corte ${Hz(r.fhReal)}), sumados por un LM741 con resistencias de ${R(r.rs)}. Invierte la señal.`
  }
}

export function circuitoNotch(r: ResultadoNotch): Armado {
  return {
    def: {
      partes: [
        parte('notch', 'g1', 'generador', senal(r.f0Real)),
        parte('notch', 'r1', 'resistencia', { valor: t(r.rc) }),
        parte('notch', 'r2', 'resistencia', { valor: t(r.rc) }),
        parte('notch', 'c3', 'capacitor', { valor: t(r.cc) }),
        parte('notch', 'c4', 'capacitor', { valor: t(r.cc) }),
        parte('notch', 'c1', 'capacitor', { valor: t(r.cc) }),
        parte('notch', 'c2', 'capacitor', { valor: t(r.cc) }),
        parte('notch', 'r3', 'resistencia', { valor: t(r.rc) }),
        parte('notch', 'r4', 'resistencia', { valor: t(r.rc) }),
        parte('notch', 't1', 'tierra'),
        parte('notch', 't2', 'tierra'),
        parte('notch', 't3', 'tierra')
      ],
      conexiones: [
        ['g1.+', 'r1.1'], ['g1.+', 'c1.1'], ['r1.2', 'r2.1'], ['r1.2', 'c3.1'], ['r1.2', 'c4.1'], ['c3.2', 't2.1'], ['c4.2', 't2.1'],
        ['c1.2', 'c2.1'], ['c1.2', 'r3.1'], ['c1.2', 'r4.1'], ['r3.2', 't3.1'], ['r4.2', 't3.1'], ['r2.2', 'c2.2'], ['g1.COM', 't1.1']
      ],
      cables: cablesDe('notch'),
      etiquetas: etiquetasDe('notch')
    },
    nombre: `Notch doble T ${Hz(r.f0Real)}`,
    descripcion: `R de ${R(r.rc)} y C de ${C(r.cc)}: muesco en ${Hz(r.f0Real)}. Las ramas de 2C y de R/2 son dos piezas iguales en paralelo.`
  }
}
