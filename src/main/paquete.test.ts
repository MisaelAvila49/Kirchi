import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { carpetaHerramientas } from './recursos'

// Revisión del paquete: la configuración siempre; el contenido del asar y de win-unpacked solo si `npm run dist` (o
// `npm run dist:dir`) ya los construyó, porque construirlos en cada corrida de pruebas tardaría y descargaría Electron.
const raiz = join(__dirname, '..', '..')
const unpacked = join(raiz, 'dist', 'win-unpacked')
const asarRuta = join(unpacked, 'resources', 'app.asar')
const hayPaquete = existsSync(asarRuta)
const config = readFileSync(join(raiz, 'electron-builder.yml'), 'utf8')

describe('carpetaHerramientas', () => {
  it('instalado: resources/herramientas junto al ejecutable; en desarrollo: la del repositorio', () => {
    expect(carpetaHerramientas({ empaquetado: true, resourcesPath: join('C:', 'Kirchi', 'resources'), appPath: join('D:', 'repo') })).toBe(join('C:', 'Kirchi', 'resources', 'herramientas'))
    expect(carpetaHerramientas({ empaquetado: false, resourcesPath: join('C:', 'electron', 'resources'), appPath: join('D:', 'repo') })).toBe(join('D:', 'repo', 'resources', 'herramientas'))
  })
  it('el repositorio trae la carpeta con su LEEME', () => {
    expect(statSync(join(raiz, 'resources', 'herramientas')).isDirectory()).toBe(true)
    expect(existsSync(join(raiz, 'resources', 'herramientas', 'LEEME.md'))).toBe(true)
  })
})

describe('configuración de electron-builder.yml', () => {
  it('copia resources/herramientas como recurso y deja node_modules fuera', () => {
    expect(config).toMatch(/from: resources\/herramientas\s+to: herramientas/)
    expect(config).toContain("'!node_modules/**'")
  })
  it('instalador por usuario, sin descargas ni actualización automática', () => {
    expect(config).toMatch(/perMachine: false/)
    expect(config).toMatch(/allowElevation: false/)
    expect(config).toMatch(/publish: null/)
  })
  it('apaga los fusibles que dejan depurar el ejecutable instalado', () => {
    for (const f of ['runAsNode', 'enableNodeOptionsEnvironmentVariable', 'enableNodeCliInspectArguments']) expect(config).toMatch(new RegExp(`${f}: false`))
  })
  it('macOS explica en español para qué usa el micrófono y la grabación de pantalla', () => {
    expect(config).toMatch(/NSMicrophoneUsageDescription: Kirchi usa el micrófono solo cuando grabas la pantalla con voz./)
    expect(config).toMatch(/NSScreenCaptureUsageDescription: .+/)
  })
  it('asocia .kir con su tipo MIME', () => {
    expect(config).toMatch(/ext: kir/)
    expect(config).toMatch(/mimeType: application\/x-kirchi/)
  })
  it('los comandos dist preparan ngspice antes de empaquetar', () => {
    const scripts = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).scripts as Record<string, string>
    for (const c of ['dist', 'dist:todo', 'dist:dir']) expect(scripts[c], c).toMatch(/preparar-ngspice.mjs && (node scripts\/preparar-licencias-electron\.mjs && )?electron-builder/)
  })
  it('macOS copia la licencia de Electron y los avisos de Chromium que electron-builder borra, sin reemplazar los extraResources de ngspice', () => {
    const mac = config.slice(config.indexOf('\nmac:'), config.indexOf('\nlinux:'))
    expect(mac).toMatch(/extraResources:\s+- from: resources\/licencias-electron\/LICENSE\s+to: LICENSE\.electron\.txt/)
    expect(mac).toMatch(/- from: resources\/licencias-electron\/LICENSES\.chromium\.html\s+to: LICENSES\.chromium\.html/)
    // Nada suelto en Contents/: ni extraFiles en macOS ni en la raíz (rompe la firma ad hoc).
    expect(mac).not.toContain('extraFiles')
    expect(config.slice(0, config.indexOf('\nwin:'))).not.toMatch(/^extraFiles:/m)
    // Los de la raíz (ngspice) siguen ahí: la configuración de cada plataforma se suma a la global.
    expect(config.slice(0, config.indexOf('\nmac:'))).toMatch(/from: resources\/herramientas\s+to: herramientas/)
  })
  it('el flujo de instaladores compila ngspice de Windows, entrega las fuentes y revisa los avisos', () => {
    const flujo = readFileSync(join(raiz, '.github', 'workflows', 'instaladores.yml'), 'utf8')
    expect(flujo).toMatch(/msys2\/setup-msys2@[0-9a-f]{40}/)
    expect(flujo).toContain('node scripts/preparar-ngspice.mjs --fuentes')
    expect(flujo).toContain('node scripts/preparar-fuentes.mjs')
    expect(flujo).toMatch(/name: kirchi-fuentes-terceros\s+path: dist\/fuentes-terceros\/\*\*/)
    expect(flujo).toMatch(/name: kirchi-ngspice-windows/)
    expect(readFileSync(join(raiz, 'scripts', 'revisar-firma-mac.sh'), 'utf8')).toContain('LICENSES.chromium.html')
  })
  it('los instaladores se llaman Kirchi-versión-Sistema-tipo, sin arquitectura', () => {
    // Sección de primer nivel (hasta la siguiente clave sin sangría).
    const sec = (clave: string): string => config.slice(config.indexOf(`\n${clave}:`) + 1).split(/\r?\n(?=\S)/)[0]
    const nombre = (clave: string): string => sec(clave).match(/artifactName: (.+?)\r?$/m)![1]
    expect(nombre('nsis')).toBe('Kirchi-${version}-Windows-instalador.${ext}')
    expect(nombre('win')).toBe('Kirchi-${version}-Windows-portable.${ext}')
    expect(nombre('dmg')).toBe('Kirchi-${version}-macOS.${ext}')
    expect(nombre('appImage')).toBe('Kirchi-${version}-Linux.${ext}')
    expect(nombre('deb')).toBe('Kirchi-${version}-Linux.${ext}')
    expect(nombre('appx')).toBe('Kirchi-${version}-tienda-${arch}.${ext}')
  })
  it('la versión de package.json es la de la versión 2.2.0', () => {
    expect(JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).version).toBe('2.2.0')
  })
})

describe('paquete de la Tienda de Microsoft (appx)', () => {
  const bloque = config.slice(config.indexOf('\nappx:'), config.indexOf('\nmac:'))
  const ihdr = (f: string): { ancho: number; alto: number } => {
    const b = readFileSync(join(raiz, 'build', 'appx', f))
    expect(b.subarray(1, 4).toString('latin1'), f).toBe('PNG')
    return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) }
  }
  it('declara identidad, idiomas en español, plena confianza y la versión mínima', () => {
    expect(bloque).toMatch(/identityName: /)
    expect(bloque).toMatch(/publisher: CN=/)
    expect(bloque).toMatch(/publisherDisplayName: /)
    expect(bloque).toMatch(/- es-MX/)
    expect(bloque).toMatch(/- runFullTrust/)
    expect(bloque).toMatch(/minVersion: 10\.0\.17763\.0/)
  })
  it('lleva la identidad real de Partner Center, sin marcadores', () => {
    expect(bloque).not.toMatch(/REEMPLAZAR|CN=00000000-/)
    expect(bloque).toMatch(/identityName: MisaelSalAvilaLpez\.Kirchi\r?$/m)
    expect(bloque).toMatch(/publisher: CN=A93BB8CE-3B2A-4067-A412-824655D2E225\r?$/m)
    expect(bloque).toMatch(/publisherDisplayName: Misael Saúl Avila López\r?$/m)
  })
  it('los logos obligatorios existen con sus tamaños y escalas', () => {
    const base: Record<string, [number, number]> = { StoreLogo: [50, 50], Square44x44Logo: [44, 44], Square150x150Logo: [150, 150], Wide310x150Logo: [310, 150] }
    for (const [n, [w, h]] of Object.entries(base)) {
      expect(ihdr(`${n}.png`)).toEqual({ ancho: w, alto: h })
      for (const e of [100, 125, 150, 200, 400]) expect(ihdr(`${n}.scale-${e}.png`), `${n} ${e}`).toEqual({ ancho: Math.round((w * e) / 100), alto: Math.round((h * e) / 100) })
    }
    for (const t of [16, 24, 32, 48, 256]) expect(ihdr(`Square44x44Logo.targetsize-${t}_altform-unplated.png`)).toEqual({ ancho: t, alto: t })
  })
  it('declara el alias de ejecución para que un cliente MCP lance «kirchi --mcp» desde la Tienda', () => {
    expect(bloque).toMatch(/customExtensionsPath: build\/appx\/alias\.xml\r?$/m)
    const xml = readFileSync(join(raiz, 'build', 'appx', 'alias.xml'), 'utf8')
    expect(xml).toContain('xmlns:uap3="http://schemas.microsoft.com/appx/manifest/uap/windows10/3"')
    expect(xml).toContain('Category="windows.appExecutionAlias"')
    expect(xml).toContain('Executable="app\\Kirchi.exe"')
    expect(xml).toContain('EntryPoint="Windows.FullTrustApplication"')
    expect(xml).toMatch(/<desktop:ExecutionAlias Alias="kirchi\.exe"\s*\/>/)
    // Sin capacidades nuevas ni fusibles cambiados: el alias no afloja nada.
    expect(bloque.match(/^ {4}- \w+\r?$/gm)?.map((l) => l.trim())).toEqual(['- runFullTrust'])
    expect(config).toMatch(/runAsNode: false/)
  })
  it('si ya se construyó el appx, su AppxManifest.xml lleva el alias', () => {
    const dist = join(raiz, 'dist')
    const manifiestos = existsSync(dist) ? readdirSync(dist).map((d) => join(dist, d, 'AppxManifest.xml')).filter((m) => existsSync(m)) : []
    for (const m of manifiestos) expect(readFileSync(m, 'utf8'), m).toContain('Alias="kirchi.exe"')
  })
  it('`dist:tienda` prepara ngspice y construye solo el appx, sin publicar', () => {
    const scripts = JSON.parse(readFileSync(join(raiz, 'package.json'), 'utf8')).scripts as Record<string, string>
    expect(scripts['dist:tienda']).toMatch(/preparar-ngspice.mjs && electron-builder --win appx --publish never/)
  })
})

describe.skipIf(!hayPaquete)('contenido del paquete construido (dist/win-unpacked)', () => {
  const asar = hayPaquete ? (require('@electron/asar') as { listPackage(p: string): string[]; extractFile(p: string, f: string): Buffer }) : null!
  const lista = (): string[] => asar.listPackage(asarRuta).map((r) => r.replace(/\\/g, '/'))

  it('el asar lleva proceso principal, preload, interfaz, WASM, workers y las tres fuentes', () => {
    const l = lista()
    for (const f of ['/out/main/index.js', '/out/preload/index.js', '/out/renderer/index.html', '/package.json']) expect(l, f).toContain(f)
    const assets = l.filter((r) => r.startsWith('/out/renderer/assets/'))
    expect(assets.some((r) => r.endsWith('.wasm'))).toBe(true)
    expect(assets.filter((r) => /\.worker-.*\.js$/.test(r)).length).toBeGreaterThanOrEqual(2)
    for (const fuente of ['mona-sans', 'geist-mono', 'source-serif-4']) expect(assets.some((r) => r.includes(fuente) && r.endsWith('.woff2')), fuente).toBe(true)
  })

  it('no lleva node_modules, pruebas, código fuente ni mapas', () => {
    const l = lista()
    expect(l.filter((r) => /node_modules|\.test\.|\.map$|^\/src\//.test(r))).toEqual([])
  })

  it('el JS de la interfaz trae las piezas, las plantillas incluidas y las fuentes de metadatos', () => {
    const l = lista()
    const js = l.filter((r) => /^\/out\/renderer\/assets\/index-.*\.js$/.test(r))
    expect(js).toHaveLength(1)
    const texto = asar.extractFile(asarRuta, js[0].slice(1).split('/').join(sep)).toString('utf8')
    // Una pieza por categoría con su id, y una plantilla incluida.
    for (const id of ['capacitor', 'capacitor-electrolitico']) expect(texto, id).toContain(id)
    expect(texto).toContain('555-astable')
    expect(texto).toContain('divisor')
    // Cada componente incluido de disco está en el paquete: se cuentan los pasivos por su carpeta.
    const pasivos = readdirSync(join(raiz, 'componentes', 'pasivos'))
    for (const p of pasivos) expect(texto, `pasivos/${p}`).toContain(p)
  })

  it('los avisos de Electron y de Chromium viajan junto al ejecutable', () => {
    expect(readFileSync(join(unpacked, 'LICENSE.electron.txt'), 'utf8')).toContain('Electron contributors')
    expect(statSync(join(unpacked, 'LICENSES.chromium.html')).size).toBeGreaterThan(100_000)
  })

  it('la licencia MIT de Kirchi viaja junto al ejecutable', () => {
    expect(readFileSync(join(unpacked, 'LICENSE.txt'), 'utf8')).toContain('MIT License')
  })

  it('ngspice 47 viaja fuera del asar con su ejecutable de consola, sus modelos de código y sus licencias', () => {
    const ng = join(unpacked, 'resources', 'herramientas', 'ngspice')
    for (const r of ['Spice64/bin/ngspice_con.exe', 'Spice64/share/ngspice/scripts/spinit', 'Spice64/lib/ngspice/digital.cm', 'COPYING-ngspice.txt', 'AVISOS.txt']) expect(existsSync(join(ng, r)), r).toBe(true)
    expect(readFileSync(join(ng, 'COPYING-ngspice.txt'), 'utf8')).toContain('Modified BSD')
    // Compilado por Kirchi: ni libomp140 (no redistribuible) ni sndfile ni samplerate. En bin solo el ejecutable y, si el
    // enlace estático no alcanzó (ruta de respaldo), las bibliotecas de MinGW que su licencia deja entregar (las de licencias/).
    const RESPALDO = new Set(['libstdc++-6.dll', 'libwinpthread-1.dll', 'libgcc_s_seh-1.dll'])
    const bin = readdirSync(join(ng, 'Spice64', 'bin'))
    expect(bin).toContain('ngspice_con.exe')
    expect(bin.filter((f) => f !== 'ngspice_con.exe' && !RESPALDO.has(f))).toEqual([])
    expect(readdirSync(join(ng, 'licencias')).sort()).toEqual(['GPL-3.0.txt', 'gcc-runtime-exception.txt', 'winpthreads.txt'])
    expect(existsSync(join(ng, 'Spice64', 'examples'))).toBe(false)
  })

  it('resources/herramientas viaja fuera del asar con su LEEME', () => {
    expect(existsSync(join(unpacked, 'resources', 'herramientas', 'LEEME.md'))).toBe(true)
  })

  it('el ejecutable lleva los fusibles apagados', async () => {
    const { getCurrentFuseWire, FuseV1Options } = await import('@electron/fuses')
    // Los estados son el carácter '0' (apagado) y '1' (encendido) del cable de fusibles.
    const FuseState = { DISABLE: 48, ENABLE: 49 }
    const cfg = await getCurrentFuseWire(join(unpacked, 'Kirchi.exe'))
    expect(cfg[FuseV1Options.RunAsNode]).toBe(FuseState.DISABLE)
    expect(cfg[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(FuseState.DISABLE)
    expect(cfg[FuseV1Options.EnableNodeCliInspectArguments]).toBe(FuseState.DISABLE)
    expect(cfg[FuseV1Options.OnlyLoadAppFromAsar]).toBe(FuseState.ENABLE)
    expect(cfg[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(FuseState.ENABLE)
    expect(cfg[FuseV1Options.GrantFileProtocolExtraPrivileges]).toBe(FuseState.DISABLE)
  })
})

