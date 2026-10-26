import { describe, expect, it } from 'vitest'
import { MAX_VENTANAS, planDeApertura, rutaDeAbrirArchivo, rutasDeLanzamiento } from './lanzamiento'

const exe = 'C:\\Users\\ana\\AppData\\Local\\Programs\\Kirchi\\Kirchi.exe'

describe('rutasDeLanzamiento (Windows)', () => {
  const r = (argv: string[], cwd = 'C:\\Users\\ana\\Documentos') => rutasDeLanzamiento(argv, cwd, 'win32')

  it('doble clic: una ruta absoluta tal cual', () => {
    expect(r([exe, 'C:\\Users\\ana\\Documentos\\práctica 3.kir'])).toEqual(['C:\\Users\\ana\\Documentos\\práctica 3.kir'])
  })
  it('varias rutas en orden, sin repetidas aunque cambien las mayúsculas o lleven ..', () => {
    expect(r([exe, 'C:\\a.kir', 'c:\\A.KIR', 'C:\\x\\..\\a.kir', 'C:\\b.kir'])).toEqual(['C:\\a.kir', 'C:\\b.kir'])
  })
  it('las relativas se resuelven desde la carpeta de quien lanzó', () => {
    expect(r([exe, 'p.kir', '..\\q.kir'], 'C:\\Users\\ana\\Documentos')).toEqual(['C:\\Users\\ana\\Documentos\\p.kir', 'C:\\Users\\ana\\q.kir'])
  })
  it('banderas inyectadas desde un doble clic: --datos, --inspect y compañía no producen rutas', () => {
    expect(r([exe, '--inspect=9229', '--datos=C:\\tmp\\x.kir', '--pruebas', '--devtools', '--user-data-dir=C:\\t.kir'])).toEqual([])
    expect(r([exe, '--inspect-brk', 'C:\\a.kir'])).toEqual(['C:\\a.kir'])
  })
  it('extensiones falsas y archivos que no son .kir', () => {
    expect(r([exe, 'C:\\a.kir.exe', 'C:\\a.kir.lnk', 'C:\\a.txt', 'C:\\a.kirx', 'C:\\kir', 'C:\\a.kir '])).toEqual([])
  })
  it('rutas de red y de dispositivo pasan al servicio, que decide (la asociación las trae del explorador)', () => {
    expect(r([exe, '\\\\srv\\c\\a.kir'])).toEqual(['\\\\srv\\c\\a.kir'])
    expect(r([exe, 'C:\\NUL.kir'])).toEqual(['C:\\NUL.kir'])
  })
  it('una carpeta de arranque que no es de fiar (vacía, relativa, no texto) no rompe nada', () => {
    expect(rutasDeLanzamiento([exe, 'p.kir'], '', 'win32')[0]).toMatch(/^[A-Za-z]:\\p\.kir$|^\\p\.kir$|p\.kir$/)
    expect(() => rutasDeLanzamiento([exe, 'p.kir'], undefined as unknown as string, 'win32')).not.toThrow()
  })
  it('lo que no es texto se ignora', () => {
    expect(r([exe, null as unknown as string, 5 as unknown as string, 'C:\\ok.kir'])).toEqual(['C:\\ok.kir'])
  })
})

describe('rutasDeLanzamiento (macOS y Linux)', () => {
  it('distingue mayúsculas en Linux y no en macOS', () => {
    expect(rutasDeLanzamiento(['/opt/k', '/home/a/P.kir', '/home/a/p.kir'], '/home/a', 'linux')).toEqual(['/home/a/P.kir', '/home/a/p.kir'])
    expect(rutasDeLanzamiento(['/opt/k', '/Users/a/P.kir', '/Users/a/p.kir'], '/Users/a', 'darwin')).toEqual(['/Users/a/P.kir'])
  })
  it('relativas desde cwd y banderas descartadas', () => {
    expect(rutasDeLanzamiento(['/usr/bin/kirchi', '--no-sandbox', 'x/p.kir'], '/home/a', 'linux')).toEqual(['/home/a/x/p.kir'])
  })
  it('open-file entrega una sola ruta: solo vale si termina en .kir', () => {
    expect(rutaDeAbrirArchivo('/Users/a/p.kir', 'darwin')).toEqual(['/Users/a/p.kir'])
    expect(rutaDeAbrirArchivo('/Users/a/p.app', 'darwin')).toEqual([])
    expect(rutaDeAbrirArchivo('--inspect.kir', 'darwin')).toEqual([])
    expect(rutaDeAbrirArchivo(undefined, 'darwin')).toEqual([])
  })
})

describe('planDeApertura', () => {
  it('sin rutas no abre nada (solo se enfoca la ventana)', () => {
    expect(planDeApertura([], 1)).toEqual({ enLaVentana: null, enNuevas: [] })
  })
  it('la primera va a la ventana existente y el resto a ventanas nuevas', () => {
    expect(planDeApertura(['a', 'b', 'c'], 1)).toEqual({ enLaVentana: 'a', enNuevas: ['b', 'c'] })
  })
  it('nunca pasa del tope de ventanas', () => {
    const rutas = Array.from({ length: 20 }, (_, i) => `r${i}`)
    expect(planDeApertura(rutas, MAX_VENTANAS - 1).enNuevas).toEqual(['r1'])
    expect(planDeApertura(rutas, MAX_VENTANAS).enNuevas).toEqual([])
    expect(planDeApertura(rutas, 0).enNuevas).toHaveLength(MAX_VENTANAS - 1)
  })
})
