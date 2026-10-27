import { describe, expect, it } from 'vitest'
import type { ApiArchivos, BaseDiario, Recuperable, ResultadoAbrir } from '../../../compartido/archivos'
import { crear } from '../doc/comandos'
import { Historial } from '../doc/historial'
import { documentoVacio, type Documento } from '../doc/tipos'
import { divisor } from '../prueba/circuitos'
import { ControlArchivo, MENSAJE_SIN_ARCHIVOS, textoFecha, tituloVentana, type EditorArchivo, type Respuesta, type RespuestaRecuperar } from './control'
import { Diario } from './diario'
import { escribirKir, FORMATO_ACTUAL, leerKir } from './kir'
import { strToU8, zipSync } from 'fflate'
import type { PiezaDef } from '../piezas/tipos'
import { libreriaSinDom } from '../prueba/pasoVista'

const pieza = { id: 'p1', tipo: 'resistencia', ref: 'R1', x: 0, y: 0, rot: 0 as const, espejo: false, props: {} }

/** Disco, diálogos y diario del proceso principal, en memoria. */
function apiFalsa() {
  const disco = new Map<string, Uint8Array>()
  const llamadas: string[] = []
  const bases: { bytes: Uint8Array; base: BaseDiario }[] = []
  const renglones: string[] = []
  const recuperables: Recuperable[] = []
  const recuperacion = new Map<string, { base: Uint8Array; diario: string; ruta: string | null; nombre: string }>()
  let recientes: string[] = []
  const o = { abrir: null as string | null, guardarComo: null as string | null, inicial: null as ResultadoAbrir | null, fallaGuardar: '' }
  const leer = (ruta: string): ResultadoAbrir => {
    const bytes = disco.get(ruta)
    if (!bytes) return { ok: false, error: `No se encontró ${ruta}.`, recientes }
    recientes = [ruta, ...recientes.filter((r) => r !== ruta)]
    return { ok: true, archivo: { ruta, nombre: ruta.split('/').pop()!, bytes }, recientes }
  }
  const api: ApiArchivos = {
    abrir: async () => (o.abrir ? leer(o.abrir) : { ok: false, cancelado: true }),
    abrirReciente: async (r) => leer(r),
    abrirSoltado: async (f) => (f.name.endsWith('.kir') && !f.name.startsWith('sin-ruta') ? leer(`/disco/${f.name}`) : null),
    inicial: async () => o.inicial,
    rutaGuardar: async (s) => {
      llamadas.push(`rutaGuardar ${s}`)
      return o.guardarComo
    },
    guardar: async (ruta, bytes) => {
      llamadas.push(`guardar ${ruta}`)
      if (o.fallaGuardar) return { ok: false, error: o.fallaGuardar }
      disco.set(ruta, bytes)
      recientes = [ruta, ...recientes.filter((r) => r !== ruta)]
      return { ok: true, recientes }
    },
    olvidarRecientes: async () => (recientes = []),
    abrirRespaldos: async () => undefined,
    rutaExportar: async () => null,
    escribirExportacion: async () => ({ ok: true, recientes }),
    pdf: async () => ({ ok: true, recientes }),
    diarioBase: (bytes, base) => bases.push({ bytes, base }),
    diarioAnotar: (r) => renglones.push(r),
    recuperables: async () => recuperables,
    recuperar: async (id) => recuperacion.get(id) ?? null,
    descartar: async (id) => {
      llamadas.push(`descartar ${id}`)
    },
    estadoVentana: () => undefined,
    alPedirCerrar: () => () => undefined,
    cerrar: (d) => llamadas.push(`cerrar ${d}`),
    alErrorDiario: () => () => undefined,
    alAbrirExterno: () => () => undefined
  }
  return { api, disco, llamadas, bases, renglones, recuperables, recuperacion, o }
}

/** Un editor mínimo sobre el historial real. */
function editorFalso(): EditorArchivo & { soloLectura: boolean } {
  const h = new Historial(documentoVacio())
  return {
    soloLectura: false,
    get doc() {
      return h.doc
    },
    historial: h,
    cargar(doc: Documento, o: { sucio?: boolean; soloLectura?: boolean } = {}) {
      h.reemplazar(doc)
      if (o.sucio) h.marcarSucio()
      this.soloLectura = o.soloLectura === true
    },
    marca: () => (h.cerrarGrupo(), h.marca()),
    marcarGuardado: (m?: unknown) => h.marcarGuardado(m)
  }
}

function armar(respuestas: { guardar?: Respuesta; recuperar?: RespuestaRecuperar } = {}, conApi = true, lib?: Map<string, PiezaDef>) {
  const a = apiFalsa()
  const editor = editorFalso()
  const registro: string[] = []
  const niveles: string[] = []
  const errores: string[] = []
  const preguntas: string[] = []
  let cargados = 0
  const hechos: string[] = []
  const diario = new Diario({ anotar: (r) => a.api.diarioAnotar(r), nuevaBase: (d) => a.api.diarioBase(escribirKir(d, '0.0.1'), { ruta: null, nombre: 'x', sucio: true }) }, () => editor.doc)
  editor.historial.suscribir(diario.alCambiar)
  const c = new ControlArchivo({
    api: conApi ? a.api : undefined,
    editor,
    diario,
    version: '0.0.1',
    lib,
    ui: {
      preguntarGuardar: async (n) => {
        preguntas.push(n)
        return respuestas.guardar ?? 'cancelar'
      },
      ofrecerRecuperar: async () => respuestas.recuperar ?? 'despues',
      registrar: (t, nivel = 'aviso') => (registro.push(t), niveles.push(nivel)),
      error: (t) => errores.push(t),
      anunciar: () => undefined,
      cargado: () => cargados++,
      recientes: () => undefined,
      estado: () => undefined,
      hecho: (e) => hechos.push(e)
    }
  })
  const editar = () => editor.historial.ejecutar(crear('crear', 'piezas', { ...pieza, id: `p${Math.random().toString(36).slice(2, 8)}` }))
  return { ...a, c, editor, registro, niveles, errores, preguntas, editar, hechos, cargados: () => cargados }
}

describe('ControlArchivo', () => {
  it('avisa una vez en el Registro de lo que el archivo usa y la librería no tiene', async () => {
    const recortada = new Map([...libreriaSinDom()].filter(([t]) => t !== 'resistencia'))
    const t = armar({}, true, recortada)
    t.disco.set('/disco/d.kir', escribirKir(divisor(), '0.0.1'))
    await t.c.abrirReciente('/disco/d.kir')
    expect(t.registro.filter((x) => x.startsWith('Este circuito usa lo que esta versión de Kirchi no tiene'))).toHaveLength(1)
    expect(t.registro[0]).toContain('la pieza resistencia (R1, R2)')
  })

  it('con la librería completa no avisa', async () => {
    const t = armar({}, true, libreriaSinDom())
    t.disco.set('/disco/d.kir', escribirKir(divisor(), '0.0.1'))
    await t.c.abrirReciente('/disco/d.kir')
    expect(t.registro).toEqual([])
  })

  it('título: asterisco con cambios y solo lectura', () => {
    expect(tituloVentana({ ruta: null, nombre: 'sin título.kir', soloLectura: false }, false)).toBe('sin título.kir · Kirchi')
    expect(tituloVentana({ ruta: '/p.kir', nombre: 'p.kir', soloLectura: true }, true)).toBe('p.kir * (solo lectura) · Kirchi')
  })

  it('textoFecha', () => {
    expect(textoFecha(new Date(2026, 9, 3, 9, 5).getTime())).toBe('03/10/2026 a las 09:05')
  })

  it('guardar por primera vez pide la ruta, escribe el .kir y deja el documento guardado', async () => {
    const t = armar()
    t.o.guardarComo = '/disco/p.kir'
    t.editar()
    expect(await t.c.guardar()).toBe(true)
    expect(t.llamadas).toEqual(['rutaGuardar sin título.kir', 'guardar /disco/p.kir'])
    expect(t.c.estado).toEqual({ ruta: '/disco/p.kir', nombre: 'p.kir', soloLectura: false })
    expect(t.editor.historial.sinGuardar).toBe(false)
    const l = leerKir(t.disco.get('/disco/p.kir')!)
    expect(l.ok && l.doc).toEqual(t.editor.doc)
    // La segunda vez guarda directo.
    t.editar()
    await t.c.guardar()
    expect(t.llamadas.at(-1)).toBe('guardar /disco/p.kir')
    expect(t.llamadas.filter((x) => x.startsWith('rutaGuardar'))).toHaveLength(1)
  })

  it('cancelar Guardar como no guarda; un error se muestra y deja el documento sin guardar', async () => {
    const t = armar()
    t.editar()
    expect(await t.c.guardar()).toBe(false)
    t.o.guardarComo = '/disco/p.kir'
    t.o.fallaGuardar = 'No se pudo guardar p.kir: el disco está lleno.'
    expect(await t.c.guardar()).toBe(false)
    expect(t.errores).toEqual(['No se pudo guardar p.kir: el disco está lleno.'])
    expect(t.editor.historial.sinGuardar).toBe(true)
    expect(t.c.estado.ruta).toBeNull()
  })

  it('abrir con cambios pregunta; Cancelar no toca nada, No guardar abre', async () => {
    const t = armar({ guardar: 'cancelar' })
    t.disco.set('/disco/d.kir', escribirKir(divisor(), '0.0.1'))
    t.o.abrir = '/disco/d.kir'
    t.editar()
    await t.c.abrir()
    expect(t.preguntas).toEqual(['sin título.kir'])
    expect(Object.keys(t.editor.doc.piezas)).toHaveLength(1)
    const u = armar({ guardar: 'descartar' })
    u.disco.set('/disco/d.kir', escribirKir(divisor(), '0.0.1'))
    u.o.abrir = '/disco/d.kir'
    u.editar()
    await u.c.abrir()
    expect(u.editor.doc).toEqual(divisor())
    expect(u.c.estado).toEqual({ ruta: '/disco/d.kir', nombre: 'd.kir', soloLectura: false })
    expect(u.editor.historial.sinGuardar).toBe(false)
    expect(u.cargados()).toBe(1)
    // La base del diario pasa a ser el archivo abierto.
    expect(u.bases.at(-1)).toEqual({ bytes: u.disco.get('/disco/d.kir'), base: { ruta: '/disco/d.kir', nombre: 'd.kir', sucio: false } })
  })

  it('Guardar en la pregunta guarda antes de abrir; si no se guarda, no abre', async () => {
    const t = armar({ guardar: 'guardar' })
    t.disco.set('/disco/d.kir', escribirKir(divisor(), '0.0.1'))
    t.o.abrir = '/disco/d.kir'
    t.editar()
    await t.c.abrir()
    expect(Object.keys(t.editor.doc.piezas)).toHaveLength(1)
    t.o.guardarComo = '/disco/antes.kir'
    await t.c.abrir()
    expect(t.disco.has('/disco/antes.kir')).toBe(true)
    expect(t.editor.doc).toEqual(divisor())
  })

  it('un archivo dañado da el error de lectura y deja el documento como estaba', async () => {
    const t = armar()
    t.disco.set('/disco/malo.kir', new Uint8Array([1, 2, 3]))
    await t.c.abrirReciente('/disco/malo.kir')
    expect(t.errores).toEqual(['No se pudo abrir malo.kir: el archivo no es un circuito de Kirchi: no se pudo descomprimir.'])
    expect(t.c.estado.ruta).toBeNull()
  })

  it('Recargar después de un cambio en el disco lee el archivo sin preguntar: el usuario ya eligió', async () => {
    const t = armar()
    t.o.guardarComo = '/disco/p.kir'
    await t.c.guardar()
    const otro = armar()
    otro.editar()
    otro.o.guardarComo = '/disco/q.kir'
    await otro.c.guardar()
    t.api.recargar = async () => ({ ok: true, archivo: { ruta: '/disco/p.kir', nombre: 'p.kir', bytes: otro.disco.get('/disco/q.kir')! }, recientes: [] })
    t.editar()
    expect(await t.c.recargar()).toBe(true)
    expect(t.preguntas).toEqual([])
    expect(Object.keys(t.editor.doc.piezas)).toHaveLength(1)
    expect(t.editor.historial.sinGuardar).toBe(false)
    t.api.recargar = async () => ({ ok: false, error: 'No se encontró p.kir.', recientes: [] })
    expect(await t.c.recargar()).toBe(false)
    expect(t.errores).toEqual(['No se encontró p.kir.'])
  })

  it('un .kir que abre el sistema con la ventana ya abierta: pregunta por los cambios y solo entonces lo carga', async () => {
    const t = armar()
    t.o.guardarComo = '/disco/p.kir'
    t.editar()
    await t.c.guardar()
    t.disco.set('/disco/otro.kir', t.disco.get('/disco/p.kir')!)
    t.editar()
    // Con cambios sin guardar y la respuesta «cancelar» (la de omisión), no se reemplaza nada.
    await t.c.abrirExterno({ ok: true, archivo: { ruta: '/disco/otro.kir', nombre: 'otro.kir', bytes: t.disco.get('/disco/otro.kir')! }, recientes: [] })
    expect(t.preguntas).toEqual(['p.kir'])
    expect(t.c.estado.ruta).toBe('/disco/p.kir')
    // Sin cambios pendientes se carga sin preguntar; un error del proceso principal llega al usuario.
    const u = armar()
    u.disco.set('/disco/otro.kir', t.disco.get('/disco/otro.kir')!)
    await u.c.abrirExterno({ ok: true, archivo: { ruta: '/disco/otro.kir', nombre: 'otro.kir', bytes: t.disco.get('/disco/otro.kir')! }, recientes: [] })
    expect(u.preguntas).toEqual([])
    expect(u.c.estado.ruta).toBe('/disco/otro.kir')
    await t.c.abrirExterno({ ok: false, error: 'No se encontró x.kir.', recientes: [] })
    expect(t.errores).toEqual(['No se encontró x.kir.'])
  })

  it('avisa al tutorial lo que de verdad ocurrió: guardado, nuevo y reciente abierta, y nada si falló o se canceló', async () => {
    const t = armar()
    t.o.guardarComo = '/disco/p.kir'
    t.editar()
    await t.c.guardar()
    expect(t.hechos).toEqual(['guardado'])
    await t.c.nuevo()
    expect(t.hechos).toEqual(['guardado', 'nuevo'])
    await t.c.abrirReciente('/disco/p.kir')
    expect(t.hechos).toEqual(['guardado', 'nuevo', 'reciente'])
    // Un archivo dañado, un guardado que falla y un Nuevo cancelado no cuentan.
    t.disco.set('/disco/malo.kir', new Uint8Array([1, 2, 3]))
    await t.c.abrirReciente('/disco/malo.kir')
    t.o.fallaGuardar = 'sin espacio'
    t.editar()
    await t.c.guardar()
    await t.c.nuevo()
    expect(t.hechos).toEqual(['guardado', 'nuevo', 'reciente'])
  })

  it('un circuito empaquetado reemplaza el documento sin ruta, pregunta antes si hay cambios y no cuenta como Nuevo', async () => {
    const t = armar({ guardar: 'cancelar' })
    t.editar()
    expect(await t.c.abrirEmpaquetado(divisor())).toBe(false)
    expect(t.preguntas).toHaveLength(1)
    const t2 = armar()
    expect(await t2.c.abrirEmpaquetado(divisor())).toBe(true)
    expect(t2.editor.doc).toEqual(divisor())
    expect(t2.c.estado.ruta).toBeNull()
    expect(t2.cargados()).toBe(1)
    expect(t2.hechos).toEqual([])
  })

  it('los avisos de lectura van al Registro', async () => {
    const t = armar()
    const datos = { piezas: { p2: { ...pieza, id: 'p2', x: 0.5 } } }
    t.disco.set('/disco/a.kir', zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato: 1, version: 'x' })), 'circuito.json': strToU8(JSON.stringify(datos)) }))
    await t.c.abrirReciente('/disco/a.kir')
    expect(t.registro).toEqual(['Se descartó la pieza R1: posición no entera.'])
  })

  it('un archivo de un formato más nuevo abre en solo lectura y no se guarda', async () => {
    const t = armar()
    t.disco.set('/disco/n.kir', zipSync({ 'manifest.json': strToU8(JSON.stringify({ app: 'kirchi', formato: FORMATO_ACTUAL + 1, version: 'x' })), 'circuito.json': strToU8('{}') }))
    await t.c.abrirReciente('/disco/n.kir')
    expect(t.editor.soloLectura).toBe(true)
    expect(t.c.estado.soloLectura).toBe(true)
    expect(await t.c.guardar()).toBe(false)
    expect(t.errores[0]).toMatch(/^n\.kir se abrió en solo lectura/)
    expect(t.llamadas.filter((x) => x.startsWith('guardar'))).toEqual([])
  })

  it('nuevo deja un documento vacío sin ruta', async () => {
    const t = armar({ guardar: 'descartar' })
    t.editar()
    await t.c.nuevo()
    expect(t.editor.doc).toEqual(documentoVacio())
    expect(t.c.estado).toEqual({ ruta: null, nombre: 'sin título.kir', soloLectura: false })
  })

  it('soltar abre el primer .kir y avisa si no hay ninguno', async () => {
    const t = armar()
    t.disco.set('/disco/d.kir', escribirKir(divisor(), '0.0.1'))
    await t.c.soltar([new File(['x'], 'foto.png'), new File(['x'], 'd.kir')])
    expect(t.c.estado.ruta).toBe('/disco/d.kir')
    await t.c.soltar([new File(['x'], 'foto.png')])
    expect(t.errores).toEqual(['Solo se abren circuitos .kir; se ignoró foto.png.'])
    // Un File sin ruta en el disco (armado en la página): el preload devuelve null y se dice.
    await t.c.soltar([new File(['x'], 'sin-ruta.kir')])
    expect(t.errores.at(-1)).toBe('No se pudo abrir sin-ruta.kir: no viene de una carpeta del equipo.')
  })

  it('cerrar: sin cambios cierra; con cambios pregunta y respeta la respuesta', async () => {
    const t = armar({ guardar: 'descartar' })
    await t.c.pedirCerrar()
    expect(t.llamadas).toEqual(['cerrar false'])
    t.editar()
    await t.c.pedirCerrar()
    expect(t.llamadas.at(-1)).toBe('cerrar true')
    const u = armar({ guardar: 'cancelar' })
    u.editar()
    await u.c.pedirCerrar()
    expect(u.llamadas).toEqual([])
    const v = armar({ guardar: 'guardar' })
    v.o.guardarComo = '/disco/v.kir'
    v.editar()
    await v.c.pedirCerrar()
    expect(v.llamadas).toEqual(['rutaGuardar sin título.kir', 'guardar /disco/v.kir', 'cerrar false'])
  })

  it('al iniciar abre el archivo de la línea de órdenes y ofrece recuperar', async () => {
    const t = armar({ recuperar: 'recuperar' })
    t.o.inicial = { ok: true, archivo: { ruta: '/disco/d.kir', nombre: 'd.kir', bytes: escribirKir(divisor(), '0.0.1') }, recientes: [] }
    const base = escribirKir(documentoVacio(), '0.0.1')
    t.recuperables.push({ id: 'a', nombre: 'q.kir', ruta: '/disco/q.kir', fecha: 1 })
    t.recuperacion.set('a', { base, diario: JSON.stringify({ v: 1, c: [['piezas', 'p1', pieza]] }) + '\n', ruta: '/disco/q.kir', nombre: 'q.kir' })
    await t.c.iniciar()
    expect(t.editor.doc.piezas).toEqual({ p1: pieza })
    expect(t.c.estado).toEqual({ ruta: '/disco/q.kir', nombre: 'q.kir', soloLectura: false })
    expect(t.editor.historial.sinGuardar).toBe(true)
    expect(t.llamadas).toContain('descartar a')
    expect(t.bases.at(-1)?.base).toEqual({ ruta: '/disco/q.kir', nombre: 'q.kir', sucio: true })
    expect(t.registro.at(-1)).toBe('Se recuperó q.kir con los cambios sin guardar; guárdalo para conservarlos.')
    // Es informativo: va en el gris del Registro, no en ámbar.
    expect(t.niveles.at(-1)).toBe('info')
  })

  it('decidir después no toca nada; descartar borra la sesión', async () => {
    const t = armar({ recuperar: 'despues' })
    t.recuperables.push({ id: 'a', nombre: 'q.kir', ruta: null, fecha: 1 })
    await t.c.iniciar()
    expect(t.llamadas).toEqual([])
    const u = armar({ recuperar: 'descartar' })
    u.recuperables.push({ id: 'a', nombre: 'q.kir', ruta: null, fecha: 1 })
    await u.c.iniciar()
    expect(u.llamadas).toEqual(['descartar a'])
  })

  it('sin preload dice por qué no puede', async () => {
    const t = armar({}, false)
    await t.c.abrir()
    await t.c.guardar()
    expect(t.errores).toEqual([MENSAJE_SIN_ARCHIVOS, MENSAJE_SIN_ARCHIVOS])
  })

  it('dos Ctrl+S seguidos no abren dos diálogos', async () => {
    const t = armar()
    t.o.guardarComo = '/disco/p.kir'
    t.editar()
    const [a, b] = await Promise.all([t.c.guardar(), t.c.guardar()])
    expect([a, b]).toEqual([true, false])
    expect(t.llamadas.filter((x) => x.startsWith('rutaGuardar'))).toHaveLength(1)
  })
})
