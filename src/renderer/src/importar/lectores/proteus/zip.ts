import { descomprimirLimitado } from '../../../archivo/zipLimitado'

/** Tope de ROOT.DSN descomprimido: los proyectos reales pesan unos pocos MB. */
const TOPE_DSN = 32 * 1024 * 1024
const TOPE_XML = 1024 * 1024

export interface ProyectoProteus {
  dsn: Uint8Array
  /** `RELEASE` de PROJECT.XML (813 es Proteus 8.13). */
  release?: number
  /** `FILEVER` de PROJECT.XML. */
  filever?: number
}

export class ErrorProteus extends Error {}

/** Abre el `.pdsprj` y deja solo el esquema y su versión; el resto del paquete no se toca. */
export function abrirProyecto(bytes: Uint8Array): ProyectoProteus {
  const r = descomprimirLimitado(bytes, (n) => {
    const m = n.toUpperCase()
    return m === 'ROOT.DSN' ? TOPE_DSN : m === 'PROJECT.XML' ? TOPE_XML : null
  })
  if (!r.ok) throw new ErrorProteus(r.motivo === 'grande' ? 'El proyecto de Proteus es demasiado grande.' : 'El archivo no es un proyecto de Proteus válido.')
  const nombre = (n: string): string | undefined => Object.keys(r.archivos).find((k) => k.toUpperCase() === n)
  const dsn = r.archivos[nombre('ROOT.DSN') ?? '']
  if (!dsn) throw new ErrorProteus('El proyecto no trae el esquema (ROOT.DSN).')
  const xmlNombre = nombre('PROJECT.XML')
  const xml = xmlNombre ? new TextDecoder('latin1').decode(r.archivos[xmlNombre]) : ''
  const num = (clave: string): number | undefined => {
    const m = new RegExp(String.raw`${clave}="(\d+)"`).exec(xml)
    return m ? Number(m[1]) : undefined
  }
  return { dsn, release: num('RELEASE'), filever: num('FILEVER') }
}
