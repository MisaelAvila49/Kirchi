import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { conLimite, ErrorPdf, hojaPara, htmlParaPdf, MARGEN_HOJA_MM, paginaValida, peticionPdfPermitida, svgValido } from './pdf'

/** Forma exacta de lo que arma `svgDeEscena`. Si la exportación agrega elementos o atributos, se agregan aquí y en la lista blanca de `pdf.ts`. */
const EXPORTADO = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="62.5mm" height="45mm" viewBox="-4 -6 50 36">',
  '<title>práctica &lt;3&gt; &amp; más.kir</title>',
  '<desc>Esquema exportado con Kirchi. Fuentes incrustadas sin modificar, con la SIL Open Font License 1.1 (https://openfontlicense.org): Mona Sans (c) 2022 The Mona Sans Project Authors.</desc>',
  "<style>@font-face{font-family:'Mona Sans Variable';font-style:normal;font-weight:200 900;font-stretch:75% 125%;unicode-range:U+0000-00FF,U+0131,U+2000-206F;src:url(data:font/woff2;base64,d09GMgABAAAAA+/=) format('woff2')}",
  "@font-face{font-family:'Geist Mono Variable';font-style:italic;font-weight:100 900;font-stretch:100%;unicode-range:U+0100-02BA;src:url(data:font/woff2;base64,AAAA) format('woff2')}",
  'text{font-kerning:none;white-space:pre}</style>',
  '<rect x="-4" y="-6" width="50" height="36" fill="#f7f6f2"/>',
  '<defs><pattern id="rejilla-menor" x="-1" y="-1" width="2" height="2" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.12" fill="#d8d4c8" fill-opacity="0.5"/></pattern><pattern id="rejilla-mayor" x="-5" y="-5" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="0.18" fill="#c8c2b4"/></pattern></defs>',
  '<rect x="-4" y="-6" width="50" height="36" fill="url(#rejilla-menor)"/>',
  '<rect x="-4" y="-6" width="50" height="36" fill="url(#rejilla-mayor)"/>',
  '<path d="M0 0L1 0L0.5 1Z" fill="#1f2328" stroke="none"/>',
  '<g fill="none" stroke-linecap="round" stroke-linejoin="round">',
  '<path d="M0 0L10 0L10 -5.5" stroke-width="0.25" stroke="#1f2328"/>',
  '<circle cx="10" cy="0" r="0.4" fill="#0f7b6c" stroke="none"/>',
  '</g>',
  '<text x="12" y="-3.2" font-family="&apos;Mona Sans Variable&apos;, sans-serif" font-size="1.6" font-weight="700" font-style="italic" text-anchor="middle" textLength="8.5" fill="#1f2328">R1 4.7 kΩ</text>',
  '<text x="12" y="3" font-family="\'Geist Mono Variable\', monospace" font-size="1.6" fill="#1f2328" fill-opacity="0.8">VSAL</text>',
  '<rect x="7.75" y="3.4" width="8.5" height="0.1" fill="#1f2328"/>',
  '</svg>',
  ''
].join('\n')

describe('página del PDF', () => {
  it('ajustar: la hoja es el dibujo', () => {
    expect(hojaPara({ tipo: 'ajustar', anchoMm: 120, altoMm: 80 })).toEqual({ anchoMm: 120, altoMm: 80, dibujoAnchoMm: 120, dibujoAltoMm: 80, horizontal: true })
  })

  it('A4 y carta: horizontal si el dibujo es más ancho, a escala real si cabe', () => {
    expect(hojaPara({ tipo: 'a4', anchoMm: 120, altoMm: 80 })).toEqual({ anchoMm: 297, altoMm: 210, dibujoAnchoMm: 120, dibujoAltoMm: 80, horizontal: true })
    expect(hojaPara({ tipo: 'carta', anchoMm: 50, altoMm: 90 })).toMatchObject({ anchoMm: 215.9, altoMm: 279.4, dibujoAnchoMm: 50, horizontal: false })
  })

  it('un dibujo que no cabe se reduce con su proporción y nunca se amplía', () => {
    const h = hojaPara({ tipo: 'a4', anchoMm: 600, altoMm: 300 })
    expect(h.dibujoAnchoMm).toBeCloseTo(297 - 2 * MARGEN_HOJA_MM, 9)
    expect(h.dibujoAnchoMm / h.dibujoAltoMm).toBeCloseTo(2, 9)
    expect(h.dibujoAltoMm).toBeLessThanOrEqual(210 - 2 * MARGEN_HOJA_MM)
  })

  it('valida lo que llega por IPC', () => {
    expect(paginaValida({ tipo: 'a4', anchoMm: 10, altoMm: 10 })).toBe(true)
    for (const p of [null, 'a4', { tipo: 'oficio', anchoMm: 10, altoMm: 10 }, { tipo: 'a4', anchoMm: -1, altoMm: 10 }, { tipo: 'a4', anchoMm: 1e9, altoMm: 10 }, { tipo: 'a4', anchoMm: NaN, altoMm: 1 }])
      expect(paginaValida(p)).toBe(false)
  })

  it('el HTML trae la hoja con @page, el SVG en línea sin la declaración XML y su tamaño en la hoja', () => {
    const html = htmlParaPdf('<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>\n', { tipo: 'a4', anchoMm: 120, altoMm: 80 })
    expect(html).toContain('@page{size:297mm 210mm;margin:0}')
    expect(html).toContain('body>svg{display:block;width:120mm;height:80mm;flex:none}')
    expect(html).toContain('<body><svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(html).not.toContain('<?xml')
  })

  it('solo imprime algo que parece el SVG de la exportación', () => {
    expect(svgValido('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', 100)).toBe(true)
    expect(svgValido('<svg><script>alert(1)</script></svg>', 100)).toBe(false)
    expect(svgValido('<html><svg></svg></html>', 100)).toBe(false)
    expect(svgValido('<svg>' + 'x'.repeat(200) + '</svg>', 100)).toBe(false)
    expect(svgValido(42, 100)).toBe(false)
  })

  it('acepta lo que arma la exportación: fuentes incrustadas, rejilla, rellenos, trazos, textos y subrayado', () => {
    expect(svgValido(EXPORTADO, 1e6)).toBe(true)
  })

  it('rechaza también guiones por atributos y elementos que cargan otra cosa', () => {
    for (const malo of ['<svg onload="x()"></svg>', '<svg><rect onclick = "x()"/></svg>', '<svg><iframe src="a"/></svg>', '<svg><object data="a"/></svg>', '<svg><embed src="a"/></svg>', '<svg><a href="javascript:x()"/></svg>'])
      expect(svgValido(malo, 1000)).toBe(false)
    // Un texto que contiene «one=» fuera de una etiqueta no es un atributo.
    expect(svgValido('<svg><text>one=1 on=2</text></svg>', 1000)).toBe(true)
  })

  it('ataque: lo que una lista negra deja pasar no pasa la lista blanca', () => {
    const malos = [
      // Eventos en cualquier forma: mayúsculas, sin comillas, comillas simples, tras una barra.
      '<svg OnLoad="x()"></svg>',
      '<svg onload=x()></svg>',
      "<svg><rect onclick='x()'/></svg>",
      '<svg/onload="x()"></svg>',
      '<svg><rect/onclick="x()"/></svg>',
      // Elementos y atributos que cargan o enlazan algo.
      '<svg><image href="http://x/a.png"/></svg>',
      '<svg><use xlink:href="#a"/></svg>',
      '<svg><a href="#a"><rect/></a></svg>',
      '<svg><SCRIPT>x()</SCRIPT></svg>',
      '<svg><animate attributeName="href" to="javascript:x()"/></svg>',
      '<svg><set attributeName="onmouseover" to="x()"/></svg>',
      '<svg><rect style="fill:url(http://x/a)"/></svg>',
      '<svg><rect fill="url(http://x/a)"/></svg>',
      '<svg xmlns="http://www.w3.org/1999/xhtml"></svg>',
      // Salir del SVG al HTML: etiquetas de HTML, integraciones de HTML dentro de title y desc.
      '<svg><p><img src=x onerror="x()"></p></svg>',
      '<svg><desc><img src="x" onerror="x()"></desc></svg>',
      '<svg><title><style>*{}</style></title></svg>',
      '<svg></svg><script>x()</script>',
      '<svg><g></svg>',
      '<svg><g></rect></svg>',
      // Entidades, DTD, CDATA, comentarios, instrucciones.
      '<!DOCTYPE svg [<!ENTITY e "x">]><svg>&e;</svg>',
      '<svg><text>&e;</text></svg>',
      '<svg><![CDATA[<script>x()</script>]]></svg>',
      '<svg><!-- x --></svg>',
      '<?xml-stylesheet href="http://x/a.css"?><svg></svg>',
      '<svg><?php x ?></svg>',
      // CSS que sale a la red o se esconde con escapes.
      '<svg><style>@import url(http://x/a.css);</style></svg>',
      '<svg><style>text{background:url(http://x/a.png)}</style></svg>',
      "<svg><style>text{background:url('https://x/a.png')}</style></svg>",
      '<svg><style>text{background:\\75 rl(http://x/a.png)}</style></svg>',
      '<svg><style>text{background:image-set("http://x/a.png" 1x)}</style></svg>',
      '<svg><style>@font-face{src:url(http://x/f.woff2)}</style></svg>',
      '<svg><style>text{}</style><script>x()</script></svg>',
      '<svg><style>&lt;</style></svg>'
    ]
    for (const malo of malos) expect([malo, svgValido(malo, 10000)]).toEqual([malo, false])
  })

  it('la ventana que imprime solo carga su propio temporal y lo incrustado (data:, blob:)', () => {
    const tmp = join(tmpdir(), 'kirchi-pdf-1234.html')
    expect(peticionPdfPermitida(pathToFileURL(tmp).href, tmp)).toBe(true)
    expect(peticionPdfPermitida('data:font/woff2;base64,AAAA', tmp)).toBe(true)
    expect(peticionPdfPermitida('blob:null/1234', tmp)).toBe(true)
    for (const otra of [pathToFileURL(join(tmpdir(), 'otro.html')).href, 'file://atacante/s/x.html', 'file:///C:/Windows/win.ini', 'http://x/a', 'https://x/a', 'app://kirchi/index.html', 'ftp://x/a', 'no es url'])
      expect([otra, peticionPdfPermitida(otra, tmp)]).toEqual([otra, false])
    expect(peticionPdfPermitida(pathToFileURL(tmp).href, null)).toBe(false)
  })

  it('imprimir tiene tiempo límite: al vencer, rechaza con un error propio y llama a la limpieza', async () => {
    vi.useFakeTimers()
    try {
      let limpiado = 0
      const nunca = new Promise<number>(() => undefined)
      const p = conLimite(nunca, 30000, () => limpiado++)
      vi.advanceTimersByTime(29999)
      expect(limpiado).toBe(0)
      vi.advanceTimersByTime(1)
      await expect(p).rejects.toBeInstanceOf(ErrorPdf)
      await expect(p).rejects.toThrow('tardó más de 30 s')
      expect(limpiado).toBe(1)
      await expect(conLimite(Promise.resolve(7), 30000, () => limpiado++)).resolves.toBe(7)
      vi.advanceTimersByTime(60000)
      expect(limpiado).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('el HTML se imprime con una política que prohíbe guiones y red', () => {
    const html = htmlParaPdf('<svg></svg>', { tipo: 'ajustar', anchoMm: 10, altoMm: 10 })
    expect(html).toContain('http-equiv="Content-Security-Policy"')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("script-src 'none'")
  })
})
