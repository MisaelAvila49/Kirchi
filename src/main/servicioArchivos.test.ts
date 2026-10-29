import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CarpetasDialogo } from '../compartido/ajustes'
import { carpetaDeRespaldos } from './archivos'
import { Sesion } from './recuperacion'
import { ErrorPdf } from './pdf'
import { motivoDeError, ServicioArchivos, type Dialogos, type TipoGuardar } from './servicioArchivos'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-servicio-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const ID = '11111111-2222-3333-4444-555555555555'

/** Servicio con diálogos que contestan lo que diga la prueba y Recientes en memoria. */
function servicio(o: { abrir?: string | null; guardar?: string | null; argv?: string[]; reemplazar?: boolean; red?: boolean; imprimir?: (html: string) => Promise<Uint8Array>; documentos?: string; carpetas?: CarpetasDialogo } = {}) {
  const guardadas: CarpetasDialogo = o.carpetas ?? { abrir: null, guardar: null, exportar: null }
  const anotadas: [string, string][] = []
  const abiertasEn: (string | undefined)[] = []
  let recientes: string[] = []
  const pedidos: { tipo: TipoGuardar; sugerida: string }[] = []
  const carpetas: string[] = []
  const confirmados: string[] = []
  const avisos: string[] = []
  const avisosRed: string[] = []
  const dialogos: Dialogos = {
    confirmarRed: async (ruta) => {
      avisosRed.push(ruta)
      return o.red ?? false
    },
    abrir: async (carpeta) => {
      abiertasEn.push(carpeta)
      return o.abrir ?? null
    },
    guardar: async (tipo, sugerida) => {
      pedidos.push({ tipo, sugerida })
      return o.guardar ?? null
    },
    confirmarReemplazo: async (ruta) => {
      confirmados.push(ruta)
      return o.reemplazar ?? false
    }
  }
  const datos = join(dir, 'datos')
  const s = new ServicioArchivos({
    dirDatos: datos,
    dialogos,
    recientes: () => recientes,
    ponerRecientes: (l) => (recientes = l),
    abrirCarpeta: async (c) => carpetas.push(c),
    argv: o.argv ?? ['kirchi.exe'],
    imprimir: o.imprimir,
    documentos: o.documentos,
    carpetas: () => guardadas,
    ponerCarpeta: (tipo, c) => {
      anotadas.push([tipo, c])
      guardadas[tipo] = c
    },
    sesion: new Sesion(datos, ID, 1),
    plataforma: 'win32',
    avisarErrorDiario: (m) => avisos.push(m)
  })
  return { s, datos, pedidos, anotadas, abiertasEn, carpetas, confirmados, avisos, avisosRed, recientes: () => recientes }
}

const kir = (n: number) => new Uint8Array([80, 75, 3, 4, n])

describe('ServicioArchivos: abrir', () => {
  it('abrir con el diálogo lee el archivo, lo agrega a Recientes y permite guardarlo encima', async () => {
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    const { s, recientes } = servicio({ abrir: ruta })
    const r = await s.abrir()
    expect(r).toEqual({ ok: true, archivo: { ruta, nombre: 'p.kir', bytes: kir(1) }, recientes: [ruta] })
    expect(recientes()).toEqual([ruta])
    expect(s.guardar(ruta, kir(2))).toMatchObject({ ok: true })
    expect([...readFileSync(ruta)]).toEqual([...kir(2)])
  })

  it('cancelar el diálogo no hace nada', async () => {
    const { s } = servicio({ abrir: null })
    expect(await s.abrir()).toEqual({ ok: false, cancelado: true })
  })

  it('un reciente que ya no existe da error y sale de la lista', () => {
    const { s, recientes } = servicio()
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    s.abrirRuta(ruta)
    rmSync(ruta)
    expect(s.abrirRuta(ruta)).toEqual({ ok: false, error: 'No se encontró p.kir.', recientes: [] })
    expect(recientes()).toEqual([])
  })

  it('Recientes solo abre rutas que están en la lista', () => {
    const { s } = servicio()
    const ruta = join(dir, 'p.kir'), otra = join(dir, 'otra.kir')
    writeFileSync(ruta, kir(1))
    writeFileSync(otra, kir(2))
    s.abrirRuta(ruta)
    expect(s.abrirReciente(otra)).toMatchObject({ ok: false })
    expect(s.guardar(otra, kir(3))).toMatchObject({ ok: false })
    expect([...readFileSync(otra)]).toEqual([...kir(2)])
    expect(s.abrirReciente(ruta.toUpperCase())).toMatchObject({ ok: true })
    expect(s.abrirReciente(42)).toMatchObject({ ok: false })
  })

  it('abrir y soltar leen un circuito de otro programa, lo anotan en Recientes con su ruta y no lo dejan sobrescribir', () => {
    const { s, recientes } = servicio()
    const ruta = join(dir, 'filtro.asc')
    writeFileSync(ruta, 'Version 4')
    const r = s.abrirSoltado(ruta)
    expect(r).toMatchObject({ ok: true, archivo: { nombre: 'filtro.asc' } })
    expect(recientes()).toEqual([ruta])
    expect(s.abrirRuta(join(dir, 'foto.png'))).toMatchObject({ ok: false })
    expect(s.guardar(ruta, kir(1))).toMatchObject({ ok: false })
  })

  it('un archivo soltado se abre por su propio canal, sin pasar por Recientes', () => {
    const { s } = servicio()
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    expect(s.abrirSoltado(ruta)).toMatchObject({ ok: true })
    expect(s.guardar(ruta, kir(2))).toMatchObject({ ok: true })
    expect(s.abrirSoltado('relativa.kir')).toMatchObject({ ok: false })
  })

  it('ataque: un archivo soltado con ruta de red o de dispositivo no se toca (NTLM)', () => {
    const { s, recientes } = servicio()
    for (const r of ['\\\\atacante@80\\s\\x.kir', '//atacante/s/x.kir', '\\\\?\\UNC\\atacante\\s\\x.kir', '\\\\.\\pipe\\x.kir', '\\??\\UNC\\a\\s\\x.kir'])
      expect(s.abrirSoltado(r)).toEqual({ ok: false, error: 'No se abrió x.kir: los archivos de red o de dispositivo no se abren al soltarlos; usa Archivo ▸ Abrir.', recientes: [] })
    expect(recientes()).toEqual([])
  })

  it('el .kir de la línea de órdenes, relativo a la carpeta de arranque', async () => {
    writeFileSync(join(dir, 'p.kir'), kir(1))
    const { s } = servicio({ argv: ['kirchi.exe', 'p.kir'] })
    expect(await s.inicial(dir)).toMatchObject({ ok: true, archivo: { ruta: join(dir, 'p.kir') } })
    expect(await servicio().s.inicial(dir)).toBeNull()
  })
})

describe('ServicioArchivos: abrirExterno (asociación de archivos y segunda instancia)', () => {
  it('la interfaz queda lista al pedir el .kir de arranque', async () => {
    const { s } = servicio()
    expect(s.interfazLista).toBe(false)
    s.inicial(dir)
    expect(s.interfazLista).toBe(true)
  })

  it('un .kir válido se abre, entra a Recientes y se puede guardar encima', async () => {
    const { s, recientes } = servicio()
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    expect(await s.abrirExterno(ruta)).toEqual({ ok: true, archivo: { ruta, nombre: 'p.kir', bytes: kir(1) }, recientes: [ruta] })
    expect(recientes()).toEqual([ruta])
    expect(s.guardar(ruta, kir(2))).toMatchObject({ ok: true })
  })

  it('mismas validaciones que Abrir: relativa, extensión falsa, carpeta, inexistente y nombres de dispositivo', async () => {
    const { s, recientes } = servicio()
    mkdirSync(join(dir, 'carpeta.kir'))
    writeFileSync(join(dir, 'falso.kir.txt'), kir(1))
    writeFileSync(join(dir, 'p.kirx'), kir(1))
    for (const r of ['p.kir', '../p.kir', join(dir, 'falso.kir.txt'), join(dir, 'p.kirx'), join(dir, 'carpeta.kir'), join(dir, 'no-existe.kir'), 'C:\\NUL.kir', '', null, 42, {}, 'C:\\x\0.kir'])
      expect(await s.abrirExterno(r), String(r)).toMatchObject({ ok: false })
    expect(recientes()).toEqual([])
  })

  it('rutas de dispositivo: se rechazan sin preguntar ni tocar el disco', async () => {
    const { s, avisosRed } = servicio({ red: true })
    for (const r of ['\\\\.\\C:\\x.kir', '//./C:/x.kir', '\\\\.\\pipe\\x.kir', '\\\\?\\GLOBALROOT\\x.kir', '\\\\?\\Volume{1}\\x.kir', '/\\?/Volume{1}/x.kir', '\\??\\C:\\x.kir'])
      expect(await s.abrirExterno(r), r).toMatchObject({ ok: false })
    expect(avisosRed).toEqual([])
  })

  it('rutas de red: sin confirmar no se tocan, y se pregunta por cada forma (barras mezcladas y mayúsculas)', async () => {
    const redes = ['\\\\srv\\s\\x.kir', '//srv/s/x.kir', '\\/srv/s/x.kir', '\\\\?\\UNC\\srv\\s\\x.kir', '\\\\?\\unc\\srv\\s\\x.kir', '//?/UNC/srv/s/x.kir', '\\??\\UNC\\srv\\s\\x.kir']
    const no = servicio({ red: false })
    for (const r of redes) expect(await no.s.abrirExterno(r), r).toMatchObject({ ok: false })
    expect(no.avisosRed).toEqual(redes)
    expect(no.recientes()).toEqual([])
  })

  it('una ruta local, incluida \\\\?\\C:\\, no pregunta por la red', async () => {
    const { s, avisosRed } = servicio({ red: false })
    await s.abrirExterno('\\\\?\\C:\\no-existe\\x.kir')
    await s.abrirExterno(join(dir, 'no-existe.kir'))
    expect(avisosRed).toEqual([])
  })

  it('un archivo más grande que el tope (64 MB) no se lee', async () => {
    const { s } = servicio()
    const ruta = join(dir, 'grande.kir')
    writeFileSync(ruta, kir(1))
    truncateSync(ruta, 64 * 2 ** 20 + 1)
    const r = await s.abrirExterno(ruta)
    expect(r).toMatchObject({ ok: false })
    expect('error' in r && r.error).toContain('demasiado grande')
  })

  it('abrir uno que no existe quita de Recientes la entrada vieja', async () => {
    const { s, recientes } = servicio()
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    await s.abrirExterno(ruta)
    rmSync(ruta)
    expect(await s.abrirExterno(ruta)).toMatchObject({ ok: false })
    expect(recientes()).toEqual([])
  })
})

describe('ServicioArchivos: guardar', () => {
  it('no escribe en rutas que no salieron de un diálogo ni de un archivo abierto', () => {
    const { s } = servicio()
    const ruta = join(dir, 'p.kir')
    expect(s.guardar(ruta, kir(1))).toEqual({ ok: false, error: 'No se puede guardar en esa ruta: usa Guardar como.' })
    expect(existsSync(ruta)).toBe(false)
  })

  it('Guardar como agrega .kir, permite la ruta, respalda lo anterior y la base del diario pasa a lo guardado', async () => {
    const elegida = join(dir, 'nuevo')
    const { s, datos, pedidos } = servicio({ guardar: elegida })
    const ruta = await s.rutaGuardar('C:\\x\\viejo.kir')
    expect(ruta).toBe(`${elegida}.kir`)
    // La carpeta nunca sale de la interfaz: de C:\x\viejo.kir (sin permiso) solo se toma el nombre.
    expect(pedidos).toEqual([{ tipo: 'kir', sugerida: 'viejo.kir' }])
    writeFileSync(ruta!, kir(9))
    s.sesion.nuevaBase(kir(0), { ruta: null, nombre: 'sin título.kir', sucio: false })
    s.sesion.anotar('{"v":1,"c":[]}')
    expect(s.guardar(ruta, kir(1))).toEqual({ ok: true, recientes: [ruta] })
    expect([...readFileSync(ruta!)]).toEqual([...kir(1)])
    const respaldos = readdirSync(carpetaDeRespaldos(datos, ruta!, 'win32')).filter((n) => n.endsWith('.kir'))
    expect(respaldos).toHaveLength(1)
    expect(readFileSync(join(s.sesion.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":2}\n')
    expect([...readFileSync(join(s.sesion.dir, 'base.kir'))]).toEqual([...kir(1)])
  })

  it('si la carpeta del archivo ya no existe no se vuelve a crear: se dice', () => {
    const { s } = servicio()
    const carpeta = join(dir, 'clase')
    mkdirSync(carpeta)
    const ruta = join(carpeta, 'p.kir')
    writeFileSync(ruta, kir(1))
    s.abrirRuta(ruta)
    rmSync(carpeta, { recursive: true })
    expect(s.guardar(ruta, kir(2))).toEqual({ ok: false, error: 'No se pudo guardar p.kir: la carpeta ya no existe.' })
    expect(existsSync(carpeta)).toBe(false)
  })

  it('rechaza bytes que no son bytes, vacíos o demasiado grandes', async () => {
    const { s } = servicio({ guardar: join(dir, 'p.kir') })
    const ruta = await s.rutaGuardar('p')
    for (const b of ['texto', new Uint8Array(0), [1, 2]]) expect(s.guardar(ruta, b)).toEqual({ ok: false, error: 'El circuito es demasiado grande para guardarlo.' })
  })

  it('una sugerida que no es una ruta se reduce a su nombre', async () => {
    const { s, pedidos } = servicio({ guardar: null })
    expect(await s.rutaGuardar('../../etc/x.kir')).toBeNull()
    expect(await s.rutaGuardar(42)).toBeNull()
    expect(pedidos.map((p) => p.sugerida)).toEqual(['x.kir', 'sin título.kir'])
  })

  it('la carpeta de la sugerencia la decide el proceso principal: último diálogo, archivo con permiso o Documentos', async () => {
    const docs = join(dir, 'Documentos')
    const otra = join(dir, 'otra', 'p.kir')
    mkdirSync(join(dir, 'otra'))
    writeFileSync(otra, kir(1))
    // Sin nada: Documentos.
    const a = servicio({ guardar: null, documentos: docs })
    await a.s.rutaGuardar('C:\\Windows\\System32\\x.kir')
    expect(a.pedidos.at(-1)!.sugerida).toBe(join(docs, 'x.kir'))
    // La carpeta del archivo abierto (con permiso), aunque no haya pasado por un diálogo.
    a.s.abrirRuta(otra)
    await a.s.rutaGuardar(otra)
    expect(a.pedidos.at(-1)!.sugerida).toBe(join(dir, 'otra', 'p.kir'))
    // La carpeta del último diálogo, también para exportar.
    const b = servicio({ abrir: otra, guardar: null, documentos: docs })
    await b.s.abrir()
    await b.s.rutaExportar('png', 'C:\\ajena\\esquema.kir')
    expect(b.pedidos.at(-1)).toEqual({ tipo: 'png', sugerida: join(dir, 'otra', 'esquema.png') })
  })

  it('cada diálogo recuerda su carpeta en los ajustes y la usa al volver a abrir', async () => {
    const docs = join(dir, 'Documentos')
    for (const c of ['uno', 'dos', 'tres']) mkdirSync(join(dir, c), { recursive: true })
    writeFileSync(join(dir, 'uno', 'p.kir'), kir(1))
    // Primera vez: nada guardado, el diálogo de abrir lo decide el sistema.
    const a = servicio({ abrir: join(dir, 'uno', 'p.kir'), guardar: join(dir, 'dos', 'q.kir'), documentos: docs })
    await a.s.abrir()
    expect(a.abiertasEn).toEqual([undefined])
    await a.s.rutaGuardar('q')
    expect(a.anotadas).toEqual([['abrir', join(dir, 'uno')], ['guardar', join(dir, 'dos')]])
    // Otra sesión con lo anotado: cada diálogo vuelve a su carpeta.
    const b = servicio({ abrir: null, guardar: null, documentos: docs, carpetas: { abrir: join(dir, 'uno'), guardar: join(dir, 'dos'), exportar: join(dir, 'tres') } })
    await b.s.abrir()
    await b.s.rutaGuardar('x')
    await b.s.rutaExportar('svg', 'x')
    expect(b.abiertasEn).toEqual([join(dir, 'uno')])
    expect(b.pedidos.map((p) => p.sugerida)).toEqual([join(dir, 'dos', 'x.kir'), join(dir, 'tres', 'x.svg')])
  })

  it('una carpeta guardada que ya no existe, no es carpeta o es de red no se usa', async () => {
    const docs = join(dir, 'Documentos')
    writeFileSync(join(dir, 'archivo.txt'), 'x')
    for (const guardada of [join(dir, 'borrada'), join(dir, 'archivo.txt'), '\\nas\clase', 'relativa']) {
      const { s, pedidos, abiertasEn } = servicio({ documentos: docs, carpetas: { abrir: guardada, guardar: guardada, exportar: guardada } })
      await s.abrir()
      await s.rutaGuardar('y')
      expect(abiertasEn).toEqual([undefined])
      expect(pedidos.at(-1)!.sugerida).toBe(join(docs, 'y.kir'))
    }
  })

  it('ataque: una sugerencia con ruta de red no abre el diálogo en esa carpeta', async () => {
    const { s, pedidos } = servicio({ guardar: null })
    await s.rutaGuardar('\\\\atacante@80\\s\\x.kir')
    await s.rutaExportar('svg', '//atacante/s/y.kir')
    await s.rutaGuardar('..')
    expect(pedidos.map((p) => p.sugerida)).toEqual(['x.kir', 'y.svg', 'sin título.kir'])
  })

  it('un diálogo nunca se abre en una carpeta de red, aunque el usuario la haya elegido antes', async () => {
    const { s, pedidos } = servicio({ guardar: '\\\\nas\\clase\\q.kir', documentos: join(dir, 'Documentos') })
    expect(await s.rutaGuardar('q')).toBe('\\\\nas\\clase\\q.kir')
    await s.rutaGuardar('\\\\nas\\clase\\q.kir')
    expect(pedidos.at(-1)!.sugerida).toBe(join(dir, 'Documentos', 'q.kir'))
  })

  it('motivoDeError en palabras', () => {
    expect(motivoDeError(Object.assign(new Error(), { code: 'ENOSPC' }))).toBe('el disco está lleno')
    expect(motivoDeError(Object.assign(new Error(), { code: 'EXDEV' }))).toBe('error del sistema (EXDEV)')
    expect(motivoDeError(null)).toBe('error del sistema')
  })
})

describe('ServicioArchivos: archivo abierto que cambia en el disco', () => {
  it('sabe qué archivo tiene abierto, avisa si otro lo cambia (no si guarda la ventana) y Recargar lo lee de nuevo', async () => {
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    const avisos: string[] = []
    const s = new ServicioArchivos({
      dirDatos: join(dir, 'datos'),
      dialogos: { abrir: async () => ruta, guardar: async () => null, confirmarReemplazo: async () => false, confirmarRed: async () => false },
      recientes: () => [],
      ponerRecientes: () => undefined,
      abrirCarpeta: async () => undefined,
      argv: ['kirchi.exe'],
      sesion: new Sesion(join(dir, 'datos'), ID, 1),
      plataforma: 'win32',
      avisarCambioEnDisco: (n) => void avisos.push(n)
    })
    try {
      expect((await s.abrir()).ok).toBe(true)
      s.diarioBase(kir(1), { ruta, nombre: 'p.kir', sucio: false })
      expect(s.rutaAbierta).toBe(ruta)
      expect(s.guardar(ruta, kir(2)).ok).toBe(true)
      s.revisarDisco()
      expect(avisos).toEqual([])
      writeFileSync(ruta, new Uint8Array([...kir(3), 9, 9]))
      s.revisarDisco()
      expect(avisos).toEqual(['p.kir'])
      const r = s.recargar()
      expect(r.ok && [...r.archivo.bytes]).toEqual([...kir(3), 9, 9])
    } finally {
      s.cerrar()
    }
  })
})

describe('ServicioArchivos: no pisar archivos que el diálogo no confirmó', () => {
  it('Guardar como que agrega .kir sobre un archivo que existe pregunta antes; sin confirmar no da permiso', async () => {
    writeFileSync(join(dir, 'tarea.kir'), kir(7))
    const { s, confirmados } = servicio({ guardar: join(dir, 'tarea'), reemplazar: false })
    expect(await s.rutaGuardar('p')).toBeNull()
    expect(confirmados).toEqual([join(dir, 'tarea.kir')])
    expect(s.guardar(join(dir, 'tarea.kir'), kir(1))).toMatchObject({ ok: false })
    expect([...readFileSync(join(dir, 'tarea.kir'))]).toEqual([...kir(7)])
  })

  it('confirmado el reemplazo, la ruta queda permitida', async () => {
    writeFileSync(join(dir, 'tarea.kir'), kir(7))
    const { s } = servicio({ guardar: join(dir, 'tarea'), reemplazar: true })
    const ruta = await s.rutaGuardar('p')
    expect(ruta).toBe(join(dir, 'tarea.kir'))
    expect(s.guardar(ruta, kir(1))).toMatchObject({ ok: true })
  })

  it('si el usuario ya escribió .kir, el diálogo nativo ya preguntó y no se repite; sin archivo previo tampoco', async () => {
    writeFileSync(join(dir, 'a.kir'), kir(7))
    const a = servicio({ guardar: join(dir, 'a.kir') })
    expect(await a.s.rutaGuardar('p')).toBe(join(dir, 'a.kir'))
    const b = servicio({ guardar: join(dir, 'nuevo') })
    expect(await b.s.rutaGuardar('p')).toBe(join(dir, 'nuevo.kir'))
    expect(a.confirmados.length + b.confirmados.length).toBe(0)
  })

  it('exportar con extensión agregada sobre un archivo existente también pregunta', async () => {
    writeFileSync(join(dir, 'esquema.png'), 'x')
    const { s, confirmados } = servicio({ guardar: join(dir, 'esquema'), reemplazar: false })
    expect(await s.rutaExportar('png', 'p')).toBeNull()
    expect(confirmados).toEqual([join(dir, 'esquema.png')])
  })
})

describe('ServicioArchivos: error del diario', () => {
  it('si el diario no se puede escribir, se avisa una vez por racha y vuelve a avisar tras recuperarse', () => {
    const { s, avisos } = servicio()
    s.diarioBase(kir(1), { ruta: null, nombre: 'p.kir', sucio: false })
    // Un archivo ocupa el lugar de la carpeta del diario: escribir en ella falla.
    rmSync(s.sesion.dir, { recursive: true, force: true })
    writeFileSync(s.sesion.dir, 'ocupado')
    s.diarioAnotar('{"v":1,"c":[1]}')
    s.diarioAnotar('{"v":1,"c":[2]}')
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatch(/copia de seguridad automática/)
    expect(avisos[0]).not.toMatch(/diario/i)
    rmSync(s.sesion.dir, { force: true })
    s.diarioBase(kir(1), { ruta: null, nombre: 'p.kir', sucio: false })
    s.diarioAnotar('{"v":1,"c":[3]}')
    expect(avisos).toHaveLength(1)
    rmSync(s.sesion.dir, { recursive: true, force: true })
    writeFileSync(s.sesion.dir, 'ocupado')
    s.diarioAnotar('{"v":1,"c":[4]}')
    expect(avisos).toHaveLength(2)
  })

  it('el diario que llega a su tope en disco deja de crecer y se avisa una vez', () => {
    const avisos: string[] = []
    const datos = join(dir, 'datos')
    const s = new ServicioArchivos({
      dirDatos: datos,
      dialogos: { abrir: async () => null, guardar: async () => null, confirmarReemplazo: async () => false, confirmarRed: async () => false },
      recientes: () => [],
      ponerRecientes: () => undefined,
      abrirCarpeta: async () => undefined,
      argv: ['kirchi.exe'],
      sesion: new Sesion(datos, ID, 1, 100),
      plataforma: 'win32',
      avisarErrorDiario: (m) => avisos.push(m)
    })
    s.diarioBase(kir(1), { ruta: null, nombre: 'p.kir', sucio: false })
    const renglon = `{"v":1,"c":["${'x'.repeat(30)}"]}`
    for (let i = 0; i < 5; i++) s.diarioAnotar(renglon)
    const diario = readFileSync(join(s.sesion.dir, 'diario.jsonl'), 'utf8')
    expect(Buffer.byteLength(diario)).toBeLessThanOrEqual(100)
    // La cabecera y un renglón: el segundo ya pasaría de 100 bytes.
    expect(diario.split('\n').filter(Boolean)).toHaveLength(2)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatch(/tamaño máximo/)
    // Una base nueva vacía el diario y vuelve a anotar.
    s.diarioBase(kir(2), { ruta: null, nombre: 'p.kir', sucio: false })
    s.diarioAnotar(renglon)
    expect(readFileSync(join(s.sesion.dir, 'diario.jsonl'), 'utf8').split('\n').filter(Boolean)).toHaveLength(2)
  })

  it('un fallo al rehacer la base tras guardar también se avisa, sin deshacer el guardado', async () => {
    const { s, avisos } = servicio({ guardar: join(dir, 'p.kir') })
    const ruta = await s.rutaGuardar('p')
    s.diarioBase(kir(0), { ruta: null, nombre: 'p.kir', sucio: false })
    rmSync(s.sesion.dir, { recursive: true, force: true })
    writeFileSync(s.sesion.dir, 'ocupado')
    expect(s.guardar(ruta, kir(1))).toMatchObject({ ok: true })
    expect(avisos).toHaveLength(1)
    expect([...readFileSync(ruta!)]).toEqual([...kir(1)])
  })
})

describe('ServicioArchivos: exportar', () => {
  it('solo en rutas del diálogo de exportar, con la extensión del formato', async () => {
    const { s, pedidos } = servicio({ guardar: join(dir, 'esquema') })
    const ruta = await s.rutaExportar('png', 'practica.kir')
    expect(ruta).toBe(join(dir, 'esquema.png'))
    expect(pedidos).toEqual([{ tipo: 'png', sugerida: 'practica.png' }])
    expect(s.escribirExportacion(ruta, new Uint8Array([1]))).toMatchObject({ ok: true })
    expect(s.escribirExportacion(join(dir, 'otra.png'), new Uint8Array([1]))).toMatchObject({ ok: false })
    expect(await s.rutaExportar('exe', 'x')).toBeNull()
  })

  it('el CSV de una captura del osciloscopio, con las mismas reglas de ruta', async () => {
    const { s, pedidos } = servicio({ guardar: join(dir, 'captura') })
    const ruta = await s.rutaExportar('csv', 'practica XSC1.csv')
    expect(ruta).toBe(join(dir, 'captura.csv'))
    expect(pedidos.at(-1)).toMatchObject({ tipo: 'csv' })
    expect(s.escribirExportacion(ruta, new TextEncoder().encode('t (s),A (V)\n'))).toMatchObject({ ok: true })
    expect(s.escribirExportacion(join(dir, 'otra.csv'), new Uint8Array([1]))).toMatchObject({ ok: false })
  })

  it('PDF: imprime el HTML de la hoja y lo escribe; valida ruta, SVG y página', async () => {
    const htmls: string[] = []
    const { s } = servicio({ guardar: join(dir, 'esquema'), imprimir: async (h) => (htmls.push(h), new Uint8Array([37, 80, 68, 70])) })
    const ruta = await s.rutaExportar('pdf', 'p.kir')
    const svg = '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'
    expect(await s.exportarPdf(ruta, svg, { tipo: 'carta', anchoMm: 100, altoMm: 50 })).toMatchObject({ ok: true })
    expect(readFileSync(ruta!, 'latin1')).toBe('%PDF')
    expect(htmls[0]).toContain('@page{size:279.4mm 215.9mm;margin:0}')
    expect(await s.exportarPdf(ruta, '<html></html>', { tipo: 'a4', anchoMm: 1, altoMm: 1 })).toMatchObject({ ok: false })
    expect(await s.exportarPdf(ruta, svg, { tipo: 'oficio', anchoMm: 1, altoMm: 1 })).toMatchObject({ ok: false })
    expect(await s.exportarPdf(join(dir, 'otro.pdf'), svg, { tipo: 'a4', anchoMm: 1, altoMm: 1 })).toMatchObject({ ok: false })
  })

  it('PDF: un error al imprimir se dice en palabras, sin rutas ni detalles de Chromium', async () => {
    const propio = servicio({ guardar: join(dir, 'x.pdf'), imprimir: async () => Promise.reject(new ErrorPdf('la ventana oculta no cargó')) })
    const ruta = await propio.s.rutaExportar('pdf', 'x')
    expect(await propio.s.exportarPdf(ruta, '<svg></svg>', { tipo: 'ajustar', anchoMm: 1, altoMm: 1 })).toEqual({ ok: false, error: 'No se pudo armar el PDF: la ventana oculta no cargó.' })
    const ajeno = servicio({ guardar: join(dir, 'y.pdf'), imprimir: async () => Promise.reject(new Error("ERR_FILE_NOT_FOUND (-6) loading 'file:///C:/Users/ana/AppData/Local/Temp/kirchi-pdf-1.html'")) })
    const r = await ajeno.s.exportarPdf(await ajeno.s.rutaExportar('pdf', 'y'), '<svg></svg>', { tipo: 'ajustar', anchoMm: 1, altoMm: 1 })
    expect(r).toEqual({ ok: false, error: 'No se pudo armar el PDF: falló la ventana que lo imprime.' })
  })

  it('PDF: uno a la vez; mientras se imprime, otro pedido se rechaza', async () => {
    let soltar: (b: Uint8Array) => void = () => undefined
    let llamadas = 0
    const { s } = servicio({ guardar: join(dir, 'z.pdf'), imprimir: () => (llamadas++, new Promise<Uint8Array>((r) => (soltar = r))) })
    const ruta = await s.rutaExportar('pdf', 'z')
    const pagina = { tipo: 'ajustar', anchoMm: 1, altoMm: 1 }
    const primero = s.exportarPdf(ruta, '<svg></svg>', pagina)
    expect(await s.exportarPdf(ruta, '<svg></svg>', pagina)).toEqual({ ok: false, error: 'Ya se está armando otro PDF; espera a que termine.' })
    soltar(new Uint8Array([37, 80, 68, 70]))
    expect(await primero).toMatchObject({ ok: true })
    const tercero = s.exportarPdf(ruta, '<svg></svg>', pagina)
    soltar(new Uint8Array([37, 80, 68, 70]))
    expect(await tercero).toMatchObject({ ok: true })
    expect(llamadas).toBe(2)
  })

  it('un permiso de exportar no sirve para guardar el circuito, ni al revés', async () => {
    const { s } = servicio({ guardar: join(dir, 'a.svg') })
    const svg = await s.rutaExportar('svg', 'a')
    expect(s.guardar(svg, new Uint8Array([1]))).toMatchObject({ ok: false })
    expect(s.puedeExportarPdf(svg)).toBe(false)
  })
})

describe('ServicioArchivos: diario y recuperación', () => {
  it('la base y los renglones llegan a la sesión con sus datos validados', () => {
    const { s } = servicio()
    s.diarioBase(kir(1), { ruta: 'relativa.kir', nombre: 'p.kir', sucio: 'sí' })
    s.diarioAnotar('{"v":1,"c":[]}')
    s.diarioAnotar(42)
    expect(JSON.parse(readFileSync(join(s.sesion.dir, 'sesion.json'), 'utf8'))).toMatchObject({ pid: 1, ruta: null, nombre: 'p.kir', sucio: false, generacion: 1 })
    expect(readFileSync(join(s.sesion.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":1}\n{"v":1,"c":[]}\n')
  })

  it('recuperar con un diario de otra generación da solo la base y lo dice en el Registro', () => {
    const { s, datos, avisos } = servicio()
    const otra = new Sesion(datos, '66666666-7777-8888-9999-00000000000a', 999999)
    otra.nuevaBase(kir(1), { ruta: null, nombre: 'p.kir', sucio: true })
    otra.anotar('{"v":1,"c":[]}')
    writeFileSync(join(otra.dir, 'diario.jsonl'), '{"generacion":7}\n{"v":1,"c":[]}\n')
    expect(s.recuperar(otra.id)).toEqual({ base: kir(1), diario: '', ruta: null, nombre: 'p.kir' })
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toMatch(/copia de seguridad automática/)
  })

  it('recuperar permite guardar encima del archivo original', () => {
    const { s, datos } = servicio()
    const ruta = join(dir, 'p.kir')
    const otra = new Sesion(datos, '66666666-7777-8888-9999-000000000000', 999999)
    otra.nuevaBase(kir(1), { ruta, nombre: 'p.kir', sucio: false })
    otra.anotar('{"v":1,"c":[]}')
    const rec = s.recuperables()
    expect(rec.map((r) => r.nombre)).toEqual(['p.kir'])
    expect(s.recuperar(rec[0].id)).toMatchObject({ ruta, nombre: 'p.kir' })
    expect(s.guardar(ruta, kir(2))).toMatchObject({ ok: true })
    s.descartar(rec[0].id)
    expect(s.recuperables()).toEqual([])
  })

  it('ataque: base con ruta ajena, recuperar la sesión propia y guardar no escribe nada', () => {
    const { s } = servicio()
    const victima = join(dir, 'ajeno.kir')
    s.diarioBase(kir(1), { ruta: victima, nombre: 'x.kir', sucio: true })
    s.diarioAnotar('{"v":1,"c":[]}')
    expect(JSON.parse(readFileSync(join(s.sesion.dir, 'sesion.json'), 'utf8')).ruta).toBeNull()
    expect(s.recuperar(ID)).toBeNull()
    expect(s.guardar(victima, kir(9))).toMatchObject({ ok: false })
    expect(existsSync(victima)).toBe(false)
  })

  it('diarioBase conserva la ruta solo si ya tiene permiso', () => {
    const { s } = servicio()
    const ruta = join(dir, 'p.kir')
    writeFileSync(ruta, kir(1))
    s.abrirRuta(ruta)
    s.diarioBase(kir(1), { ruta, nombre: 'p.kir', sucio: false })
    expect(JSON.parse(readFileSync(join(s.sesion.dir, 'sesion.json'), 'utf8')).ruta).toBe(ruta)
  })

  it('no se recupera ni se descarta la sesión propia ni una de un proceso vivo', () => {
    const { s, datos } = servicio()
    s.diarioBase(kir(1), { ruta: null, nombre: 'a.kir', sucio: true })
    const viva = new Sesion(datos, '66666666-7777-8888-9999-000000000001', process.pid)
    viva.nuevaBase(kir(1), { ruta: null, nombre: 'v.kir', sucio: true })
    expect(s.recuperar(ID)).toBeNull()
    expect(s.recuperar(viva.id)).toBeNull()
    s.descartar(ID)
    s.descartar(viva.id)
    expect(existsSync(s.sesion.dir)).toBe(true)
    expect(existsSync(viva.dir)).toBe(true)
  })

  it('ids con recorrido de carpetas no recuperan ni borran nada', () => {
    const { s, datos } = servicio()
    const fuera = join(dir, 'fuera')
    mkdirSync(fuera)
    writeFileSync(join(fuera, 'x'), 'x')
    for (const id of ['../../fuera', '..', join('..', '..', 'fuera'), `${ID}/../${ID}`, 42, null]) {
      expect(s.recuperar(id)).toBeNull()
      s.descartar(id)
    }
    expect(existsSync(join(fuera, 'x'))).toBe(true)
  })

  it('una sesión muerta con ruta cuya carpeta ya no existe no da permiso de escritura', () => {
    const { s, datos } = servicio()
    const ruta = join(dir, 'borrada', 'p.kir')
    const otra = new Sesion(datos, '66666666-7777-8888-9999-000000000002', 999999)
    otra.nuevaBase(kir(1), { ruta, nombre: 'p.kir', sucio: true })
    // Sin permiso renovado, la interfaz no recibe la ruta: el circuito vuelve como «sin archivo».
    expect(s.recuperar(otra.id)).toMatchObject({ ruta: null, nombre: 'p.kir' })
    expect(s.guardar(ruta, kir(2))).toMatchObject({ ok: false })
  })

  it('Recientes abre la ruta tal como está en la lista y quita la que ya no existe aunque se pida con otras mayúsculas', () => {
    const { s, recientes } = servicio()
    const ruta = join(dir, 'Practica.kir')
    writeFileSync(ruta, kir(1))
    s.abrirRuta(ruta)
    const r = s.abrirReciente(ruta.toLowerCase())
    expect(r).toMatchObject({ ok: true, archivo: { ruta, nombre: 'Practica.kir' } })
    rmSync(ruta)
    expect(s.abrirReciente(ruta.toUpperCase())).toMatchObject({ ok: false, recientes: [] })
    expect(recientes()).toEqual([])
  })

  it('los errores que llegan a la interfaz dicen el nombre, no la ruta completa', async () => {
    const { s, datos } = servicio()
    // La carpeta de datos ocupada por un archivo: crear la de respaldos falla.
    writeFileSync(datos, 'ocupado')
    await expect(s.abrirRespaldos()).rejects.toThrow(/^No se pudo abrir la carpeta de respaldos: /)
    await s.abrirRespaldos().catch((e: Error) => expect(e.message).not.toContain(dir))
  })

  it('una sesión muerta con ruta que no es .kir no da permiso', () => {
    const { s, datos } = servicio()
    const ruta = join(dir, 'p.txt')
    const otra = new Sesion(datos, '66666666-7777-8888-9999-000000000003', 999999)
    otra.nuevaBase(kir(1), { ruta, nombre: 'p.kir', sucio: true })
    s.recuperar(otra.id)
    expect(s.guardar(ruta, kir(2))).toMatchObject({ ok: false })
  })

  it('la carpeta de respaldos se crea y se abre en el explorador', async () => {
    const { s, carpetas, datos } = servicio()
    await s.abrirRespaldos()
    expect(carpetas).toEqual([join(datos, 'respaldos')])
    expect(existsSync(join(datos, 'respaldos'))).toBe(true)
  })

  describe('esquema jerárquico de KiCad', () => {
    const esquema = (...hojas: string[]) =>
      `(kicad_sch (version 20250114)
${hojas.map((h) => `(sheet (at 0 0) (size 5 5) (property "Sheetname" "H" (at 0 0 0)) (property "Sheetfile" "${h}" (at 0 0 0)))`).join('\n')}
)`

    it('abrir lee las hojas citadas, también las de una subcarpeta y las de hojas dentro de hojas', () => {
      mkdirSync(join(dir, 'sub'))
      writeFileSync(join(dir, 'padre.kicad_sch'), esquema('uno.kicad_sch', 'sub/dos.kicad_sch'))
      writeFileSync(join(dir, 'uno.kicad_sch'), esquema())
      writeFileSync(join(dir, 'sub', 'dos.kicad_sch'), esquema('tres.kicad_sch'))
      writeFileSync(join(dir, 'sub', 'tres.kicad_sch'), esquema())
      const { s } = servicio()
      const r = s.abrirRuta(join(dir, 'padre.kicad_sch'))
      if (!r.ok) throw new Error('no abrió')
      expect(Object.keys(r.archivo.anexos ?? {}).sort()).toEqual(['sub/dos.kicad_sch', 'tres.kicad_sch', 'uno.kicad_sch'])
      expect(r.archivo.avisosAnexos).toBeUndefined()
    })

    it('una cita con .., ruta absoluta o ruta de red se rechaza con aviso y no se lee', () => {
      const fuera = mkdtempSync(join(tmpdir(), 'kirchi-fuera-'))
      try {
        writeFileSync(join(fuera, 'secreto.kicad_sch'), esquema())
        mkdirSync(join(dir, 'carpeta'))
        writeFileSync(join(dir, 'carpeta', 'padre.kicad_sch'), esquema('../../' + fuera.split(/[\\/]/).pop() + '/secreto.kicad_sch', join(fuera, 'secreto.kicad_sch'), '\\\\servidor\\r\\x.kicad_sch', 'sub/../../a.kicad_sch'))
        const r = servicio().s.abrirRuta(join(dir, 'carpeta', 'padre.kicad_sch'))
        if (!r.ok) throw new Error('no abrió')
        expect(r.archivo.anexos).toBeUndefined()
        expect(r.archivo.avisosAnexos).toHaveLength(4)
      } finally {
        rmSync(fuera, { recursive: true, force: true })
      }
    })

    it('una hoja que falta o un ciclo entre hojas no rompen la apertura', () => {
      writeFileSync(join(dir, 'a.kicad_sch'), esquema('b.kicad_sch', 'falta.kicad_sch'))
      writeFileSync(join(dir, 'b.kicad_sch'), esquema('a.kicad_sch'))
      const r = servicio().s.abrirRuta(join(dir, 'a.kicad_sch'))
      if (!r.ok) throw new Error('no abrió')
      expect(Object.keys(r.archivo.anexos ?? {}).sort()).toEqual(['b.kicad_sch'])
      expect(r.archivo.avisosAnexos).toEqual([expect.stringContaining('falta.kicad_sch')])
    })

    it('se leen como máximo 64 hojas', () => {
      const nombres = Array.from({ length: 70 }, (_, i) => `h${i}.kicad_sch`)
      writeFileSync(join(dir, 'padre.kicad_sch'), esquema(...nombres))
      for (const n of nombres) writeFileSync(join(dir, n), esquema())
      const r = servicio().s.abrirRuta(join(dir, 'padre.kicad_sch'))
      if (!r.ok) throw new Error('no abrió')
      expect(Object.keys(r.archivo.anexos ?? {})).toHaveLength(64)
      expect(r.archivo.avisosAnexos).toHaveLength(6)
    })
  })
})
