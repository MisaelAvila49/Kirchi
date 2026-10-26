import type { Pieza } from '../doc/tipos'
import type { PiezaDef } from '../piezas/tipos'
import { leerPosicion, leerValor } from '../valores/valores'
import { textoDeNumero } from './ajusteAutomatico'
import { ajustesGenerador, desdeExtremos, extremosDe, FORMAS, periodoDeFrecuencia, type AjustesGenerador } from './ajustes'

/** Campos numéricos del generador que el doble clic y el clic derecho agregan a «Valor» (la frecuencia). Tres no son
 * propiedades: periodo (de la frecuencia), mínimo y máximo (de amplitud y desplazamiento). */
export const CLAVES_CAMPOS_GENERADOR = ['periodo', 'amplitud', 'desplazamiento', 'minimo', 'maximo', 'desfase', 'retardo', 'pasos'] as const
export type ClaveCampoGenerador = (typeof CLAVES_CAMPOS_GENERADOR)[number]

const TITULOS: Record<ClaveCampoGenerador, string> = {
  periodo: 'Periodo (s)',
  amplitud: 'Amplitud pico a pico (V)',
  desplazamiento: 'Offset (V)',
  minimo: 'Mínimo (V)',
  maximo: 'Máximo (V)',
  desfase: 'Desfase (grados)',
  retardo: 'Retardo del escalón (s)',
  pasos: 'Pasos de la escalera'
}

export interface CampoGenerador {
  clave: ClaveCampoGenerador
  titulo: string
  inicial: string
}

/** Los campos con su texto de hoy. Si los ajustes guardados no se leen, los calculados quedan vacíos. */
export function camposDeGenerador(p: Pieza, def: PiezaDef): CampoGenerador[] {
  const texto = (id: string) => p.props[id] ?? def.props.find((d) => d.id === id)?.defecto ?? ''
  const r = ajustesGenerador(p, def)
  const e = r.ok ? extremosDe(r.a.vpp, r.a.desplazamiento) : null
  const calculado: Partial<Record<ClaveCampoGenerador, string>> = r.ok
    ? { periodo: textoDeNumero(periodoDeFrecuencia(r.a.frecuencia)), minimo: textoDeNumero(e!.minimo), maximo: textoDeNumero(e!.maximo) }
    : {}
  return CLAVES_CAMPOS_GENERADOR.map((clave) => ({ clave, titulo: TITULOS[clave], inicial: calculado[clave] ?? (clave in calculado ? '' : texto(clave)) }))
}

export type CambiosGenerador = { ok: true; cambios: Record<string, string> } | { ok: false; clave: ClaveCampoGenerador | 'frecuencia'; error: string }

/** De lo escrito en el editor a las propiedades que cambian. `frecuencia` es el campo «Valor». La frecuencia gana al
 * periodo y amplitud o desplazamiento a mínimo y máximo; lo que no cambia de su texto inicial no se toca. */
export function resolverCamposGenerador(iniciales: Record<string, string>, nuevos: Record<string, string>): CambiosGenerador {
  const cambio = (k: string) => (nuevos[k] ?? iniciales[k]) !== iniciales[k]
  const num = (k: string): number | null => {
    const v = leerValor(nuevos[k] ?? iniciales[k] ?? '')
    return v && Number.isFinite(v.valor) ? v.valor : null
  }
  const cambios: Record<string, string> = {}
  if (cambio('frecuencia')) cambios.frecuencia = nuevos.frecuencia
  else if (cambio('periodo')) {
    const t = num('periodo')
    if (t === null || !(t > 0)) return { ok: false, clave: 'periodo', error: 'El periodo debe ser un número mayor que cero.' }
    cambios.frecuencia = textoDeNumero(1 / t, 6)
  }
  if (cambio('amplitud') || cambio('desplazamiento')) {
    if (cambio('amplitud')) cambios.amplitud = nuevos.amplitud
    if (cambio('desplazamiento')) cambios.desplazamiento = nuevos.desplazamiento
  } else if (cambio('minimo') || cambio('maximo')) {
    const [mn, mx] = [num('minimo'), num('maximo')]
    if (mn === null) return { ok: false, clave: 'minimo', error: 'El mínimo debe ser un número.' }
    if (mx === null) return { ok: false, clave: 'maximo', error: 'El máximo debe ser un número.' }
    if (mx < mn) return { ok: false, clave: cambio('maximo') ? 'maximo' : 'minimo', error: 'El máximo no puede ser menor que el mínimo.' }
    const { vpp, desplazamiento } = desdeExtremos(mn, mx)
    cambios.amplitud = textoDeNumero(vpp, 6)
    cambios.desplazamiento = textoDeNumero(desplazamiento, 6)
  }
  for (const k of ['desfase', 'retardo', 'pasos'] as const) if (cambio(k)) cambios[k] = nuevos[k]
  return { ok: true, cambios }
}

/** Los ajustes de un generador nuevo, para lo que todavía no se ha escrito. */
export const AJUSTES_POR_OMISION: AjustesGenerador = { forma: 'Senoidal', frecuencia: 1000, vpp: 2, desplazamiento: 0, simetria: 0.5, ciclo: 0.25, desfase: 0, retardo: 0, pasos: 4, salida: true, ideal: false }

/** Ajustes que dibuja el editor del doble clic a partir de los textos: cada cifra ilegible conserva la de `previo`, para
 * que la ficha no salte mientras se escribe a medias. No valida rangos, eso lo hace «aceptar». */
export function ajustesDeTextos(t: Record<string, string | undefined>, previo: AjustesGenerador = AJUSTES_POR_OMISION): AjustesGenerador {
  const num = (k: string, v: number): number => {
    const x = t[k] === undefined ? null : leerValor(t[k]!)
    return x && Number.isFinite(x.valor) ? x.valor : v
  }
  const pos = (k: string, v: number): number => (t[k] === undefined ? v : (leerPosicion(t[k]!) ?? v))
  const forma = (FORMAS as readonly string[]).includes(t.forma ?? '') ? (t.forma as AjustesGenerador['forma']) : previo.forma
  return {
    forma,
    frecuencia: Math.max(num('frecuencia', previo.frecuencia), 1e-12),
    vpp: Math.max(num('amplitud', previo.vpp), 0),
    desplazamiento: num('desplazamiento', previo.desplazamiento),
    simetria: pos('simetria', previo.simetria),
    ciclo: pos('ciclo', previo.ciclo),
    desfase: num('desfase', previo.desfase),
    retardo: Math.max(num('retardo', previo.retardo), 0),
    pasos: Math.round(num('pasos', previo.pasos)),
    salida: t.salida === undefined ? previo.salida : t.salida === 'encendida',
    ideal: t.ideal === undefined ? previo.ideal : t.ideal === 'sí'
  }
}
