/** Punto de entrada de una importación: bytes de un archivo ajeno a un documento de Kirchi con su informe. */
import { calcularConexiones } from '../conexiones/conexiones'
import { aplicar, crear, juntar, type Comando } from '../doc/comandos'
import { idAleatorio, type GeneradorId } from '../doc/ids'
import { documentoVacio, type Documento } from '../doc/tipos'
import { armarAnalisis } from '../edicion/analisisDoc'
import type { PiezaDef } from '../piezas/tipos'
import type { CircuitoAjeno, FormatoAjeno } from './ajeno'
import { convertir, type Conversion } from './convertir'
import { decodificarTexto, detectarFormato } from './detectar'
import { recortarAvisos, validarInforme, type Informe } from './informe'
import { leerFalstad } from './lectores/falstad'
import { leerKicad } from './lectores/kicad'
import { leerLtspice } from './lectores/ltspice'
import { leerProteus } from './lectores/proteus/proteus'
import { leerSpice } from './lectores/spice'

export type ResultadoImportar = { ok: true; doc: Documento; informe: Informe; avisos: string[] } | { ok: false; motivo: string; detalle?: string }

type Lector = (bytes: Uint8Array, nombre: string, anexos?: Record<string, Uint8Array>) => CircuitoAjeno
const deTexto = (f: (texto: string, nombre: string) => CircuitoAjeno): Lector => (bytes, nombre) => f(decodificarTexto(bytes), nombre)

/** Un lector por formato: agregar LTspice, KiCad o Proteus es una línea aquí. */
const LECTORES: Partial<Record<FormatoAjeno, Lector>> = {
  spice: deTexto(leerSpice),
  falstad: deTexto(leerFalstad),
  ltspice: deTexto(leerLtspice),
  kicad: (bytes, nombre, anexos) => {
    const hojas: Record<string, string> = {}
    for (const [k, v] of Object.entries(anexos ?? {})) hojas[k] = decodificarTexto(v)
    return leerKicad(decodificarTexto(bytes), nombre, hojas)
  },
  proteus: leerProteus
}

const NOMBRES: Record<FormatoAjeno, string> = { falstad: 'Falstad', ltspice: 'LTspice', spice: 'SPICE', kicad: 'KiCad', proteus: 'Proteus' }

export function importarBytes(nombre: string, bytes: Uint8Array, lib: Map<string, PiezaDef>, gen: GeneradorId = idAleatorio, anexos?: Record<string, Uint8Array>): ResultadoImportar {
  const falla = (paso: string, e: unknown, formato?: FormatoAjeno): ResultadoImportar => ({
    ok: false,
    motivo: `No se pudo ${paso} el archivo${formato ? ` de ${NOMBRES[formato]}` : ''}: puede estar dañado o ser de una variante que Kirchi todavía no entiende.`,
    detalle: e instanceof Error ? e.message : String(e)
  })
  let formato: FormatoAjeno | undefined
  let paso = 'leer'
  try {
    const d = detectarFormato(nombre, bytes)
    if (d === null) return { ok: false, motivo: 'El archivo no parece ser de otro programa que Kirchi sepa leer.' }
    if ('motivo' in d) return { ok: false, motivo: d.motivo }
    formato = d.formato
    const leer = LECTORES[formato]
    if (!leer) return { ok: false, motivo: `Todavía no se importan archivos de ${NOMBRES[formato]}.` }
    const ajeno = leer(bytes, nombre, anexos)
    if (ajeno.piezas.length === 0) return { ok: false, motivo: `El archivo de ${NOMBRES[formato]} no tiene piezas que importar.` }
    paso = 'convertir'
    return armarDocumento(convertir(ajeno, lib, gen), lib, gen)
  } catch (e) {
    return falla(paso, e, formato)
  }
}

/** Coloca lo convertido en un documento vacío y crea sus análisis, con el informe guardado en `importacion`. */
export function armarDocumento(c: Conversion, lib: Map<string, PiezaDef>, gen: GeneradorId): ResultadoImportar & { ok: true } {
  const f = c.fragmento
  const cmds: Comando[] = [
    ...f.piezas.map((p) => crear('importar', 'piezas', p)),
    ...f.cables.map((x) => crear('importar', 'cables', x)),
    ...f.etiquetas.map((x) => crear('importar', 'etiquetas', x)),
    ...(f.sondas ?? []).map((x) => crear('importar', 'sondas', x)),
    ...(c.alimentaciones ?? []).map((a) => crear('importar', 'alimentaciones', { id: gen('a'), nombre: a.nombre, voltaje: a.voltaje }))
  ]
  let doc = aplicar(documentoVacio(), juntar('importar', cmds))

  // Los análisis se arman sobre el documento ya colocado: sus fuentes y trazas se resuelven por referencia y por pin.
  const avisos = [...c.avisos]
  const con = calcularConexiones(doc, lib)
  for (const entrada of c.analisis) {
    const r = armarAnalisis({ doc, lib, con, gen }, entrada)
    if (r.ok) {
      doc = aplicar(doc, crear('importar', 'analisis', r.analisis))
      avisos.push(...r.avisos)
    } else avisos.push(`${entrada.nombre}: ${r.motivo}`)
  }
  const informe: Informe = { ...c.informe, avisos: recortarAvisos(avisos) }
  doc = { ...doc, importacion: validarInforme(informe) ?? informe }
  return { ok: true, doc, informe, avisos }
}
