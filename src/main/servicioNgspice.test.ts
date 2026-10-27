import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { armarMazo, validarPeticion } from '../compartido/spice/mazo'
import { localizarNgspice, motivoDeVersion, ServicioNgspice, type OpcionesServicio } from './servicioNgspice'
import { TOPES_RAW as TOPES_RAW_PRUEBA } from '../compartido/spice/rawAscii'

// El servicio se prueba con un ejecutable falso (`node guion.js`, que habla como ngspice en lo que el servicio mira: `-v`, los
// argumentos fijos, el archivo de resultados y el código de salida). La prueba contra el ngspice real está en
// `netlist/ngspiceReferencias.test.ts`.

let raiz: string
let temporal: string
const PETICION = {
  netlist: { nodes: 2, elements: [{ type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 5 } }, { type: 'R', a: 1, b: 0, ohms: 1000 }] },
  analisis: { tipo: 'op' }
}

const RAW = `Title: * fake
Date: hoy
Plotname: Operating Point
Flags: real
No. Variables: 2
No. Points: 1
Variables:
\t0\tv(n1)\tvoltage
\t1\tv0#branch\tcurrent
Values:
 0\t5.000000000000000e+000
\t-5.000000000000000e-003
`

/** Un ejecutable falso: `cuerpo` es el código que corre en lugar de ngspice (después de contestar `-v`). */
function falso(nombre: string, cuerpo: string, version = 'ngspice-47'): { ejecutable: string; argumentosPrevios: string[] } {
  const guion = join(raiz, `${nombre}.cjs`)
  writeFileSync(
    guion,
    `const fs = require('fs')
const args = process.argv.slice(2)
if (args.includes('-v')) { console.log('${version}'); process.exit(0) }
fs.appendFileSync(${JSON.stringify(join(raiz, `${nombre}.llamadas.json`))}, JSON.stringify({ args, cwd: fs.readdirSync('.'), mazo: fs.readFileSync('mazo.cir', 'utf8') }) + '\\n')
const RAW = ${JSON.stringify(RAW)}
${cuerpo}
`
  )
  return { ejecutable: process.execPath, argumentosPrevios: [guion] }
}

const servicio = (f: ReturnType<typeof falso>, extra: Partial<OpcionesServicio> = {}): ServicioNgspice => new ServicioNgspice({ ...f, carpetaTemporal: temporal, ...extra })
const sobrantes = (): string[] => readdirSync(temporal)

beforeAll(() => {
  raiz = mkdtempSync(join(tmpdir(), 'kirchi-prueba-ngspice-'))
  temporal = join(raiz, 'tmp')
  mkdirSync(temporal)
})
afterAll(() => rmSync(raiz, { recursive: true, force: true }))

describe('localizarNgspice', () => {
  it('instalado busca solo en resources/herramientas', () => {
    const existe = (r: string) => r.replace(/\\/g, '/').endsWith('res/herramientas/ngspice/Spice64/bin/ngspice_con.exe') || r.replace(/\\/g, '/').endsWith('app/herramientas/ngspice/Spice64/bin/ngspice_con.exe')
    const ruta = localizarNgspice({ empaquetado: true, carpetaHerramientas: join('res', 'herramientas'), appPath: 'app', plataforma: 'win32', existe })
    expect(ruta?.replace(/\\/g, '/')).toBe('res/herramientas/ngspice/Spice64/bin/ngspice_con.exe')
    expect(localizarNgspice({ empaquetado: true, carpetaHerramientas: 'otra', appPath: 'app', plataforma: 'win32', existe })).toBeNull()
  })
  it('en desarrollo también mira herramientas/ngspice de la raíz', () => {
    const existe = (r: string) => r.replace(/\\/g, '/').endsWith('app/herramientas/ngspice/Spice64/bin/ngspice_con.exe')
    expect(localizarNgspice({ empaquetado: false, carpetaHerramientas: join('app', 'resources', 'herramientas'), appPath: 'app', plataforma: 'win32', existe })?.replace(/\\/g, '/')).toBe('app/herramientas/ngspice/Spice64/bin/ngspice_con.exe')
  })
  it('fuera de Windows el instalado no usa el del sistema y el de desarrollo sí', () => {
    const nada = () => false
    expect(localizarNgspice({ empaquetado: true, carpetaHerramientas: 'r', appPath: 'a', plataforma: 'linux', existe: nada })).toBeNull()
    expect(localizarNgspice({ empaquetado: false, carpetaHerramientas: 'r', appPath: 'a', plataforma: 'linux', existe: nada })).toBe('ngspice')
  })
})

describe('ServicioNgspice con un ejecutable falso', () => {
  it('corre con la línea de órdenes fija, en una carpeta propia, y lee el resultado', async () => {
    const f = falso('ok', `fs.writeFileSync('salida.raw', RAW)`)
    const r = await servicio(f).ejecutar(1, PETICION)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.graficos[0].nombre).toBe('Operating Point')
    expect(r.graficos[0].vectores.map((v) => [v.nombre, v.referencia])).toEqual([
      ['v(n1)', { tipo: 'nodo', nodo: 1 }],
      ['v0#branch', { tipo: 'elemento', indice: 0 }]
    ])
    expect([...r.graficos[0].vectores[0].re]).toEqual([5])
    const llamada = JSON.parse(readFileSync(join(raiz, 'ok.llamadas.json'), 'utf8').trim().split('\n')[0])
    expect(llamada.args).toEqual(['-n', '-b', '-o', 'registro.txt', 'mazo.cir'])
    expect(llamada.cwd).toEqual(['mazo.cir'])
    expect(llamada.mazo).toBe(armarMazo(validarPeticion(PETICION)).texto)
    expect(sobrantes()).toEqual([])
  })

  it('una versión que no es la 47 se rechaza y no corre nada', async () => {
    const f = falso('v46', `fs.writeFileSync('salida.raw', RAW)`, 'ngspice-46')
    const r = await servicio(f).ejecutar(1, PETICION)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/ngspice 47/) })
    expect(sobrantes()).toEqual([])
  })

  it('distingue un arranque fallido (falta una DLL) de una versión distinta', () => {
    expect(motivoDeVersion('ngspice-47 : Circuit level simulation program', 0)).toBeNull()
    expect(motivoDeVersion('ngspice-46 : Circuit', 0)).toMatch(/otra versión/)
    expect(motivoDeVersion('', -1073741515)).toBe('ngspice no pudo arrancar: falta una biblioteca del paquete. Reinstala Kirchi.')
    expect(motivoDeVersion('', 0xc0000135)).toMatch(/falta una biblioteca/)
    expect(motivoDeVersion('', 3)).toBe('ngspice no pudo arrancar (código 3).')
    expect(motivoDeVersion('', 0)).toMatch(/otra versión/)
  })

  it('un ejecutable que no existe da un error legible', async () => {
    const r = await new ServicioNgspice({ ejecutable: join(raiz, 'no-existe.exe'), carpetaTemporal: temporal }).ejecutar(1, PETICION)
    expect(r).toMatchObject({ ok: false })
    expect(sobrantes()).toEqual([])
  })

  it('una petición mal formada ni siquiera arranca el proceso', async () => {
    const f = falso('mal', `fs.writeFileSync('salida.raw', RAW)`)
    for (const p of [null, 'ngspice -b x', { netlist: {}, analisis: { tipo: 'op' } }, { ...PETICION, analisis: { tipo: 'tran', paso: NaN, fin: 1 } }, { ...PETICION, netlist: { nodes: 2, elements: [{ type: 'R', a: 1, b: 0, ohms: 'x' }] } }]) {
      const r = await servicio(f).ejecutar(1, p)
      expect(r.ok).toBe(false)
    }
    expect(() => readFileSync(join(raiz, 'mal.llamadas.json'))).toThrow()
    expect(sobrantes()).toEqual([])
  })

  it('un error de ngspice sin resultados vuelve con su mensaje', async () => {
    const f = falso('falla', `console.log('Error: no convergence in transient analysis'); process.exit(1)`)
    const r = await servicio(f).ejecutar(1, PETICION)
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('no convergence') })
    expect(sobrantes()).toEqual([])
  })

  it('un resultado malformado se rechaza', async () => {
    const f = falso('basura', `fs.writeFileSync('salida.raw', 'esto no es un raw')`)
    const r = await servicio(f).ejecutar(1, PETICION)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/raw/i) })
    expect(sobrantes()).toEqual([])
  })

  it('el tope de tiempo mata el proceso y limpia', async () => {
    const f = falso('lento', `setTimeout(() => {}, 60000)`)
    const t0 = Date.now()
    const r = await servicio(f, { limiteMs: 700 }).ejecutar(1, PETICION)
    expect(r).toMatchObject({ ok: false, tiempoAgotado: true })
    expect(Date.now() - t0).toBeLessThan(15_000)
    expect(sobrantes()).toEqual([])
  })

  it('el tope de salida mata el proceso que escribe de más', async () => {
    const f = falso('grande', `fs.writeFileSync('registro.txt', 'x'.repeat(3 * 1024 * 1024)); setTimeout(() => {}, 60000)`)
    const r = await servicio(f, { limiteSalida: 1024 * 1024, limiteMs: 30_000 }).ejecutar(1, PETICION)
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/demasiados datos/) })
    expect(sobrantes()).toEqual([])
  })

  it('un resultado más grande que el tope no se lee', async () => {
    const f = falso('raw-grande', `fs.writeFileSync('salida.raw', RAW + ' '.repeat(2 * 1024 * 1024))`)
    const r = await servicio(f, { limiteSalida: 1024 * 1024 }).ejecutar(1, PETICION)
    expect(r.ok).toBe(false)
    expect(sobrantes()).toEqual([])
  })

  it('cancelar mata el trabajo en curso y limpia', async () => {
    const f = falso('cancelable', `setTimeout(() => {}, 60000)`)
    const s = servicio(f, { limiteMs: 30_000 })
    const p = s.ejecutar(1, PETICION)
    await new Promise((r) => setTimeout(r, 1500))
    s.cancelar(1)
    const r = await p
    expect(r).toMatchObject({ ok: false, cancelado: true })
    expect(sobrantes()).toEqual([])
  })

  it('un trabajo a la vez por ventana, con una cola corta; otra ventana corre aparte', async () => {
    const f = falso('cola', `setTimeout(() => { fs.writeFileSync('salida.raw', RAW) }, 600)`)
    const s = servicio(f, { maxEnCola: 1 })
    const [a, b, c] = [s.ejecutar(1, PETICION), s.ejecutar(1, PETICION), s.ejecutar(1, PETICION)]
    // El tercero no cabe en la cola: vuelve de inmediato con un mensaje.
    expect(await c).toMatchObject({ ok: false, error: expect.stringMatching(/en curso/) })
    const otra = s.ejecutar(2, PETICION)
    const rs = await Promise.all([a, b, otra])
    expect(rs.map((r) => r.ok)).toEqual([true, true, true])
    // Las corridas de una misma ventana no se encimaron: la 1.ª y la 2.ª van una tras otra.
    expect(sobrantes()).toEqual([])
  })

  it('cancelar vacía también la cola', async () => {
    const f = falso('cancelar-cola', `setTimeout(() => {}, 60000)`)
    const s = servicio(f, { limiteMs: 30_000 })
    const [a, b] = [s.ejecutar(1, PETICION), s.ejecutar(1, PETICION)]
    await new Promise((r) => setTimeout(r, 1500))
    s.cancelar(1)
    expect(await a).toMatchObject({ cancelado: true })
    expect(await b).toMatchObject({ cancelado: true })
    expect(sobrantes()).toEqual([])
  })

  it('el entorno del proceso no lleva las variables de quien lo lanza', async () => {
    process.env.KIRCHI_SECRETO_DE_PRUEBA = 'no-debe-verse'
    const f = falso('entorno', `fs.writeFileSync('salida.raw', RAW); fs.writeFileSync(${JSON.stringify(join(raiz, 'entorno.json'))}, JSON.stringify(Object.keys(process.env)))`)
    await servicio(f).ejecutar(1, PETICION)
    delete process.env.KIRCHI_SECRETO_DE_PRUEBA
    expect(JSON.parse(readFileSync(join(raiz, 'entorno.json'), 'utf8'))).not.toContain('KIRCHI_SECRETO_DE_PRUEBA')
  })

  it('el estado de un contador viaja como archivo auxiliar junto al mazo', async () => {
    const f = falso('aux', `fs.writeFileSync('salida.raw', RAW)`)
    const p = {
      netlist: { nodes: 2, digital_nets: 7, elements: [{ type: 'COUNTER', clk: 0, rst: 1, q: [2, 3, 4, 5], co: 6, modulo: 10, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' }] },
      analisis: { tipo: 'op' }
    }
    await servicio(f).ejecutar(1, p)
    expect(JSON.parse(readFileSync(join(raiz, 'aux.llamadas.json'), 'utf8').trim().split('\n')[0]).cwd.sort()).toEqual(['contador0.in', 'mazo.cir'])
  })
})

describe('escribirSpinit', () => {
  it('escribe un spinit con los modelos de código instalados junto al ejecutable y nada si no hay modelos', async () => {
    const { escribirSpinit } = await import('./servicioNgspice')
    const base = mkdtempSync(join(tmpdir(), 'kirchi-spinit-'))
    try {
      mkdirSync(join(base, 'ng', 'bin'), { recursive: true })
      mkdirSync(join(base, 'ng', 'lib', 'ngspice'), { recursive: true })
      for (const m of ['digital.cm', 'analog.cm']) writeFileSync(join(base, 'ng', 'lib', 'ngspice', m), '')
      mkdirSync(join(base, 'job'))
      const exe = join(base, 'ng', 'bin', 'ngspice')
      expect(escribirSpinit(join(base, 'job'), join(base, 'otro', 'bin', 'ngspice'), 'linux')).toBeNull()
      expect(escribirSpinit(join(base, 'job'), exe, 'linux')).toBe(join(base, 'job', 'spice'))
      const texto = readFileSync(join(base, 'job', 'spice', 'scripts', 'spinit'), 'utf8')
      expect(texto).toContain(` codemodel '${join(base, 'ng', 'lib', 'ngspice')}/analog.cm'`)
      expect(texto).toContain('digital.cm')
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('lineaCodemodel', () => {
  it('en Windows la ruta va relativa a bin, sin comillas, aunque la instalación tenga espacios y acentos', async () => {
    const { lineaCodemodel } = await import('./servicioNgspice')
    const tienda = 'C:\\Program Files\\WindowsApps\\MisaelSalAvilaLpez.Kirchi_1.2.2.0_x64__47p2gr07q41m4\\app\\resources\\herramientas\\ngspice\\Spice64\\lib\\ngspice'
    expect(lineaCodemodel(tienda, 'analog.cm', 'win32')).toBe(' codemodel ../lib/ngspice/analog.cm')
    expect(lineaCodemodel('C:\\Users\\Juan Pérez\\Kirchi\\lib\\ngspice', 'digital.cm', 'win32')).toBe(' codemodel ../lib/ngspice/digital.cm')
  })
  it('fuera de Windows va absoluta entre comillas simples y, con apóstrofo, por una variable entre comillas dobles', async () => {
    const { lineaCodemodel } = await import('./servicioNgspice')
    expect(lineaCodemodel('/Applications/Kirchi.app/Contents/Resources/herramientas/ngspice/lib/ngspice', 'analog.cm', 'darwin')).toBe(" codemodel '/Applications/Kirchi.app/Contents/Resources/herramientas/ngspice/lib/ngspice/analog.cm'")
    expect(lineaCodemodel('/home/ana maría/kirchi/lib/ngspice', 'analog.cm', 'linux')).toBe(" codemodel '/home/ana maría/kirchi/lib/ngspice/analog.cm'")
    expect(lineaCodemodel("/home/o'neil/lib/ngspice", 'analog.cm', 'linux')).toBe(' set kirchi_cm = "/home/o\'neil/lib/ngspice/analog.cm"\n codemodel $kirchi_cm')
  })
})

describe('codificarSpinit y rutas en las dos distribuciones', () => {
  it('en Windows escribe latin1 (una ruta con acento no se rompe) y en otras plataformas UTF-8', async () => {
    const { codificarSpinit } = await import('./servicioNgspice')
    expect([...codificarSpinit('Formación', 'win32')]).toEqual([...Buffer.from([0x46, 0x6f, 0x72, 0x6d, 0x61, 0x63, 0x69, 0xf3, 0x6e])])
    expect([...codificarSpinit('Formación', 'linux')]).toEqual([...Buffer.from('Formación', 'utf8')])
    expect([...codificarSpinit('日本', 'win32')]).toEqual([...Buffer.from('日本', 'utf8')])
  })
  it('toma lib/ngspice junto a bin, sea el paquete oficial (Spice64) o el propio (bin/lib directos)', async () => {
    const { escribirSpinit } = await import('./servicioNgspice')
    const base = mkdtempSync(join(tmpdir(), 'kirchi-spinit-'))
    try {
      for (const raiz of [join(base, 'Spice64'), join(base, 'propio')]) {
        mkdirSync(join(raiz, 'bin'), { recursive: true })
        mkdirSync(join(raiz, 'lib', 'ngspice'), { recursive: true })
        for (const m of ['digital.cm', 'analog.cm']) writeFileSync(join(raiz, 'lib', 'ngspice', m), '')
        const dir = mkdtempSync(join(base, 'job-'))
        expect(escribirSpinit(dir, join(raiz, 'bin', 'ngspice_con.exe'), 'win32')).toBe(join(dir, 'spice'))
        const texto = readFileSync(join(dir, 'spice', 'scripts', 'spinit'), 'latin1')
        expect(texto).toContain(' codemodel ../lib/ngspice/analog.cm')
      }
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  })
})

describe('entornoSpinit', () => {
  it('señala la carpeta de scripts con SPICE_SCRIPTS (la única que respeta --enable-relpath) y SPICE_LIB_DIR, o nada', async () => {
    const { entornoSpinit } = await import('./servicioNgspice')
    expect(entornoSpinit(null)).toEqual({})
    const env = entornoSpinit(join('x', 'spice'))
    expect(env.SPICE_SCRIPTS).toBe(join('x', 'spice', 'scripts'))
    expect(env.SPICE_LIB_DIR).toBe(join('x', 'spice'))
  })
})

describe('lectura por renglones, reintento de la versión y barrido', () => {
  it('lee un raw grande por bloques y da lo mismo que leerlo entero', async () => {
    const { lineasDeArchivo } = await import('./servicioNgspice')
    const { leerRawAsciiLineas, leerRawAscii } = await import('../compartido/spice/rawAscii')
    const n = 300_000
    const cab = `Title: * grande\nDate: hoy\nPlotname: Transient Analysis\nFlags: real\nNo. Variables: 2\nNo. Points: ${n}\nVariables:\n\t0\ttime\ttime\n\t1\tv(n1)\tvoltage\nValues:\n`
    const partes: string[] = [cab]
    for (let i = 0; i < n; i++) partes.push(` ${i}\t${(i * 1e-6).toExponential(15)}\n\t${Math.sin(i / 1000).toExponential(15)}\n`)
    const texto = partes.join('')
    const ruta = join(raiz, 'grande.raw')
    writeFileSync(ruta, texto, 'latin1')
    const [g] = leerRawAsciiLineas(lineasDeArchivo(ruta, 64 * 1024), { ...TOPES_RAW_PRUEBA, bytes: 128 * 1024 * 1024 }, texto.length)
    expect(g.puntos).toBe(n)
    expect(g.variables[1].re[12345]).toBeCloseTo(Math.sin(12.345), 12)
    expect([...g.variables[0].re.subarray(0, 3)]).toEqual([...leerRawAscii(texto.slice(0, texto.indexOf(' 3\t')).replace(`No. Points: ${n}`, 'No. Points: 3'))[0].variables[0].re])
  })

  it('el tope de caracteres corre mientras se lee, sin partir el archivo entero', async () => {
    const { lineasDeArchivo } = await import('./servicioNgspice')
    const { leerRawAsciiLineas } = await import('../compartido/spice/rawAscii')
    const ruta = join(raiz, 'tope.raw')
    const filas = Array.from({ length: 2000 }, (_, i) => ` ${i}\t${i}.5\n`).join('')
    writeFileSync(ruta, `Plotname: P\nFlags: real\nNo. Variables: 1\nNo. Points: 2000\nVariables:\n\t0\ttime\ttime\nValues:\n${filas}`)
    expect(() => leerRawAsciiLineas(lineasDeArchivo(ruta, 4096), { ...TOPES_RAW_PRUEBA, bytes: 5_000 })).toThrow(/tama/)
  })

  it('una falla de la comprobación de versión no se recuerda: la petición siguiente reintenta', async () => {
    const guion = join(raiz, 'frio.cjs')
    const marca = join(raiz, 'frio.marca')
    writeFileSync(
      guion,
      `const fs = require('fs')
const args = process.argv.slice(2)
if (args.includes('-v')) {
  if (!fs.existsSync(${JSON.stringify(marca)})) { fs.writeFileSync(${JSON.stringify(marca)}, '1'); console.log('ngspice-46') } else console.log('ngspice-47')
  process.exit(0)
}
fs.writeFileSync('salida.raw', ${JSON.stringify(RAW)})
`
    )
    const s = servicio({ ejecutable: process.execPath, argumentosPrevios: [guion] })
    expect(await s.ejecutar(1, PETICION)).toMatchObject({ ok: false })
    expect((await s.ejecutar(1, PETICION)).ok).toBe(true)
    // El éxito sí se recuerda.
    expect(await s.verificar()).toBeNull()
  })

  it('un tope global de procesos: dos ventanas no corren a la vez con tope 1, y cancelar al que espera lo suelta', async () => {
    const bitacora = join(raiz, 'cupo.log')
    const f = falso('cupo', `fs.appendFileSync(${JSON.stringify(bitacora)}, 'ini\\n'); setTimeout(() => { fs.appendFileSync(${JSON.stringify(bitacora)}, 'fin\\n'); fs.writeFileSync('salida.raw', RAW) }, 1800)`)
    const s = servicio(f, { maxConcurrentes: 1 })
    const [a, b] = [s.ejecutar(1, PETICION), s.ejecutar(2, PETICION)]
    const c = s.ejecutar(3, PETICION)
    await new Promise((r) => setTimeout(r, 800))
    s.cancelar(3)
    expect(await c).toMatchObject({ cancelado: true })
    expect((await Promise.all([a, b])).map((r) => r.ok)).toEqual([true, true])
    expect(readFileSync(bitacora, 'utf8').trim().split('\n')).toEqual(['ini', 'fin', 'ini', 'fin'])
    expect(sobrantes()).toEqual([])
  })

  it('barrerSobrantes borra solo las carpetas kirchi-ngspice-* viejas', async () => {
    const { barrerSobrantes } = await import('./servicioNgspice')
    const base = mkdtempSync(join(raiz, 'barrido-'))
    for (const n of ['kirchi-ngspice-viejo', 'kirchi-ngspice-nuevo', 'otra-cosa']) mkdirSync(join(base, n))
    const hace = new Date(Date.now() - 3_600_000)
    utimesSync(join(base, 'kirchi-ngspice-viejo'), hace, hace)
    utimesSync(join(base, 'otra-cosa'), hace, hace)
    barrerSobrantes(base)
    expect(readdirSync(base).sort()).toEqual(['kirchi-ngspice-nuevo', 'otra-cosa'])
  })
})

// Con el ngspice real, instalado en una carpeta con espacio y acento (como la de la Tienda, `C:\Program Files\WindowsApps\…`):
// una compuerta de XSPICE solo corre si el spinit cargó los modelos de código.
const RAIZ_PROYECTO = join(import.meta.dirname, '../..')
const NGSPICE_REAL = localizarNgspice({ empaquetado: false, carpetaHerramientas: join(RAIZ_PROYECTO, 'resources', 'herramientas'), appPath: RAIZ_PROYECTO })
const HAY_NGSPICE = NGSPICE_REAL !== null && NGSPICE_REAL !== 'ngspice' && existsSync(join(dirname(dirname(NGSPICE_REAL)), 'lib', 'ngspice'))

/** Copia a mano: `cpSync` de Node 24 tumba el proceso en Windows con un acento en la ruta de destino. */
function copiarCarpeta(origen: string, destino: string): void {
  mkdirSync(destino, { recursive: true })
  for (const e of readdirSync(origen, { withFileTypes: true })) {
    if (e.isDirectory()) copiarCarpeta(join(origen, e.name), join(destino, e.name))
    else copyFileSync(join(origen, e.name), join(destino, e.name))
  }
}

describe.skipIf(!HAY_NGSPICE)('ngspice real desde una carpeta con espacios', () => {
  it('carga los modelos de código y simula una compuerta de XSPICE', async () => {
    const base = mkdtempSync(join(tmpdir(), 'kirchi-ruta con espacio é-'))
    try {
      const origen = dirname(dirname(NGSPICE_REAL!))
      const copia = join(base, 'Kirchi 1.2', 'ngspice')
      for (const d of ['bin', 'lib']) copiarCarpeta(join(origen, d), join(copia, d))
      mkdirSync(join(base, 'tmp con espacio'))
      const s = new ServicioNgspice({ ejecutable: join(copia, 'bin', basename(NGSPICE_REAL!)), carpetaTemporal: join(base, 'tmp con espacio'), limiteMs: 60_000 })
      const r = await s.ejecutar(1, {
        netlist: {
          nodes: 3,
          digital_nets: 2,
          elements: [
            { type: 'V', a: 1, b: 0, wave: { kind: 'dc', v: 0 } },
            { type: 'ADC', p: 1, n: 0, out: 0, in_low: 1.5, in_high: 3.5 },
            { type: 'GATE', fn: 'not', inputs: [0], output: 1, rise_delay: 5e-9, fall_delay: 5e-9, z_como: 'x' },
            { type: 'DAC', input: 1, out: 2, v_lo: 0, v_hi: 5, r_lo: 55, r_hi: 55, t_rise: 6.7e-9, t_fall: 6.7e-9 },
            { type: 'R', a: 2, b: 0, ohms: 1e6 }
          ]
        },
        analisis: { tipo: 'op' }
      })
      if (!r.ok) throw new Error(r.error)
      const salida = r.graficos.flatMap((g) => g.vectores).find((v) => v.nombre === 'v(n2)')
      expect(salida?.re[0]).toBeCloseTo(5, 2)
    } finally {
      rmSync(base, { recursive: true, force: true })
    }
  }, 90_000)
})
