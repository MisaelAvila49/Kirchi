/** Reconoce de qué programa viene un archivo por su contenido y no por la extensión. */
import { unzipSync } from 'fflate'
import type { FormatoAjeno } from './ajeno'

export type Deteccion = { formato: FormatoAjeno } | { motivo: string }

/** Texto de un archivo: UTF-8, o UTF-16 con BOM o reconocido por los ceros de los caracteres ASCII (LTspice 24 guarda así). */
export function decodificarTexto(bytes: Uint8Array): string {
  const b = bytes
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2))
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2))
  if (b.length >= 4) {
    if (b[0] !== 0 && b[1] === 0 && b[2] !== 0 && b[3] === 0) return new TextDecoder('utf-16le').decode(b)
    if (b[0] === 0 && b[1] !== 0 && b[2] === 0 && b[3] !== 0) return new TextDecoder('utf-16be').decode(b)
  }
  // Los .asc de LTspice viejos están en Windows-1252 (la «µ» es un solo byte): si no es UTF-8 válido se lee así.
  let t: string
  try {
    t = new TextDecoder('utf-8', { fatal: true }).decode(b)
  } catch {
    t = new TextDecoder('windows-1252').decode(b)
  }
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t
}

/** Nombres de las entradas de un zip sin descomprimir ninguna; null si no es zip. */
function nombresDeZip(bytes: Uint8Array): string[] | null {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) return null
  const nombres: string[] = []
  try {
    unzipSync(bytes, {
      filter: (f) => {
        nombres.push(f.name)
        return false
      },
    })
  } catch {
    return null
  }
  return nombres
}

const ELEMENTO_SPICE = /^[RCLDQMJVIEFGHBXK][\w.$:-]*\s+\S+\s+\S+/i
const DIRECTIVA_SPICE = /^\.(tran|end|ends|op|ac|dc|model|subckt|param|include|lib|print|plot|probe|options?|ic)\b/i

function pareceSpice(t: string): boolean {
  const lineas = t.split(/\r\n|\n/)
  if (lineas.length < 2 || lineas[0].trim() === '') return false
  let elementos = 0
  for (const l of lineas.slice(1, 200)) {
    const s = l.trim()
    if (s === '' || s[0] === '*') continue
    if (DIRECTIVA_SPICE.test(s)) return true
    // Una sola línea con forma de elemento puede ser prosa («esto es una carta»): se piden dos.
    if (ELEMENTO_SPICE.test(s) && ++elementos >= 2) return true
  }
  return false
}

/** null: no es de otro programa (un `.kir` o algo desconocido, lo decide quien llama). */
export function detectarFormato(_nombre: string, bytes: Uint8Array): Deteccion | null {
  const zip = nombresDeZip(bytes)
  if (zip) return zip.some((n) => n.toUpperCase() === 'ROOT.DSN') && !zip.includes('manifest.json') ? { formato: 'proteus' } : null
  if (bytes.length === 0) return null
  const t = decodificarTexto(bytes.subarray(0, Math.min(bytes.length, 65536))).trimStart()
  if (/^\$ \d/.test(t)) return { formato: 'falstad' }
  if (/^Version 4/.test(t) && /^SHEET\b/m.test(t)) return { formato: 'ltspice' }
  if (/^\(kicad_sch\b/.test(t)) return { formato: 'kicad' }
  if (/^\(export\s*\(version/.test(t)) return { motivo: 'Es una netlist de KiCad, que no lleva la geometría. Exporta el esquema (.kicad_sch) en su lugar.' }
  if (pareceSpice(t)) return { formato: 'spice' }
  return null
}
