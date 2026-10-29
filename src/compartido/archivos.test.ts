import { describe, expect, it } from 'vitest'
import { cambiarExtension, carpetaDeRuta, esRutaImportable, esRutaKir, extension, nombreDeRuta, rutaKirDeArgumentos, rutasKirDeArgumentos } from './archivos'

describe('rutas', () => {
  it('nombre, carpeta y extensión con separadores de Windows y de Unix', () => {
    expect(nombreDeRuta('C:\\Users\\ana\\practica 3.kir')).toBe('practica 3.kir')
    expect(nombreDeRuta('/home/ana/practica.KIR')).toBe('practica.KIR')
    expect(carpetaDeRuta('C:\\Users\\ana\\p.kir')).toBe('C:\\Users\\ana')
    expect(carpetaDeRuta('p.kir')).toBe('')
    expect(extension('/home/ana/practica.KIR')).toBe('kir')
    expect(extension('C:\\carpeta.kir\\sin')).toBe('')
    expect(extension('.kir')).toBe('')
  })

  it('esRutaKir no se fía de la carpeta, solo del nombre', () => {
    expect(esRutaKir('C:\\a\\b.Kir')).toBe(true)
    expect(esRutaKir('C:\\a.kir\\b.txt')).toBe(false)
    expect(esRutaKir('C:\\a\\b.kir.exe')).toBe(false)
  })

  it('cambiarExtension', () => {
    expect(cambiarExtension('practica-3.kir', 'png')).toBe('practica-3.png')
    expect(cambiarExtension('sin título.kir', 'pdf')).toBe('sin título.pdf')
    expect(cambiarExtension('esquema', 'svg')).toBe('esquema.svg')
  })

  it('el .kir de la línea de órdenes: primer argumento que no es bandera, sin contar el ejecutable', () => {
    expect(rutaKirDeArgumentos(['C:\\Kirchi\\kirchi.exe', 'C:\\Users\\ana\\p.kir'])).toBe('C:\\Users\\ana\\p.kir')
    expect(rutaKirDeArgumentos(['electron.exe', '.', '--pruebas', '/tmp/a.kir', '/tmp/b.kir'])).toBe('/tmp/a.kir')
    expect(rutaKirDeArgumentos(['electron.exe', '.', '--datos=/tmp/x.kir'])).toBeNull()
    expect(rutaKirDeArgumentos(['x.kir'])).toBeNull()
    expect(rutaKirDeArgumentos(['kirchi.exe', `C:\\${'a'.repeat(5000)}.kir`])).toBeNull()
  })

  describe('rutasKirDeArgumentos (la línea de órdenes no es de fiar)', () => {
    const exe = '/opt/Kirchi/kirchi'
    it('varias rutas: en orden, sin repetidas y con tope', () => {
      expect(rutasKirDeArgumentos([exe, '/a.kir', '/b.kir', '/a.kir'])).toEqual(['/a.kir', '/b.kir'])
      const muchas = Array.from({ length: 12 }, (_, i) => `/c${i}.kir`)
      expect(rutasKirDeArgumentos([exe, ...muchas])).toEqual(muchas.slice(0, 4))
    })
    it('las banderas inyectadas no cuentan, ni siquiera con aspecto de .kir', () => {
      expect(rutasKirDeArgumentos([exe, '--inspect=9229', '--datos=/x', '--pruebas', '--devtools', '--remote-debugging-port=1.kir', '/a.kir'])).toEqual(['/a.kir'])
      expect(rutasKirDeArgumentos([exe, '--datos=/x/a.kir'])).toEqual([])
    })
    it('extensiones falsas, sin extensión y archivos ocultos', () => {
      expect(rutasKirDeArgumentos([exe, '/a.kir.exe', '/a.kirx', '/kir', '/.kir', '/a.txt', '/a.KIR'])).toEqual(['/a.KIR'])
    })
    it('nulos, saltos de línea, largos absurdos y textos que no lo son', () => {
      expect(rutasKirDeArgumentos([exe, '/a\0.kir', '/a\n.kir', `/${'x'.repeat(5000)}.kir`, '', ' '])).toEqual([])
      expect(rutasKirDeArgumentos([exe, 7 as unknown as string, undefined as unknown as string, '/ok.kir'])).toEqual(['/ok.kir'])
    })
    it('rutas raras pasan tal cual (relativas, de red, con espacios): quien abre decide', () => {
      const red = '//srv/c/r.kir'
      expect(rutasKirDeArgumentos([exe, 'práctica 3.kir', red, '../x.kir'])).toEqual(['práctica 3.kir', red, '../x.kir'])
    })
    it('sin argumentos o solo el ejecutable: nada', () => {
      expect(rutasKirDeArgumentos([])).toEqual([])
      expect(rutasKirDeArgumentos([exe])).toEqual([])
      expect(rutasKirDeArgumentos(['x.kir'])).toEqual([])
    })
  })
})

describe('esRutaImportable', () => {
  it('reconoce las extensiones de otros programas sin importar mayúsculas y no los .kir ni otros', () => {
    for (const r of ['a.asc', 'B.CIR', 'c.net', 'd.sp', 'e.spi', 'f.txt', 'g.kicad_sch', 'h.pdsprj']) expect(esRutaImportable(r)).toBe(true)
    for (const r of ['a.kir', 'a.png', 'asc', '.asc']) expect(esRutaImportable(r)).toBe(false)
  })
})
