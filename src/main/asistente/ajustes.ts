import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { rutaDeInterfaz } from '../archivos'
import { ARCHIVO_AJUSTES, TAMAÑO_MAXIMO_AJUSTES } from '../ajustes'

export interface AjustesAsistente {
  activo: boolean
  /** Carpeta elegida por el usuario, o null para la de omisión. */
  carpeta: string | null
}

const APAGADO: AjustesAsistente = { activo: false, carpeta: null }

export type LecturaAjustes = { ok: true; ajustes: AjustesAsistente } | { ok: false; motivo: string; transitorio: boolean }

/** Lo del asistente en `settings.json`, una sola lectura. Un archivo que falta, enorme o que no es JSON se lee como apagado;
 * un error de disco (el archivo a medio reemplazar, retenido por un antivirus) es transitorio y se distingue. */
export function leerUnaVez(dirDatos: string): LecturaAjustes {
  const ruta = join(dirDatos, ARCHIVO_AJUSTES)
  let texto: string
  try {
    if (statSync(ruta).size > TAMAÑO_MAXIMO_AJUSTES) return { ok: false, motivo: 'settings.json es demasiado grande', transitorio: false }
    texto = readFileSync(ruta, 'utf8')
  } catch (e) {
    const codigo = (e as NodeJS.ErrnoException).code ?? 'desconocido'
    return { ok: false, motivo: `settings.json no se pudo leer (${codigo})`, transitorio: codigo !== 'ENOENT' }
  }
  try {
    const a = (JSON.parse(texto) as { asistente?: { activo?: unknown }; carpetaAsistente?: unknown } | null) ?? {}
    const carpeta = a.carpetaAsistente
    return { ok: true, ajustes: { activo: a.asistente?.activo === true, carpeta: typeof carpeta === 'string' && rutaDeInterfaz(carpeta) ? carpeta : null } }
  } catch {
    // Un JSON cortado solo sale de una escritura a medias (la ventana escribe de forma atómica): se reintenta.
    return { ok: false, motivo: 'settings.json no es JSON válido', transitorio: true }
  }
}

const REINTENTOS = 4
const ESPERA_MS = 25
const esperarSincrono = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/**
 * Lee los ajustes del asistente en cada llamada: el puente respeta un apagado hecho con el cliente conectado y nunca
 * escribe los ajustes. Un fallo transitorio se reintenta y, si persiste, vale la última lectura buena: un archivo
 * retenido un instante no debe decirle al asistente que el usuario lo apagó. Sin lectura buena previa, apagado.
 */
export function lectorDeAjustes(dirDatos: string, o: { esperar?: (ms: number) => void; alFallar?: (motivo: string) => void } = {}): () => AjustesAsistente {
  let ultima: AjustesAsistente | null = null
  const esperar = o.esperar ?? esperarSincrono
  return () => {
    let r = leerUnaVez(dirDatos)
    for (let i = 1; !r.ok && r.transitorio && i < REINTENTOS; i++) {
      esperar(ESPERA_MS)
      r = leerUnaVez(dirDatos)
    }
    if (r.ok) return (ultima = r.ajustes)
    o.alFallar?.(r.motivo)
    return r.transitorio && ultima ? ultima : APAGADO
  }
}

/** Una lectura sin memoria (pruebas y usos sueltos): cualquier falla es «apagado». */
export function leerAjustesAsistente(dirDatos: string): AjustesAsistente {
  const r = leerUnaVez(dirDatos)
  return r.ok ? r.ajustes : APAGADO
}
