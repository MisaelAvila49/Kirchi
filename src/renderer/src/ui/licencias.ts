/** Forma de `licenciasTerceros.json` (lo genera `scripts/generar-licencias.mjs`). */
export interface LicenciasTerceros {
  /** Versión de Kirchi con que se generó. */
  kirchi: string
  /** El texto de la licencia MIT de Kirchi (LICENSE). */
  licenciaKirchi: string
  /** Textos distintos de licencia; cada paquete apunta al suyo por posición. */
  textos: string[]
  /** Lo que va dentro del programa de Kirchi (interfaz y motor): solo licencias permisivas. */
  paquetes: { nombre: string; version: string; licencia: string; origen: 'npm' | 'cargo'; texto: number }[]
  /** Lo que viaja junto a Kirchi como programa aparte (Electron y Chromium, ngspice y sus bibliotecas), agrupado. */
  aparte: { nombre: string; version: string; licencia: string; grupo: string; texto: number }[]
  /** ngspice: versión y archivos oficiales de los que sale, con su SHA-256 (scripts/ngspice-fuente.mjs). */
  ngspice: { version: string; fuente: { nombre: string; url: string; sha256: string } }
}

/** Licencias que obligarían a liberar Kirchi bajo otra (copyleft fuerte): no deben aparecer dentro del programa. */
export const LICENCIAS_PROHIBIDAS = /\b(A?GPL|LGPL|SSPL|BUSL|CC-BY-NC)/i

/** Una expresión SPDX con `OR` se puede cumplir con alguna de sus opciones: basta que una sea permitida. */
export function licenciaPermitida(expr: string): boolean {
  return expr.split(/\s+OR\s+|\//).some((alt) => !LICENCIAS_PROHIBIDAS.test(alt))
}
