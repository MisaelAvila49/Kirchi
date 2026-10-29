import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { carpetaHerramientas } from './recursos'
import { conRuta, limiteDeVerificacion, localizarNgspice, motivoDeArranque, motivoDeVersion, motivoSinNgspice, pistaMac, rutasDeNgspice, ServicioNgspice } from './servicioNgspice'

// macOS no corre aquí: se simula la plataforma 'darwin' en la búsqueda, los mensajes y los topes, y el ejecutable es `node guion.js`.

const PETICION = {
  netlist: { nodes: 2, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 0, ohms: 1000 }] },
  analisis: { tipo: 'op' }
}
const RECURSOS = '/Applications/Kirchi.app/Contents/Resources'

let raiz: string
let temporal: string
beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), 'kirchi-prueba-mac-'))
  temporal = join(raiz, 'tmp')
  mkdirSync(temporal)
})
// Un proceso recién matado en Windows puede retener su carpeta unos instantes: lo que quede en la carpeta temporal del sistema no importa.
afterAll(() => {
  try {
    rmSync(raiz, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  } catch {
    /* en uso */
  }
})

describe('ngspice en macOS: dónde se busca', () => {
  const herramientas = carpetaHerramientas({ empaquetado: true, resourcesPath: RECURSOS, appPath: `${RECURSOS}/app.asar` })
  const aPosix = (r: string) => r.replace(/\\/g, '/')

  it('instalado, el ejecutable es Contents/Resources/herramientas/ngspice/bin/ngspice, sin .exe ni Spice64', () => {
    const esperado = `${RECURSOS}/herramientas/ngspice/bin/ngspice`
    expect(rutasDeNgspice({ empaquetado: true, carpetaHerramientas: herramientas, appPath: '', plataforma: 'darwin' }).map(aPosix)).toEqual([esperado])
    const ruta = localizarNgspice({ empaquetado: true, carpetaHerramientas: herramientas, appPath: '', plataforma: 'darwin', existe: (r) => aPosix(r) === esperado })
    expect(ruta && aPosix(ruta)).toBe(esperado)
  })

  it('sin el ejecutable, el mensaje dice dónde buscó y qué hacer en macOS', () => {
    const intentadas = rutasDeNgspice({ empaquetado: true, carpetaHerramientas: herramientas, appPath: '', plataforma: 'darwin' }).map(aPosix)
    expect(localizarNgspice({ empaquetado: true, carpetaHerramientas: herramientas, appPath: '', plataforma: 'darwin', existe: () => false })).toBeNull()
    const m = motivoSinNgspice(intentadas, 'darwin')
    expect(m).toContain(`${RECURSOS}/herramientas/ngspice/bin/ngspice`)
    expect(m).toContain('xattr -cr /Applications/Kirchi.app')
    expect(motivoSinNgspice(intentadas, 'win32')).not.toContain('xattr')
  })

  it('reconoce la copia temporal de App Translocation y el dmg montado', () => {
    expect(pistaMac('/private/var/folders/x/T/AppTranslocation/ABC/d/Kirchi.app/Contents/Resources/herramientas/ngspice/bin/ngspice')).toMatch(/copia temporal de solo lectura/)
    expect(pistaMac('/Volumes/Kirchi 2.0.0/Kirchi.app/Contents/Resources/herramientas/ngspice/bin/ngspice')).toMatch(/desde el dmg/)
    expect(pistaMac(posix.join(RECURSOS, 'herramientas'))).toMatch(/^En macOS: arrastra Kirchi a Aplicaciones/)
  })
})

describe('ngspice en macOS: arranque y comprobación', () => {
  it('el primer arranque tiene más tiempo en macOS (Gatekeeper y XProtect revisan el binario)', () => {
    expect(limiteDeVerificacion('darwin')).toBe(30_000)
    expect(limiteDeVerificacion('win32')).toBe(15_000)
  })

  it('un error del sistema al lanzar dice su código; una señal no se confunde con otra versión', () => {
    expect(motivoDeArranque(Object.assign(new Error('spawn /x/ngspice EACCES'), { code: 'EACCES' }))).toBe('No se pudo iniciar ngspice: no tiene permiso de ejecución (spawn /x/ngspice EACCES).')
    expect(motivoDeArranque(Object.assign(new Error('spawn /x/ngspice ENOENT'), { code: 'ENOENT' }))).toMatch(/el archivo no existe/)
    expect(motivoDeVersion('', null, 'SIGKILL')).toBe('ngspice se cerró al arrancar: el sistema le mandó la señal SIGKILL.')
    expect(motivoDeVersion('dyld[1]: Library not loaded: /opt/homebrew/lib/libx.dylib\nmás', null, 'SIGABRT')).toBe('ngspice se cerró al arrancar: el sistema le mandó la señal SIGABRT: dyld[1]: Library not loaded: /opt/homebrew/lib/libx.dylib')
    expect(conRuta('No arrancó.', '/a/ngspice', 'darwin')).toMatch(/^No arrancó\. Ruta: \/a\/ngspice\. En macOS: .*xattr -cr/)
  })

  it('un ejecutable que no existe vuelve con la ruta, el código del sistema y la pista de macOS', async () => {
    const ruta = join(raiz, 'no-existe', 'ngspice')
    const r = await new ServicioNgspice({ ejecutable: ruta, carpetaTemporal: temporal, plataforma: 'darwin' }).ejecutar(1, PETICION)
    expect(r.ok).toBe(false)
    const error = r.ok ? '' : r.error
    expect(error).toContain(ruta)
    expect(error).toMatch(/ENOENT/)
    expect(error).toContain('xattr -cr /Applications/Kirchi.app')
  })

  it('una comprobación que se agota se reintenta una vez en macOS, y la segunda ya contesta', async () => {
    const guion = join(raiz, 'lento.cjs')
    const marca = join(raiz, 'lento.marca')
    // La primera vez tarda más que el tope (como un binario recién descargado bajo revisión); la segunda contesta en seguida.
    writeFileSync(
      guion,
      `const fs = require('fs')
if (process.argv.includes('-v')) {
  if (!fs.existsSync(${JSON.stringify(marca)})) { fs.writeFileSync(${JSON.stringify(marca)}, '1'); setTimeout(() => {}, 8000) }
  else { console.log('ngspice-47'); process.exit(0) }
}
`
    )
    const s = new ServicioNgspice({ ejecutable: process.execPath, argumentosPrevios: [guion], carpetaTemporal: temporal, plataforma: 'darwin', limiteVerificacionMs: 3000 })
    expect(await s.verificar()).toBeNull()
  }, 20_000)

  it('sin reintentos, la comprobación agotada dice cuánto esperó y la ruta', async () => {
    const guion = join(raiz, 'colgado.cjs')
    writeFileSync(guion, `setTimeout(() => {}, 3000)\n`)
    const s = new ServicioNgspice({ ejecutable: process.execPath, argumentosPrevios: [guion], carpetaTemporal: temporal, plataforma: 'darwin', limiteVerificacionMs: 400, reintentosVerificacion: 0 })
    const m = await s.verificar()
    expect(m).toMatch(/no respondió en 0 s|no respondió en 1 s/)
    expect(m).toContain(process.execPath)
    expect(m).toContain('xattr -cr')
  }, 15_000)
})
