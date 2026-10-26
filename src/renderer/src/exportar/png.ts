/** PNG desde el SVG exportado: el navegador dibuja la geometría y encima van los textos con Canvas2D, porque en un SVG
 * usado como imagen las fuentes incrustadas cargan tras el primer dibujo (salían sin letras).
 * Se agrega la resolución en ppp para pegarlo a escala real en un procesador de textos. */

/** El 100 % del zoom: 96 ppp. La escala del PNG es un múltiplo de esto. */
export const PPP_BASE = 96
/** Lado máximo de un lienzo de Chromium. */
export const LADO_MAXIMO_PNG = 16384
/** Píxeles máximos de un PNG (32 MP, unos 128 MB en memoria mientras se arma): un A3 cabe a 4×. */
export const AREA_MAXIMA_PNG = 32_000_000

export interface TamañoPng {
  ancho: number
  alto: number
  /** Escala que de verdad se usó: menor que la pedida si el dibujo no cabía. */
  escala: number
  reducida: boolean
}

const PX_POR_MM = PPP_BASE / 25.4

/** Píxeles del PNG de una lámina de `anchoMm` × `altoMm` a `escala` (1 = 96 ppp), sin pasar de los límites. */
export function tamañoPng(anchoMm: number, altoMm: number, escala: number): TamañoPng {
  const w = anchoMm * PX_POR_MM, h = altoMm * PX_POR_MM
  const tope = Math.min(LADO_MAXIMO_PNG / w, LADO_MAXIMO_PNG / h, Math.sqrt(AREA_MAXIMA_PNG / (w * h)))
  const s = Math.min(escala, tope)
  return { ancho: Math.max(1, Math.floor(w * s)), alto: Math.max(1, Math.floor(h * s)), escala: s, reducida: s < escala }
}

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 de PNG (ISO 3309) de `bytes`. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const FIRMA = [137, 80, 78, 71, 13, 10, 26, 10]
const u32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
const tipo = (b: Uint8Array, i: number) => String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7])

/** PNG con un bloque pHYs (píxeles por metro) justo tras IHDR, reemplazando el que traiga. Lo que no es PNG se devuelve
 * igual. */
export function conPpp(png: Uint8Array, ppp: number): Uint8Array {
  if (png.length < 33 || FIRMA.some((v, i) => png[i] !== v) || tipo(png, 8) !== 'IHDR') return png
  const ppm = Math.round(ppp / 0.0254)
  const datos = new Uint8Array(13)
  const vista = new DataView(datos.buffer)
  datos.set([0x70, 0x48, 0x59, 0x73]) // «pHYs»
  vista.setUint32(4, ppm)
  vista.setUint32(8, ppm)
  datos[12] = 1 // unidad: metro
  const bloque = new Uint8Array(21)
  const vb = new DataView(bloque.buffer)
  vb.setUint32(0, 9)
  bloque.set(datos, 4)
  vb.setUint32(17, crc32(datos))
  const partes: Uint8Array[] = [png.subarray(0, 33), bloque]
  for (let i = 33; i + 12 <= png.length; ) {
    const fin = i + 12 + u32(png, i)
    if (tipo(png, i) !== 'pHYs') partes.push(png.subarray(i, fin))
    i = fin
  }
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of partes) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** El SVG con su tamaño en píxeles en lugar de mm: así el navegador lo dibuja a la resolución del PNG. */
export const svgEnPixeles = (svg: string, ancho: number, alto: number): string => svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, `width="${ancho}" height="${alto}"`)

/** Pinta `encima` sobre el lienzo ya dibujado con `save()`/`restore()`. El dibujo de textos empieza con `clearRect`, que
 * aquí borraría la geometría, así que durante la llamada no hace nada.
 * Evita un segundo lienzo del tamaño de la imagen (128 MB en un PNG de 32 MP). */
export function pintarEncima(ctx: CanvasRenderingContext2D, encima: (ctx: CanvasRenderingContext2D) => void): void {
  ctx.save()
  const propio = Object.getOwnPropertyDescriptor(ctx, 'clearRect')
  Object.defineProperty(ctx, 'clearRect', { value: () => {}, configurable: true, writable: true })
  try {
    encima(ctx)
  } finally {
    if (propio) Object.defineProperty(ctx, 'clearRect', propio)
    else delete (ctx as unknown as Record<string, unknown>).clearRect
    ctx.restore()
  }
}

/** Dibuja el SVG en un lienzo de `ancho` × `alto`, luego `encima` (los textos, con las fuentes ya cargadas) y devuelve el
 * PNG con su resolución (`ppp`). */
export async function rasterizar(svg: string, ancho: number, alto: number, ppp: number, encima?: (ctx: CanvasRenderingContext2D) => void): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([svgEnPixeles(svg, ancho, alto)], { type: 'image/svg+xml' }))
  let img: HTMLImageElement | undefined
  let c: HTMLCanvasElement | undefined
  try {
    img = new Image()
    img.src = url
    await img.decode()
    const lienzo = (c = document.createElement('canvas'))
    lienzo.width = ancho
    lienzo.height = alto
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('no hay lienzo 2D')
    ctx.drawImage(img, 0, 0, ancho, alto)
    if (encima) {
      await document.fonts.ready
      pintarEncima(ctx, encima)
    }
    const blob = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, 'image/png'))
    if (!blob) throw new Error('el navegador no pudo armar el PNG')
    return conPpp(new Uint8Array(await blob.arrayBuffer()), ppp)
  } finally {
    URL.revokeObjectURL(url)
    // Soltar los píxeles ya: el lienzo de un PNG grande pesa cientos de MB hasta que el recolector pase.
    if (c) c.width = c.height = 0
    if (img) img.src = ''
  }
}
