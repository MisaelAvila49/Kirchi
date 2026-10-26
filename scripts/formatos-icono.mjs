// Contenedores de icono sin dependencias: .ico y .icns con imágenes PNG dentro.
// Los PNG los genera scripts/generar-iconos.mjs (Chromium sin ventana) a partir de build/*.svg.

/** .ico: cabecera, un renglón por imagen y los PNG. Los lados de 256 o más se escriben como 0, según el formato. */
export function construirIco(imagenes) {
  const lista = [...imagenes].sort((a, b) => a.lado - b.lado)
  const cabecera = Buffer.alloc(6 + 16 * lista.length)
  cabecera.writeUInt16LE(0, 0)
  cabecera.writeUInt16LE(1, 2)
  cabecera.writeUInt16LE(lista.length, 4)
  let desplazamiento = cabecera.length
  lista.forEach((im, i) => {
    if (im.lado > 256) throw new Error('un .ico no admite imágenes de más de 256 px')
    const o = 6 + 16 * i
    const lado = im.lado === 256 ? 0 : im.lado
    cabecera.writeUInt8(lado, o)
    cabecera.writeUInt8(lado, o + 1)
    cabecera.writeUInt8(0, o + 2)
    cabecera.writeUInt8(0, o + 3)
    cabecera.writeUInt16LE(1, o + 4)
    cabecera.writeUInt16LE(32, o + 6)
    cabecera.writeUInt32LE(im.png.length, o + 8)
    cabecera.writeUInt32LE(desplazamiento, o + 12)
    desplazamiento += im.png.length
  })
  return Buffer.concat([cabecera, ...lista.map((im) => im.png)])
}

/** Tipo de bloque de .icns para cada lado en píxeles (los de 2x repiten el PNG del lado doble). */
export const TIPOS_ICNS = [
  ['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]
]

/** .icns: 'icns', largo total y bloques [tipo, largo, PNG], todo en big endian. */
export function construirIcns(porLado) {
  const bloques = []
  for (const [tipo, lado] of TIPOS_ICNS) {
    const png = porLado.get(lado)
    if (!png) continue
    const cab = Buffer.alloc(8)
    cab.write(tipo, 0, 'ascii')
    cab.writeUInt32BE(8 + png.length, 4)
    bloques.push(cab, png)
  }
  const total = 8 + bloques.reduce((n, b) => n + b.length, 0)
  const cab = Buffer.alloc(8)
  cab.write('icns', 0, 'ascii')
  cab.writeUInt32BE(total, 4)
  return Buffer.concat([cab, ...bloques])
}
