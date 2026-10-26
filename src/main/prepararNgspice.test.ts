import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// La lógica del paso de construcción que deja ngspice en resources/herramientas/ngspice (scripts/preparar-ngspice.mjs).
// Todo con archivos de mentira en una carpeta temporal y una función de descarga falsa: sin red.
const raiz = join(__dirname, '..', '..')
const p = (await import(pathToFileURL(join(raiz, 'scripts/preparar-ngspice.mjs')).href)) as {
  sumaSha256(d: Buffer): string
  asegurarArchivo(o: { cache: string; nombre: string; url: string; sha256: string; descargar?: (u: string) => Promise<{ datos: Buffer; longitud: number | null }> }): Promise<{ ruta: string; reutilizado: boolean }>
  seleccionarWindows(origen: string, destino: string, licencias?: string): string[]
  seleccionarUnix(instalado: string, destino: string, licencia: string, licencias?: string, plataforma?: string): string[]
  avisoNgspice(plataforma: string): string
  CONFIGURE_BASE: string[]
  ARCHIVOS_WINDOWS: string[]
  CONFIGURE_WINDOWS: string[]
  LDFLAGS_WINDOWS: string
  LIBS_WINDOWS: string
  MAKE_WINDOWS: string[]
  DLL_DE_WINDOWS: RegExp
  dllsImportadas(b: Buffer): string[]
  comprobarDependenciasWindows(spice64: string, licencias?: string): { modo: string; dlls: string[]; archivos: string[] }
  cierreDeDependencias(spice64: string): { ajenas: string[]; archivos: string[] }
  entornoLimpio(extra?: Record<string, string>, base?: Record<string, string>, plataforma?: string): Record<string, string>
  decidirRuntime(ajenas: string[], licencias: string[]): { modo: string; dlls: string[] }
  MODELOS_DE_CODIGO: string[]
  opcionesDeCompilacion(plataforma: string, env?: Record<string, string | undefined>): { configure: string[]; env: Record<string, string | undefined> }
}
const fuente = (await import(pathToFileURL(join(raiz, 'scripts/ngspice-fuente.mjs')).href)) as { WINDOWS: { sha256: string; url: string }; FUENTES: { sha256: string } }

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'kirchi-prep-'))
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

/** Una carpeta licencias/ de mentira: el COPYING revisado de ngspice, la GPL 2 y un texto de biblioteca de Windows. */
function licencias(copying: string): string {
  const base = join(tmp, 'licencias')
  mkdirSync(join(base, 'ngspice'), { recursive: true })
  mkdirSync(join(base, 'ngspice-windows'), { recursive: true })
  writeFileSync(join(base, 'ngspice', 'COPYING'), copying)
  writeFileSync(join(base, 'ngspice', 'GPL-2.0.txt'), 'GNU GENERAL PUBLIC LICENSE')
  writeFileSync(join(base, 'ngspice-windows', 'winpthreads.txt'), 'MIT')
  return base
}

const DATOS = Buffer.from('contenido del paquete de mentira')
const SUMA = p.sumaSha256(DATOS)
const descarga = (contador: { n: number }, longitud: number | null = DATOS.length) => async () => {
  contador.n++
  return { datos: DATOS, longitud }
}

describe('asegurarArchivo', () => {
  it('baja, comprueba la suma y deja el archivo en la caché', async () => {
    const c = { n: 0 }
    const r = await p.asegurarArchivo({ cache: join(tmp, 'cache'), nombre: 'a.7z', url: 'x', sha256: SUMA, descargar: descarga(c) })
    expect(r.reutilizado).toBe(false)
    expect(readFileSync(r.ruta)).toEqual(DATOS)
    expect(readdirSync(join(tmp, 'cache'))).toEqual(['a.7z'])
  })

  it('con una suma distinta falla y no deja nada en la caché', async () => {
    const c = { n: 0 }
    await expect(p.asegurarArchivo({ cache: join(tmp, 'cache'), nombre: 'a.7z', url: 'x', sha256: 'f'.repeat(64), descargar: descarga(c) })).rejects.toThrow(/no coincide/)
    expect(readdirSync(join(tmp, 'cache'))).toEqual([])
  })

  it('una descarga incompleta falla y no deja nada en la caché', async () => {
    const c = { n: 0 }
    await expect(p.asegurarArchivo({ cache: join(tmp, 'cache'), nombre: 'a.7z', url: 'x', sha256: SUMA, descargar: descarga(c, DATOS.length + 100) })).rejects.toThrow(/incompleta/)
    expect(readdirSync(join(tmp, 'cache'))).toEqual([])
  })

  it('reutiliza la caché sin descargar cuando la suma coincide', async () => {
    const c = { n: 0 }
    const o = { cache: join(tmp, 'cache'), nombre: 'a.7z', url: 'x', sha256: SUMA, descargar: descarga(c) }
    await p.asegurarArchivo(o)
    const r = await p.asegurarArchivo(o)
    expect(r.reutilizado).toBe(true)
    expect(c.n).toBe(1)
  })

  it('una copia dañada de la caché se descarta y se baja de nuevo', async () => {
    const c = { n: 0 }
    mkdirSync(join(tmp, 'cache'))
    writeFileSync(join(tmp, 'cache', 'a.7z'), 'medio archivo')
    const r = await p.asegurarArchivo({ cache: join(tmp, 'cache'), nombre: 'a.7z', url: 'x', sha256: SUMA, descargar: descarga(c) })
    expect(r.reutilizado).toBe(false)
    expect(c.n).toBe(1)
    expect(readFileSync(r.ruta)).toEqual(DATOS)
  })
})

describe('sumas fijadas', () => {
  it('la del paquete oficial de Windows (solo para las referencias del motor) y la del código fuente son SHA-256 de 64 dígitos', () => {
    expect(fuente.WINDOWS.sha256).toBe('59225971bd68cdd1199443649aa4615a9e6d684933f205ab49006a3942518f5a')
    expect(fuente.FUENTES.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(fuente.WINDOWS.url.startsWith('https://')).toBe(true)
  })
})

describe('seleccionarWindows', () => {
  /** Un `Spice64` de mentira con lo necesario y cosas que no deben viajar. */
  function paquete(sin?: string): string {
    const base = join(tmp, 'Spice64')
    const rutas = [...p.ARCHIVOS_WINDOWS, ...p.MODELOS_DE_CODIGO.map((m) => `lib/ngspice/${m}.cm`), 'docs/COPYING', 'bin/ngspice.exe', 'docs/ngspice-47-manual.pdf', 'examples/a.cir', 'lib/ngspice/psp103.osdi', 'bin/libomp140.x86_64.dll', 'bin/sndfile.dll']
    for (const r of rutas) {
      if (r === sin) continue
      mkdirSync(dirname(join(base, r)), { recursive: true })
      writeFileSync(join(base, r), r)
    }
    return base
  }

  it('copia lo necesario, la licencia y los avisos, y deja fuera ejemplos, manual y OSDI', () => {
    const destino = join(tmp, 'destino')
    const lista = p.seleccionarWindows(paquete(), destino, licencias('docs/COPYING'))
    expect(lista).toContain('bin/ngspice_con.exe')
    expect(existsSync(join(destino, 'Spice64', 'bin', 'ngspice_con.exe'))).toBe(true)
    expect(existsSync(join(destino, 'Spice64', 'share', 'ngspice', 'scripts', 'spinit'))).toBe(true)
    expect(existsSync(join(destino, 'Spice64', 'lib', 'ngspice', 'digital.cm'))).toBe(true)
    expect(readFileSync(join(destino, 'COPYING-ngspice.txt'), 'utf8')).toBe('docs/COPYING')
    expect(readFileSync(join(destino, 'AVISOS.txt'), 'utf8')).toContain('programa aparte')
    expect(readFileSync(join(destino, 'GPL-2.0.txt'), 'utf8')).toContain('GENERAL PUBLIC')
    expect(readFileSync(join(destino, 'licencias', 'winpthreads.txt'), 'utf8')).toBe('MIT')
    for (const fuera of ['bin/ngspice.exe', 'docs', 'examples', 'lib/ngspice/psp103.osdi', 'bin/libomp140.x86_64.dll', 'bin/sndfile.dll']) expect(existsSync(join(destino, 'Spice64', fuera)), fuera).toBe(false)
  })

  it('si falta un archivo falla nombrándolo y no toca el destino anterior', () => {
    const destino = join(tmp, 'destino')
    mkdirSync(destino)
    writeFileSync(join(destino, 'viejo.txt'), 'x')
    expect(() => p.seleccionarWindows(paquete('lib/ngspice/digital.cm'), destino, licencias('docs/COPYING'))).toThrow(/digital\.cm/)
    expect(existsSync(join(destino, 'viejo.txt'))).toBe(true)
  })

  it('un COPYING distinto del revisado detiene la construcción sin tocar el destino', () => {
    const destino = join(tmp, 'destino')
    mkdirSync(destino)
    writeFileSync(join(destino, 'viejo.txt'), 'x')
    expect(() => p.seleccionarWindows(paquete(), destino, licencias('otro texto'))).toThrow(/COPYING de ngspice no es el revisado/)
    expect(existsSync(join(destino, 'viejo.txt'))).toBe(true)
  })
})

describe('seleccionarUnix', () => {
  it('copia el ejecutable y los modelos de código, y exige los siete', () => {
    const inst = join(tmp, 'inst')
    mkdirSync(join(inst, 'bin'), { recursive: true })
    mkdirSync(join(inst, 'lib', 'ngspice'), { recursive: true })
    writeFileSync(join(inst, 'bin', 'ngspice'), 'bin')
    for (const m of p.MODELOS_DE_CODIGO) writeFileSync(join(inst, 'lib', 'ngspice', `${m}.cm`), m)
    writeFileSync(join(tmp, 'COPYING'), 'licencia')
    const destino = join(tmp, 'destino')
    const lic = licencias('licencia')
    expect(p.seleccionarUnix(inst, destino, join(tmp, 'COPYING'), lic, 'linux')).toHaveLength(7)
    expect(existsSync(join(destino, 'bin', 'ngspice'))).toBe(true)
    expect(readFileSync(join(destino, 'COPYING-ngspice.txt'), 'utf8')).toBe('licencia')
    expect(existsSync(join(destino, 'GPL-2.0.txt'))).toBe(true)
    expect(readFileSync(join(destino, 'AVISOS.txt'), 'utf8')).toContain('./configure --prefix=/opt/kirchi-ngspice')
    rmSync(join(inst, 'lib', 'ngspice', 'table.cm'))
    expect(() => p.seleccionarUnix(inst, join(tmp, 'otro'), join(tmp, 'COPYING'), lic)).toThrow(/table\.cm/)
  })
})

describe('avisos de licencia de ngspice', () => {
  it('dicen versión, partes con su licencia, la suma del código fuente y dónde está', () => {
    for (const pl of ['win32', 'linux', 'darwin']) {
      const a = p.avisoNgspice(pl)
      expect(a, pl).toContain('ngspice 47')
      for (const t of ['BSD', 'KLU', 'LGPL 2.1', 'numparam', 'Mozilla Public License 2.0', 'Dominio público', 'GPL 2 o posterior', 'GPL-2.0.txt']) expect(a, `${pl}: ${t}`).toContain(t)
      expect(a, pl).toContain(fuente.FUENTES.sha256)
      expect(a, pl).toContain('misma carpeta de descarga')
      expect(a, pl).not.toContain('—')
    }
    const win = p.avisoNgspice('win32')
    expect(win).toContain('MinGW-w64')
    expect(win).toContain('./configure ' + p.CONFIGURE_WINDOWS.join(' '))
    expect(win).not.toContain(fuente.WINDOWS.sha256)
    expect(win).not.toMatch(/libomp140|sndfile\.dll/)
    expect(p.avisoNgspice('darwin')).toContain('-arch arm64 -arch x86_64')
  })
})

describe('opciones de compilación de ngspice', () => {
  it('no enlaza bibliotecas de la máquina que compila (FFTW, libsndfile, libsamplerate) ni readline', () => {
    const o = p.opcionesDeCompilacion('linux', {})
    for (const op of ['--with-fftw3=no', 'ac_cv_lib_sndfile_sf_command=no', 'ac_cv_lib_samplerate_src_process=no', '--without-readline', '--enable-xspice']) expect(o.configure, op).toContain(op)
    expect(p.opcionesDeCompilacion('darwin', {}).configure).toEqual([...p.CONFIGURE_BASE, '--disable-dependency-tracking'])
  })
  it('en macOS compila para arm64 y x86_64 a la vez, sin seguimiento de dependencias', () => {
    const o = p.opcionesDeCompilacion('darwin', { CFLAGS: '-O2' })
    expect(o.env.CFLAGS).toBe('-O2 -arch arm64 -arch x86_64')
    expect(o.env.LDFLAGS).toBe('-arch arm64 -arch x86_64')
    expect(o.configure).toContain('--disable-dependency-tracking')
  })
  it('en Linux no cambia el entorno ni agrega opciones', () => {
    const env = { CFLAGS: '-O2' }
    const o = p.opcionesDeCompilacion('linux', env)
    expect(o.env).toBe(env)
    expect(o.configure).not.toContain('--disable-dependency-tracking')
  })
})

/** Un PE32+ mínimo que importa las DLL dadas (para probar el cierre de dependencias sin binarios reales). */
function peFalso(importa: string[]): Buffer {
  const b = Buffer.alloc(0x600)
  b.write('MZ', 0, 'latin1')
  b.writeUInt32LE(0x40, 0x3c)
  b.write('PE\0\0', 0x40, 'latin1')
  b.writeUInt16LE(1, 0x46) // secciones
  b.writeUInt16LE(240, 0x54) // tamaño del encabezado opcional
  const opt = 0x58
  b.writeUInt16LE(0x20b, opt)
  const dir = opt + 112
  b.writeUInt32LE(16, dir - 4)
  b.writeUInt32LE(0x1000, dir + 8) // RVA de la tabla de importaciones
  const sec = opt + 240
  b.writeUInt32LE(0x400, sec + 8)
  b.writeUInt32LE(0x1000, sec + 12)
  b.writeUInt32LE(0x400, sec + 16)
  b.writeUInt32LE(0x200, sec + 20)
  let nombres = 0x200 + 20 * (importa.length + 1)
  importa.forEach((n, i) => {
    b.writeUInt32LE(0x1000 + nombres - 0x200, 0x200 + 20 * i + 12)
    b.write(n + '\0', nombres, 'latin1')
    nombres += n.length + 1
  })
  return b
}

/** Un Spice64 de mentira: el ejecutable importa libstdc++ y esta importa libgcc_s (como en el paquete roto de 1.1.0). */
function spice64Falso(bin: Record<string, string[]>, ejecutable: string[]): string {
  const base = join(tmp, 'Spice64')
  mkdirSync(join(base, 'bin'), { recursive: true })
  mkdirSync(join(base, 'lib', 'ngspice'), { recursive: true })
  writeFileSync(join(base, 'bin', 'ngspice_con.exe'), peFalso(ejecutable))
  for (const [n, imp] of Object.entries(bin)) writeFileSync(join(base, 'bin', n), peFalso(imp))
  return base
}

describe('cierre transitivo de dependencias de Windows', () => {
  it('en Windows el entorno de prueba solo tiene System32 en el PATH; en otros sistemas no lo toca', () => {
    expect(p.entornoLimpio({ A: '1' }, { SystemRoot: 'C:\\Windows', PATH: 'C:\\msys64\\ucrt64\\bin' }, 'win32')).toEqual({ SystemRoot: 'C:\\Windows', PATH: join('C:\\Windows', 'System32'), A: '1' })
    expect(p.entornoLimpio({}, { PATH: '/usr/bin' }, 'linux')).toEqual({ PATH: '/usr/bin' })
  })
  it('lee las importaciones de un PE falso', () => {
    expect(p.dllsImportadas(peFalso(['KERNEL32.dll', 'libstdc++-6.dll']))).toEqual(['KERNEL32.dll', 'libstdc++-6.dll'])
  })
  it('incluye lo que piden las DLL ya entregadas (libstdc++ pide libgcc_s)', () => {
    const base = spice64Falso({ 'libstdc++-6.dll': ['KERNEL32.dll', 'libgcc_s_seh-1.dll', 'libwinpthread-1.dll'], 'libwinpthread-1.dll': ['KERNEL32.dll'] }, ['KERNEL32.dll', 'libstdc++-6.dll'])
    expect(p.cierreDeDependencias(base).ajenas.sort()).toEqual(['libgcc_s_seh-1.dll', 'libstdc++-6.dll', 'libwinpthread-1.dll'])
  })
  it('falla si falta una DLL que solo pide otra DLL entregada', () => {
    const base = spice64Falso({ 'libstdc++-6.dll': ['KERNEL32.dll', 'libgcc_s_seh-1.dll'] }, ['KERNEL32.dll', 'libstdc++-6.dll'])
    const lic = join(tmp, 'lic')
    mkdirSync(join(lic, 'ngspice-windows'), { recursive: true })
    for (const l of ['GPL-3.0.txt', 'gcc-runtime-exception.txt', 'winpthreads.txt']) writeFileSync(join(lic, 'ngspice-windows', l), 'x')
    expect(() => p.comprobarDependenciasWindows(base, lic)).toThrow(/libgcc_s_seh-1\.dll/)
    writeFileSync(join(base, 'bin', 'libgcc_s_seh-1.dll'), peFalso(['KERNEL32.dll']))
    expect(p.comprobarDependenciasWindows(base, lic).dlls).toEqual(['libgcc_s_seh-1.dll', 'libstdc++-6.dll'])
  })
  it('una DLL ajena que no es del tiempo de ejecución, pedida por una DLL entregada, detiene la construcción', () => {
    const base = spice64Falso({ 'libstdc++-6.dll': ['libomp140.x86_64.dll'] }, ['libstdc++-6.dll'])
    expect(() => p.comprobarDependenciasWindows(base, join(tmp, 'lic'))).toThrow(/libomp140/)
  })
})

describe('decisión sobre el tiempo de ejecución de MinGW', () => {
  const todas = ['GPL-3.0.txt', 'gcc-runtime-exception.txt', 'winpthreads.txt']
  it('sin DLL ajenas es la ruta estática', () => {
    expect(p.decidirRuntime([], [])).toEqual({ modo: 'estatico', dlls: [] })
  })
  it('admite solo libstdc++, libwinpthread y libgcc_s, sin importar mayúsculas, y las ordena sin repetir', () => {
    expect(p.decidirRuntime(['libwinpthread-1.dll', 'LIBSTDC++-6.dll', 'libstdc++-6.dll'], todas)).toEqual({ modo: 'respaldo', dlls: ['libstdc++-6.dll', 'libwinpthread-1.dll'] })
    expect(p.decidirRuntime(['libgcc_s_seh-1.dll'], todas).modo).toBe('respaldo')
  })
  it('una DLL desconocida detiene la construcción aunque vengan las demás', () => {
    expect(() => p.decidirRuntime(['libstdc++-6.dll', 'libomp140.x86_64.dll'], todas)).toThrow(/libomp140/)
  })
  it('sin el texto de licencia correspondiente falla', () => {
    expect(() => p.decidirRuntime(['libwinpthread-1.dll'], ['GPL-3.0.txt', 'gcc-runtime-exception.txt'])).toThrow(/winpthreads\.txt/)
    expect(() => p.decidirRuntime(['libstdc++-6.dll'], ['GPL-3.0.txt', 'winpthreads.txt'])).toThrow(/gcc-runtime-exception/)
  })
})

describe('ngspice para Windows compilado desde el código oficial', () => {
  it('se configura como en Unix (sin OpenMP, sin libsndfile, libsamplerate ni FFTW), con rutas relativas y libgcc estático', () => {
    for (const op of [...p.CONFIGURE_BASE, '--enable-relpath']) expect(p.CONFIGURE_WINDOWS, op).toContain(op)
    expect(p.CONFIGURE_WINDOWS).toContain('--disable-openmp')
    expect(p.CONFIGURE_WINDOWS).toContain('--enable-xspice')
    expect(p.LDFLAGS_WINDOWS).toBe('-static-libgcc -static-libstdc++')
    expect(p.LIBS_WINDOWS).toContain('--whole-archive -lwinpthread')
    // Sin ISMINGW=1 los .cm no reciben LDFLAGS (uname en MSYS2 UCRT64 no contiene MINGW32) y importan libgcc_s_seh-1.dll.
    expect(p.MAKE_WINDOWS).toContain('ISMINGW=1')
  })
  it('solo admite DLL del sistema: rechaza libomp, libsndfile, libgcc_s y libwinpthread', () => {
    for (const ok of ['KERNEL32.dll', 'msvcrt.dll', 'api-ms-win-crt-stdio-l1-1-0.dll', 'ucrtbase.dll', 'SHLWAPI.dll', 'PSAPI.DLL']) expect(p.DLL_DE_WINDOWS.test(ok), ok).toBe(true)
    for (const mal of ['libomp140.x86_64.dll', 'sndfile.dll', 'samplerate.dll', 'libgcc_s_seh-1.dll', 'libwinpthread-1.dll', 'libstdc++-6.dll', 'vcomp140.dll']) expect(p.DLL_DE_WINDOWS.test(mal), mal).toBe(false)
  })
  it.skipIf(process.platform !== 'win32')('lee las importaciones de un ejecutable real (node.exe) y rechaza lo que no es PE', () => {
    expect(p.dllsImportadas(readFileSync(process.execPath))).toContain('KERNEL32.dll')
    expect(() => p.dllsImportadas(Buffer.from('no soy un ejecutable, ni de lejos, ni nada que se le parezca en absoluto'))).toThrow(/PE/)
  })
  it.skipIf(process.platform !== 'win32')('detiene la construcción si un .cm o el ejecutable importan una DLL ajena', () => {
    const base = join(tmp, 'Spice64')
    mkdirSync(join(base, 'bin'), { recursive: true })
    mkdirSync(join(base, 'lib', 'ngspice'), { recursive: true })
    copyFileSync(process.execPath, join(base, 'bin', 'ngspice_con.exe'))
    // node.exe importa dbghelp.dll, que no está en la lista de DLL del sistema admitidas.
    expect(() => p.comprobarDependenciasWindows(base)).toThrow(/dbghelp/i)
  })
})

describe('reescribirSpinit', () => {
  const q = p as unknown as { reescribirSpinit(t: string, cm: string[], base?: string | null): string }
  const original = ['alias exit quit', 'if $?xspice_enabled', '', ' codemodel ../lib/ngspice/analog.cm', ' codemodel ../lib/ngspice/digital.cm', ' codemodel ../lib/ngspice/otro.cm', 'end', '', 'if $?osdi_enabled', '', ' osdi ../lib/ngspice/psp103.osdi', 'end', ''].join('\n')
  it('deja solo los .cm presentes y quita osdi', () => {
    const t = q.reescribirSpinit(original, ['analog.cm', 'digital.cm'])
    expect(t).toContain(' codemodel ../lib/ngspice/analog.cm')
    expect(t).not.toContain('otro.cm')
    expect(t).not.toContain('osdi')
    expect(t).toContain('alias exit quit')
  })
  it('con base escribe rutas absolutas con barras normales y cita las que llevan espacios', () => {
    expect(q.reescribirSpinit(original, ['analog.cm'], 'C:\\Mi carpeta\\lib')).toContain(' codemodel "C:/Mi carpeta/lib/analog.cm"')
    expect(q.reescribirSpinit(original, ['analog.cm'], '/x/lib')).toContain(' codemodel /x/lib/analog.cm')
  })
})
