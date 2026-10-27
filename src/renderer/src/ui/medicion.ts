import type { Conexiones } from '../conexiones/conexiones'
import { tamañoSeleccion, type Seleccion } from '../editor/seleccion'
import { REGIONES, type CausaBiestable, type ExtraMedicion, type Lectura, type LecturaDigital, type MedicionPieza, type RegistroMsi } from '../sim/lectura'
import type { RelojAdc } from '../netlist/convertidores'
import { formatearMedida, formatearValor, SIN_DATO } from '../valores/valores'
import { DOBLE, SIN_FLECHA, tipoDeTramo } from '../lienzo/flechas'
import { RPM_MINIMA } from '../lienzo/movimiento'

/** Una medición con su nombre y su cifra ya escrita («Voltaje», «2.50 V»). */
export interface FilaMedicion {
  nombre: string
  valor: string
  /** Una lectura fuera de lo nominal (un LED con más corriente de la que aguanta): se marca, y el texto lo dice. */
  alerta?: true
  /** La fila «Región» de un transistor trae sus pasos (la barra de `FichasLectura`), según el tipo de su modelo. */
  pasos?: readonly string[]
}

/** Los pasos de la barra de región, de menos a más conducción (sin «activa inversa», que no es un paso de la barra). */
export const PASOS_REGION: Readonly<{ bjt: readonly string[]; mosfet: readonly string[] }> = { bjt: REGIONES.bjt.slice(0, 3), mosfet: [REGIONES.mosfet[0], REGIONES.mosfet[2], REGIONES.mosfet[1]] }

/** Cifra con 3 cifras significativas y prefijo SI («2.50 V»); sin lectura, «sin dato». */
/** Por debajo de esta corriente (A) la pieza «no lleva corriente»: lo que pasa es una fuga. */
export const CORRIENTE_MINIMA = 1e-6
/** La corriente con su cifra; por debajo de 1 µA, «sin corriente» con lo que pasa entre paréntesis («sin corriente (4.00 nA)»). */
export const cifraCorriente = (v: number | undefined): string => (v === undefined || !(Math.abs(v) < CORRIENTE_MINIMA) ? cifra(v, 'A') : Math.abs(v) === 0 ? 'sin corriente' : `sin corriente (${formatearMedida(Math.abs(v), 'A')})`)
export const cifra = (v: number | undefined, unidad: string): string => (v === undefined ? SIN_DATO : formatearMedida(v, unidad))

/** Potencia que absorbe la pieza; si es negativa la entrega (una fuente que alimenta el circuito). */
export const textoPotencia = (p: number): string => (p < 0 ? `${cifra(-p, 'W')} (entrega)` : cifra(p, 'W'))

/** Velocidad de un motor en revoluciones por minuto, entera y con separador de miles. */
export const textoRpm = (rpm: number): string => (Number.isFinite(rpm) ? `${Math.round(rpm).toLocaleString('es-MX')} rpm` : SIN_DATO)

/** Velocidad del eje de un motor a pasos: con una decimal bajo 10 rpm, donde el eje de salida de un reductor suele andar. */
const textoRpmPasos = (rpm: number): string => (Math.abs(rpm) < 10 ? `${rpm.toFixed(1)} rpm` : textoRpm(rpm))

/** La ganancia de corriente Ic / Ib con tres cifras; en corte, «sin dato». */
export const textoBeta = (ic: number, ib: number): string => (Math.abs(ib) > 1e-12 && Number.isFinite(ic / ib) ? (ic / ib).toPrecision(3) : SIN_DATO)

/** Los segmentos del display en el orden de su modelo. */
const SEGMENTOS_DISPLAY = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'punto']

/** Un ciclo de trabajo de 0 a 1 en porcentaje con una cifra decimal («52.4 %»). */
export const textoCiclo = (c: number): string => `${(c * 100).toFixed(1)} %`

/** La cuenta de un contador en decimal y en binario de cuatro bits («7, 0111»). */
export const textoCuenta = (n: number | null | undefined): string => (n === null || n === undefined ? 'sin definir' : `${n}, ${n.toString(2).padStart(4, '0')}`)

/** Un código de `bits` bits en decimal, hexadecimal y binario («9», «0x9», «0b1001»); sin definir, «sin definir» en los tres. */
export function formasDeCodigo(n: number | null, bits: number): { decimal: string; hex: string; bin: string } {
  if (n === null) return { decimal: 'sin definir', hex: 'sin definir', bin: 'sin definir' }
  return { decimal: String(n), hex: `0x${n.toString(16).toUpperCase().padStart(Math.ceil(bits / 4), '0')}`, bin: `0b${n.toString(2).padStart(bits, '0')}` }
}

/** Un registro en una línea, en decimal y binario («7, 0111»); sin definir, «sin definir». */
export const textoRegistro = (n: number | null, bits: number): string => (n === null ? 'sin definir' : `${n}, ${n.toString(2).padStart(bits, '0')}`)

/** El reloj de un MSI («1 kHz (CLK)»; «sin pulsos» si no cambia). */
export const textoRelojMsi = (r: NonNullable<RegistroMsi['reloj']>): string => (r.hz > 0 ? `${cifra(r.hz, 'Hz')}${r.pin ? ` (${r.pin})` : ''}` : 'sin pulsos')

/** El reloj de un ADC0804: el RC con su frecuencia y sus valores, o el que le llega. */
export const textoRelojAdc = (r: RelojAdc | null): string => (r === null ? SIN_DATO : r.tipo === 'rc' ? `${cifra(r.hz, 'Hz')} (R ${formatearValor(r.r, 'Ω')}, C ${formatearValor(r.c, 'F')})` : 'externo, por CLK IN')

/** Dónde va un ADC0804: convirtiendo, con INTR en bajo (dato listo) o en espera (sin dato nuevo). */
export const estadoDeAdc = (x: Extract<ExtraMedicion, { tipo: 'convertidor-ad' }>): 'convirtiendo' | 'listo' | 'en espera' => (x.convirtiendo ? 'convirtiendo' : x.intr === '0' ? 'listo' : 'en espera')

/** El voltaje que representa el código de un ADC0804 (`código / 2^bits` del fondo de escala); null si falta alguno. */
export const voltajeDeAdc = (x: Extract<ExtraMedicion, { tipo: 'convertidor-ad' }>): number | null => (x.codigo === null || x.vref === null ? null : (x.codigo / 2 ** x.bits) * x.vref)

const CAUSA: Record<CausaBiestable, string> = {
  arranque: 'arranque (empieza en 0)',
  flanco: 'flanco de reloj',
  pone: 'flanco de reloj: pone (J)',
  borra: 'flanco de reloj: borra (K)',
  conmuta: 'flanco de reloj: conmuta',
  pre: 'PRE',
  clr: 'CLR',
  ambos: 'PRE y CLR a la vez',
  indefinida: 'una entrada indefinida'
}

type LecturaDePieza = Extract<ExtraMedicion, { tipo: 'digital' }>

/** Qué fijó Q: en el JK, un flanco con J y K en 0 mantiene; en el D, el flanco toma el dato. */
const textoCausa = (x: LecturaDePieza): string => (x.causa === 'flanco' && x.modelo === 'biestable-jk' ? 'flanco de reloj: mantiene' : CAUSA[x.causa ?? 'indefinida'])

/** El nivel de un pin, con su voltaje si su red es analógica («0 (21.0 mV)»). */
const textoPin = (p: LecturaDePieza['pines'][number]): string => (p.v === undefined ? p.nivel : `${p.nivel} (${cifra(p.v, 'V')})`)

/** Lo propio de una pieza digital en pocas palabras (la columna de Mediciones). */
function resumenDigital(x: LecturaDePieza): string {
  switch (x.modelo) {
    case 'compuerta':
      return `salida en ${x.pines.find((p) => p.salida)?.nivel ?? 'X'}`
    case 'estado-logico':
      return x.pines[0]?.nivel ?? 'X'
    case 'biestable-d':
    case 'biestable-jk':
      return `Q en ${x.q ?? 'X'}`
    case 'contador':
      return textoCuenta(x.cuenta)
    case 'msi':
      return x.registro ? `${x.registro.clase} ${textoRegistro(x.registro.valor, x.registro.bits)}` : 'sin lectura'
    case 'lut':
      return `${x.pines.filter((p) => p.salida && p.nivel === '1').length} salidas en 1`
    case 'decodificador':
      return x.digito === null || x.digito === undefined ? 'sin definir' : x.digito < 0 ? 'apagado' : `manda ${x.digito}`
  }
}

/** Las filas de una pieza digital: lo propio de su tipo y luego el nivel de cada pin. */
const mayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

function filasDigitales(x: LecturaDePieza): FilaMedicion[] {
  // El nombre del pin en su `pieza.json` («dato (D)», «Q negada»), con mayúscula como en el inspector.
  const pines = x.pines.map((p) => ({ nombre: mayuscula(p.nombre ?? p.id), valor: textoPin(p) }))
  switch (x.modelo) {
    case 'compuerta':
    case 'lut':
      return pines
    case 'estado-logico':
      return x.pines.length ? [{ nombre: 'Nivel', valor: textoPin(x.pines[0]) }] : []
    case 'biestable-d':
    case 'biestable-jk':
      return [{ nombre: 'Q', valor: x.q ?? 'X' }, { nombre: 'Último cambio', valor: textoCausa(x) }, ...pines]
    case 'contador':
      return [{ nombre: 'Cuenta', valor: textoCuenta(x.cuenta) }, ...pines]
    case 'msi':
      return [...(x.registro ? [{ nombre: mayuscula(x.registro.clase), valor: textoRegistro(x.registro.valor, x.registro.bits) }, ...(x.registro.reloj ? [{ nombre: 'Reloj', valor: textoRelojMsi(x.registro.reloj) }] : [])] : []), ...pines]
    case 'decodificador':
      return [{ nombre: 'Dígito', valor: resumenDigital(x) }, ...pines]
  }
}

/** Las filas de una red con nivel lógico: nivel, voltaje (el medido o el nominal) y, si conmuta, frecuencia y ciclo. */
function filasDeRedDigital(d: LecturaDigital, v: number | undefined): FilaMedicion[] {
  const voltaje = v !== undefined ? [{ nombre: 'Voltaje', valor: cifra(v, 'V') }] : d.nominal !== null ? [{ nombre: 'Voltaje', valor: `${cifra(d.nominal, 'V')} nominal` }] : []
  const conmuta = d.f > 0 ? [{ nombre: 'Frecuencia', valor: cifra(d.f, 'Hz') }, { nombre: 'Ciclo de trabajo', valor: textoCiclo(d.ciclo) }] : []
  return [{ nombre: 'Nivel', valor: d.nivel }, ...voltaje, ...conmuta]
}

/** Lo propio de cada modelo en palabras: región, saturación, contacto, fusible, sonido. */
export function estadoEnPalabras(m: MedicionPieza): string | null {
  const x = m.extra
  if (!x) return null
  switch (x.tipo) {
    case 'bjt':
    case 'mosfet':
    case 'jfet':
      return x.region
    case 'ampop':
      return x.saturado === 1 ? 'saturado contra V+' : x.saturado === -1 ? 'saturado contra V−' : 'sin saturar'
    case 'zener':
      return x.estado === 'directa' ? 'conduce en directo' : x.estado === 'ruptura' ? 'en ruptura' : 'sin conducir'
    case 'fusible':
    case 'foco':
      return x.fundido ? 'fundido' : 'entero'
    case 'motor':
      return x.angulo !== undefined ? textoRpmPasos(x.rpm) : textoRpm(x.rpm)
    case 'rele':
      return x.operado ? 'común con NA' : 'común con NC'
    case 'zumbador':
      // El sonido tiene su equivalente en palabras.
      return x.suena ? 'suena' : 'en silencio'
    case 'led':
      return `${x.excedida ? 'más de' : 'dentro de'} sus ${formatearValor(x.inom, 'A')} nominales`
    case 'digital':
      return resumenDigital(x)
    case 'convertidor-ad':
      return `código ${x.codigo ?? 'sin definir'}, ${estadoDeAdc(x)}`
    case 'convertidor-da':
      return `código ${x.codigo}`
    case '555':
      return x.f > 0 ? `oscila a ${cifra(x.f, 'Hz')}` : `en reposo, salida en ${x.salida}`
    case 'display':
      return x.muestra
    case 'fuente-variable':
      return x.modo === 'CV' ? 'voltaje constante (CV)' : x.modo === 'CC' ? 'corriente limitada (CC)' : 'salida apagada'
    case 'termistor':
    case 'ldr':
      // Su lectura va junto al valor de la pieza en el lienzo, no en la tabla.
      return null
    case 'compuesto':
      // Las corrientes de sus elementos son para los límites (`sim/avisos.ts`), no para la tabla de la pieza; solo la región, si la declara.
      return x.region ?? null
  }
}

/** Las filas de una pieza con lecturas propias, en el orden de lectura. */
function filasDelModelo(m: MedicionPieza): FilaMedicion[] | null {
  const x = m.extra
  if (!x || x.tipo === 'compuesto' || x.tipo === 'termistor' || x.tipo === 'ldr') return null
  const estado = estadoEnPalabras(m)!
  switch (x.tipo) {
    case 'bjt':
      return [
        { nombre: 'Región', valor: estado, pasos: PASOS_REGION.bjt },
        { nombre: 'Vbe', valor: cifra(x.vbe, 'V') },
        { nombre: 'Vce', valor: cifra(m.v, 'V') },
        { nombre: 'Ic', valor: cifra(m.i, 'A') },
        { nombre: 'β', valor: textoBeta(m.i, x.ib) }
      ]
    case 'mosfet':
      return [
        { nombre: 'Región', valor: estado, pasos: PASOS_REGION.mosfet },
        { nombre: 'Vgs', valor: cifra(x.vgs, 'V') },
        { nombre: 'Vds', valor: cifra(m.v, 'V') },
        { nombre: 'Id', valor: cifra(m.i, 'A') }
      ]
    case 'jfet':
      return [
        { nombre: 'Región', valor: estado, pasos: PASOS_REGION.mosfet },
        { nombre: 'Vgs', valor: cifra(x.vgs, 'V') },
        { nombre: 'Vds', valor: cifra(m.v, 'V') },
        { nombre: 'Id', valor: cifra(m.i, 'A') }
      ]
    case 'ampop':
      return [
        { nombre: 'Salida', valor: cifra(m.v, 'V') },
        { nombre: 'Estado', valor: estado },
        { nombre: 'Corriente de salida', valor: cifra(m.i, 'A') }
      ]
    case 'fusible':
    case 'foco':
      return [
        { nombre: 'Estado', valor: estado },
        { nombre: 'Corriente', valor: cifraCorriente(m.i) },
        // El calentamiento del fusible como porcentaje del que lo funde.
        ...(x.tipo === 'fusible' && x.calentamiento !== undefined && !x.fundido ? [{ nombre: 'Calentamiento', valor: `${Math.round(Math.min(1, Math.max(0, x.calentamiento)) * 100)} % del que lo funde` }] : [])
      ]
    case 'motor':
      return [
        { nombre: 'Velocidad', valor: estado },
        // El sentido, como la flecha quieta junto al símbolo.
        { nombre: 'Sentido', valor: Math.abs(x.rpm) < RPM_MINIMA ? 'quieto' : x.rpm > 0 ? 'horario' : 'antihorario' },
        // Un motor a pasos suma el ángulo del eje y los pasos completos que lleva; su corriente y su voltaje son los de la fase A.
        ...(x.angulo !== undefined ? [{ nombre: 'Ángulo', valor: `${((x.angulo * 180) / Math.PI).toFixed(1)}°` }, { nombre: 'Pasos', valor: String(Math.round(x.pasos ?? 0)) }] : []),
        { nombre: x.angulo !== undefined ? 'Corriente de la fase A' : 'Corriente', valor: cifraCorriente(m.i) },
        { nombre: x.angulo !== undefined ? 'Voltaje de la fase A' : 'Voltaje', valor: cifra(m.v, 'V') }
      ]
    case 'rele':
      return [
        { nombre: 'Estado', valor: x.operado ? 'operado' : 'en reposo' },
        { nombre: 'Contacto', valor: estado },
        { nombre: 'Corriente de la bobina', valor: cifra(m.i, 'A') },
        { nombre: 'Voltaje de la bobina', valor: cifra(m.v, 'V') }
      ]
    case 'led':
      return [
        { nombre: 'Voltaje', valor: cifra(m.v, 'V') },
        { nombre: 'Corriente', valor: cifraCorriente(m.i) },
        { nombre: 'Potencia', valor: textoPotencia(m.p) },
        x.excedida ? { nombre: 'Estado', valor: estado, alerta: true } : { nombre: 'Estado', valor: estado }
      ]
    case 'zener':
    case 'zumbador':
      return [
        { nombre: 'Voltaje', valor: cifra(m.v, 'V') },
        { nombre: 'Corriente', valor: cifraCorriente(m.i) },
        { nombre: x.tipo === 'zener' ? 'Estado' : 'Sonido', valor: estado }
      ]
    case 'digital':
      return filasDigitales(x)
    case 'convertidor-ad': {
      const v = voltajeDeAdc(x)
      return [
        { nombre: 'Código', valor: textoRegistro(x.codigo, x.bits) },
        { nombre: 'Representa', valor: v === null ? SIN_DATO : `${cifra(v, 'V')} de ${cifra(x.vref!, 'V')}` },
        { nombre: 'Estado', valor: estadoDeAdc(x) },
        { nombre: 'INTR', valor: x.intr },
        { nombre: 'Reloj', valor: textoRelojAdc(x.reloj) }
      ]
    }
    case 'convertidor-da':
      return [
        { nombre: 'Código', valor: String(x.codigo) },
        { nombre: 'Corriente IO', valor: cifra(x.io, 'A') }
      ]
    case '555':
      return [
        { nombre: 'Salida', valor: x.salida },
        { nombre: 'Estado', valor: x.f > 0 ? 'oscila' : 'en reposo' },
        ...(x.f > 0 ? [{ nombre: 'Frecuencia', valor: cifra(x.f, 'Hz') }, { nombre: 'Ciclo de trabajo', valor: textoCiclo(x.ciclo) }] : []),
        { nombre: 'THR', valor: cifra(x.thr, 'V') },
        { nombre: 'TRIG', valor: cifra(x.trig, 'V') }
      ]
    case 'fuente-variable':
      return [
        { nombre: 'Voltaje', valor: cifra(m.v, 'V') },
        { nombre: 'Corriente', valor: cifraCorriente(m.i) },
        { nombre: 'Modo', valor: estado }
      ]
    case 'display':
      return [
        // En la ficha «Muestra» basta el dígito («7»); «muestra 7» es la frase de Mediciones.
        { nombre: 'Muestra', valor: x.muestra.replace(/^muestra /, '') },
        ...x.corrientes.flatMap((i, k) => (i === null ? [] : [{ nombre: `Segmento ${SEGMENTOS_DISPLAY[k]}`, valor: cifra(i, 'A') }]))
      ]
  }
}

/**
 * Lo que el inspector muestra de la vista previa: voltaje, corriente y potencia de una pieza, o voltaje de red de un cable o etiqueta. Con otra selección o sin lectura, null.
 */
export function medicionDeSeleccion(sel: Seleccion, con: Conexiones, l: Lectura | null): FilaMedicion[] | null {
  if (!l) return null
  const total = tamañoSeleccion(sel)
  if (total !== 1) return null
  const [pieza] = sel.piezas
  if (pieza) {
    const m = l.piezas.get(pieza)
    if (!m) return null
    // Un aviso de sobrecorriente va primero, marcado, con la cifra contra su límite (o «quemada»).
    const aviso = l.quemadas?.has(pieza) ? [{ nombre: 'Aviso', valor: 'quemada: haz clic sobre ella para reponerla', alerta: true as const }] : l.avisos?.get(pieza) ? [{ nombre: 'Aviso', valor: l.avisos.get(pieza)!.texto, alerta: true as const }] : []
    const propias = filasDelModelo(m)
    if (propias) return aviso.length ? [...aviso, ...propias] : propias
    // Potenciómetro: voltaje entre extremos y del cursor (respecto de tierra, como el de cualquier red).
    if (m.cursor !== undefined) {
      return [
        { nombre: 'Entre extremos', valor: cifra(m.v, 'V') },
        { nombre: 'Cursor', valor: cifra(m.cursor, 'V') },
        { nombre: 'Corriente', valor: cifraCorriente(m.i) },
        { nombre: 'Potencia', valor: textoPotencia(m.p) }
      ]
    }
    return [
      ...aviso,
      { nombre: 'Voltaje', valor: cifra(m.v, 'V') },
      { nombre: 'Corriente', valor: cifraCorriente(m.i) },
      { nombre: 'Potencia', valor: textoPotencia(m.p) }
    ]
  }
  const [cable] = sel.cables
  const [etiqueta] = sel.etiquetas
  const red = cable ? con.redDeCable.get(cable) : etiqueta ? con.redDeEtiqueta.get(etiqueta) : undefined
  const v = red === undefined ? undefined : l.redes.get(red)
  const d = red === undefined ? undefined : l.digitales?.get(red)
  const corriente = cable ? filaDeCorriente(cable, l) : []
  if (d) return [...filasDeRedDigital(d, v), ...corriente]
  return v === undefined ? null : [{ nombre: 'Voltaje', valor: cifra(v, 'V') }, ...corriente]
}

/**
 * Con la corriente animada, la corriente media del cable (su tramo con más corriente). Si alterna más rápido de lo visible, sugiere bajar la velocidad.
 */
function filaDeCorriente(cable: string, l: Lectura): FilaMedicion[] {
  const c = l.corrientes
  if (!c) return []
  let k = -1
  for (let j = 0; j < c.tramos.length; j++) if (c.tramos[j].cable === cable && (k < 0 || c.absoluta[j] > c.absoluta[k])) k = j
  if (k < 0) return []
  const tipo = tipoDeTramo(c.media[k], c.absoluta[k])
  if (tipo === SIN_FLECHA) return [{ nombre: 'Corriente', valor: 'sin corriente' }]
  if (tipo === DOBLE) return [{ nombre: 'Corriente', valor: `alterna (${cifra(c.absoluta[k], 'A')} de media absoluta): baja la velocidad para verla` }]
  return [{ nombre: 'Corriente', valor: cifraCorriente(Math.abs(c.media[k])) }]
}
