import type { Texto } from '../lienzo/etiquetas'
import { fuenteCanvas, type Fuentes } from '../lienzo/texto'

/** Fuentes incrustadas en el SVG (y por él en PNG y PDF): los mismos `.woff2` de la interfaz, sin modificar (la OFL no
 * permite renombrarlos), solo los subconjuntos que usan los textos. Por carácter se toma la primera familia de la pila
 * que lo tiene, como el navegador. Nada sale a internet. */

export interface CaraFuente {
  /** Nombre de la familia sin comillas («Mona Sans Variable»). */
  familia: string
  estilo: 'normal' | 'italic'
  /** Valores tal cual del @font-face («200 900», «75% 125%»), para escribirlos igual. */
  peso: string
  ancho: string
  /** `unicode-range` tal cual y ya leído en intervalos. */
  rango: string
  intervalos: [number, number][]
  /** URL del archivo dentro de la aplicación. */
  url: string
}

/** «U+0-FF, U+131, U+4??» → intervalos de puntos de código. Lo que no se entiende se ignora. */
export function leerRangoUnicode(texto: string): [number, number][] {
  const out: [number, number][] = []
  for (const parte of texto.split(',')) {
    const m = /^\s*U\+([0-9A-F?]{1,6})(?:-([0-9A-F]{1,6}))?\s*$/i.exec(parte)
    if (!m) continue
    if (m[1].includes('?')) out.push([parseInt(m[1].replace(/\?/g, '0'), 16), parseInt(m[1].replace(/\?/g, 'F'), 16)])
    else out.push([parseInt(m[1], 16), parseInt(m[2] ?? m[1], 16)])
  }
  return out
}

/** «'Mona Sans Variable', "Source Serif 4 Variable", system-ui» → nombres sin comillas, en orden. */
export function familiasDePila(pila: string): string[] {
  return pila
    .split(',')
    .map((f) => f.trim().replace(/^(['"])(.*)\1$/, '$2'))
    .filter(Boolean)
}

const pilaDe = (t: Pick<Texto, 'fuente'>, f: Fuentes): string => (t.fuente === 'cifras' ? f.cifras : t.fuente === 'serif' ? f.serif : f.interfaz)

const cubre = (c: CaraFuente, cp: number) => c.intervalos.some(([a, b]) => cp >= a && cp <= b)

/** ¿La familia trae el glifo? El `unicode-range` de un subconjunto puede abarcar letras que la fuente no tiene. */
export type TieneGlifo = (familia: string, caracter: string, estilo: 'normal' | 'italic') => boolean

/** Caras que necesita una lista de textos. Un carácter fuera de las fuentes incluidas (lo dibujaría el sistema) no pide
 * ninguna; una cursiva ausente usa la normal.
 * Mona Sans latino abarca la µ pero no la dibuja: `tiene` lo detecta y pide la cara de Source Serif, como en pantalla. */
export function carasNecesarias(
  textos: readonly Pick<Texto, 'texto' | 'fuente' | 'cursiva'>[],
  caras: readonly CaraFuente[],
  fuentes: Fuentes,
  tiene: TieneGlifo = () => true
): CaraFuente[] {
  const usadas = new Set<CaraFuente>()
  const porFamilia = new Map<string, CaraFuente[]>()
  for (const c of caras) porFamilia.set(c.familia, [...(porFamilia.get(c.familia) ?? []), c])
  const vistos = new Set<string>()
  for (const t of textos) {
    const familias = familiasDePila(pilaDe(t, fuentes))
    const estilo = t.cursiva ? 'italic' : 'normal'
    for (const ch of t.texto) {
      const cp = ch.codePointAt(0)!
      const clave = `${t.fuente}|${estilo}|${cp}`
      if (vistos.has(clave)) continue
      vistos.add(clave)
      for (const fam of familias) {
        const deFam = porFamilia.get(fam)
        if (!deFam) continue
        const delEstilo = deFam.filter((c) => c.estilo === estilo)
        const c = (delEstilo.length ? delEstilo : deFam).find((x) => cubre(x, cp))
        if (c && tiene(fam, ch, estilo)) {
          usadas.add(c)
          break
        }
      }
    }
  }
  return caras.filter((c) => usadas.has(c))
}

/** @font-face de cada cara con su archivo en base64 (`datos` por URL). Las caras sin datos se omiten. */
export function cssDeCaras(caras: readonly CaraFuente[], datos: ReadonlyMap<string, string>): string {
  return caras
    .filter((c) => datos.has(c.url))
    .map(
      (c) =>
        `@font-face{font-family:'${c.familia}';font-style:${c.estilo};font-weight:${c.peso};font-stretch:${c.ancho};unicode-range:${c.rango};src:url(data:font/woff2;base64,${datos.get(c.url)}) format('woff2')}`
    )
    .join('\n')
}

/** Bytes a base64 por trozos (`String.fromCharCode` con un arreglo enorme desborda la pila). */
export function aBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Las caras de las hojas de estilo de la página (las de Fontsource que importa `main.tsx`). */
export function carasDelDocumento(doc: Document = document): CaraFuente[] {
  const out: CaraFuente[] = []
  for (const hoja of Array.from(doc.styleSheets)) {
    let reglas: CSSRuleList
    try {
      reglas = hoja.cssRules
    } catch {
      continue
    }
    for (const r of Array.from(reglas)) {
      if (!(r instanceof CSSFontFaceRule)) continue
      const s = r.style
      const src = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(s.getPropertyValue('src'))?.[1]
      if (!src) continue
      const rango = s.getPropertyValue('unicode-range') || 'U+0-10FFFF'
      out.push({
        familia: familiasDePila(s.getPropertyValue('font-family'))[0] ?? '',
        estilo: s.getPropertyValue('font-style') === 'italic' ? 'italic' : 'normal',
        peso: s.getPropertyValue('font-weight') || 'normal',
        ancho: s.getPropertyValue('font-stretch') || 'normal',
        rango,
        intervalos: leerRangoUnicode(rango),
        url: new URL(src, hoja.href ?? doc.baseURI).href
      })
    }
  }
  return out
}

/** Detector de glifos: `medir` da el ancho de `caracter` con la familia y un respaldo, `cargada` dice si la familia ya
 * está disponible. Una medida antes de cargar solo vio el respaldo y no se guarda. */
export function crearTieneGlifo(
  medir: (familia: string, estilo: 'normal' | 'italic', caracter: string, respaldo: 'monospace' | 'serif') => number,
  cargada: (familia: string, estilo: 'normal' | 'italic', caracter: string) => boolean
): TieneGlifo {
  const glifos = new Map<string, boolean>()
  return (familia, caracter, estilo) => {
    const k = `${familia}|${estilo}|${caracter}`
    const v = glifos.get(k)
    if (v !== undefined) return v
    const r = medir(familia, estilo, caracter, 'monospace') === medir(familia, estilo, caracter, 'serif')
    if (cargada(familia, estilo, caracter)) glifos.set(k, r)
    return r
  }
}

let medidor: CanvasRenderingContext2D | null = null

/** ¿La familia (ya cargada) dibuja `caracter`? Se mide con dos respaldos muy distintos: si el ancho cambia con el
 * respaldo, la letra no es de la familia. */
export const glifoEnDocumento: TieneGlifo = crearTieneGlifo(
  (familia, estilo, caracter, respaldo) => {
    medidor ??= document.createElement('canvas').getContext('2d')
    if (!medidor) return 0
    medidor.font = `${estilo === 'italic' ? 'italic ' : ''}40px '${familia}', ${respaldo}`
    return medidor.measureText(caracter).width
  },
  (familia, estilo, caracter) => document.fonts?.check(`${estilo === 'italic' ? 'italic ' : ''}40px '${familia}'`, caracter) ?? true
)

/** Lo que usa `cargarFuentesDeTextos` de un `FontFaceSet`. */
export interface CargadorFuentes {
  load(fuente: string, texto?: string): Promise<unknown>
}

/** Carga las caras que dibujan estos textos, estén a la vista o no. Hay que esperarla antes de medir línea base o glifo:
 * la página solo carga lo visible y medir antes da el respaldo. Una cara que no carga se ignora (se usa la siguiente de
 * la pila). */
export async function cargarFuentesDeTextos(
  textos: readonly Pick<Texto, 'texto' | 'fuente' | 'cursiva' | 'negrita'>[],
  fuentes: Fuentes,
  cargador: CargadorFuentes | undefined = typeof document === 'undefined' ? undefined : document.fonts
): Promise<void> {
  if (!cargador) return
  const porFuente = new Map<string, Set<string>>()
  for (const t of textos) {
    const f = fuenteCanvas(t, 16, fuentes)
    let cs = porFuente.get(f)
    if (!cs) porFuente.set(f, (cs = new Set()))
    for (const ch of t.texto) cs.add(ch)
  }
  await Promise.all([...porFuente].map(([f, cs]) => cargador.load(f, [...cs].join('')).catch(() => undefined)))
}

const cache = new Map<string, Promise<string>>()

/** CSS de las fuentes que usan `textos`, con los archivos leídos de la aplicación (una vez por sesión cada uno). `leer` se
 * reemplaza en las pruebas. */
export async function cssDeFuentes(
  textos: readonly Pick<Texto, 'texto' | 'fuente' | 'cursiva'>[],
  fuentes: Fuentes,
  caras: readonly CaraFuente[] = carasDelDocumento(),
  leer: (url: string) => Promise<Uint8Array> = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer()),
  tiene: TieneGlifo = glifoEnDocumento
): Promise<string> {
  const usadas = carasNecesarias(textos, caras, fuentes, tiene)
  const datos = new Map<string, string>()
  for (const c of usadas) {
    let p = cache.get(c.url)
    if (!p) {
      p = leer(c.url).then(aBase64)
      cache.set(c.url, p)
      p.catch(() => cache.delete(c.url))
    }
    try {
      datos.set(c.url, await p)
    } catch {
      // Una cara que no se pudo leer se omite: el visor usará la siguiente fuente de la pila.
    }
  }
  return cssDeCaras(usadas, datos)
}
