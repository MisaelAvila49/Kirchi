import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buscarRecuperables, CARPETA_RECUPERACION, descartarRecuperacion, DiarioLleno, huellaBase, leerRecuperacion, pidVivo, Sesion } from './recuperacion'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-recuperacion-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const base = new Uint8Array([80, 75, 3, 4])
const nadieVive = () => false
const ID_A = '11111111-2222-3333-4444-555555555555'
const ID_B = '66666666-7777-8888-9999-000000000000'
const DIEZ_MIN = 10 * 60 * 1000 + 1000

describe('Sesion', () => {
  it('la base vacía el diario y los renglones se agregan en orden', () => {
    const s = new Sesion(dir, ID_A, 4242)
    s.anotar('{"antes":"de la base"}')
    s.nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    s.anotar('{"v":1,"c":[1]}')
    s.anotar('{"v":1,"c":[2]}')
    expect(readFileSync(join(s.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":1}\n{"v":1,"c":[1]}\n{"v":1,"c":[2]}\n')
    s.nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    expect(readFileSync(join(s.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":2}\n')
    expect(JSON.parse(readFileSync(join(s.dir, 'sesion.json'), 'utf8'))).toEqual({ pid: 4242, ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false, generacion: 2, huella: huellaBase(base) })
  })

  it('mientras se rehace la base no se anota nada: un fallo a la mitad no mezcla renglones viejos con la base nueva', () => {
    const s = new Sesion(dir, ID_A, 4242)
    s.nuevaBase(base, { ruta: null, nombre: 'a.kir', sucio: false })
    s.anotar('{"v":1,"c":[1]}')
    rmSync(join(s.dir, 'base.kir'))
    mkdirSync(join(s.dir, 'base.kir'))
    writeFileSync(join(s.dir, 'base.kir', 'x'), 'x')
    expect(() => s.nuevaBase(new Uint8Array([1, 2]), { ruta: null, nombre: 'b.kir', sucio: false })).toThrow()
    s.anotar('{"v":1,"c":[2]}')
    expect(readFileSync(join(s.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":1}\n{"v":1,"c":[1]}\n')
  })

  it('un renglón con saltos de línea no entra (rompería el diario)', () => {
    const s = new Sesion(dir, ID_A)
    s.nuevaBase(base, { ruta: null, nombre: 'sin título.kir', sucio: false })
    s.anotar('a\nb')
    expect(readFileSync(join(s.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":1}\n')
  })

  it('terminar y descartar no lanzan si la carpeta no se puede borrar', () => {
    expect(() => new Sesion(join(dir, 'a\0b'), ID_A).terminar()).not.toThrow()
    expect(() => descartarRecuperacion(join(dir, 'a\0b'), ID_A)).not.toThrow()
  })

  it('terminar borra la carpeta', () => {
    const s = new Sesion(dir, ID_A)
    s.nuevaBase(base, { ruta: null, nombre: 'sin título.kir', sucio: false })
    s.terminar()
    expect(existsSync(s.dir)).toBe(false)
  })
})

describe('buscarRecuperables', () => {
  it('ofrece la sesión de un proceso que ya no existe y que tiene cambios', () => {
    const s = new Sesion(dir, ID_A, 1)
    s.nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    s.anotar('{"v":1,"c":[]}')
    const r = buscarRecuperables(dir, null, nadieVive)
    expect(r).toMatchObject([{ id: ID_A, nombre: 'p.kir', ruta: 'C:\\p.kir' }])
    expect(r[0].fecha).toBeGreaterThan(0)
  })

  it('una base recuperada sin guardar se ofrece aunque el diario esté vacío', () => {
    new Sesion(dir, ID_A, 1).nuevaBase(base, { ruta: null, nombre: 'sin título.kir', sucio: true })
    expect(buscarRecuperables(dir, null, nadieVive).map((x) => x.id)).toEqual([ID_A])
  })

  it('sin nada que perder, o incompleta y vieja, se borra sin preguntar', () => {
    new Sesion(dir, ID_A, 1).nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    mkdirSync(join(dir, CARPETA_RECUPERACION, ID_B))
    writeFileSync(join(dir, CARPETA_RECUPERACION, ID_B, 'diario.jsonl'), 'x\n')
    expect(buscarRecuperables(dir, null, nadieVive, Date.now() + DIEZ_MIN)).toEqual([])
    expect(readdirSync(join(dir, CARPETA_RECUPERACION))).toEqual([])
  })

  it('una carpeta sin sesion.json reciente no se borra: puede ser otra ventana que arranca', () => {
    const c = join(dir, CARPETA_RECUPERACION, ID_B)
    mkdirSync(c, { recursive: true })
    writeFileSync(join(c, 'base.kir'), base)
    expect(buscarRecuperables(dir, null, nadieVive)).toEqual([])
    expect(existsSync(c)).toBe(true)
    expect(buscarRecuperables(dir, null, nadieVive, Date.now() + DIEZ_MIN)).toEqual([])
    expect(existsSync(c)).toBe(false)
  })

  it('un error al leer que no es «no existe» nunca borra la sesión', () => {
    // sesion.json ilegible (es una carpeta), dañado, o un diario que no se puede leer.
    const ilegible = join(dir, CARPETA_RECUPERACION, ID_A)
    mkdirSync(join(ilegible, 'sesion.json'), { recursive: true })
    writeFileSync(join(ilegible, 'base.kir'), base)
    const dañada = join(dir, CARPETA_RECUPERACION, ID_B)
    mkdirSync(dañada, { recursive: true })
    writeFileSync(join(dañada, 'sesion.json'), '{"pid": 1, "nom')
    const ID_C = '66666666-7777-8888-9999-00000000000c'
    const s = new Sesion(dir, ID_C, 1)
    s.nuevaBase(base, { ruta: null, nombre: 'c.kir', sucio: false })
    rmSync(join(s.dir, 'diario.jsonl'))
    mkdirSync(join(s.dir, 'diario.jsonl'))
    expect(buscarRecuperables(dir, null, nadieVive, Date.now() + DIEZ_MIN)).toEqual([])
    expect([existsSync(ilegible), existsSync(dañada), existsSync(s.dir)]).toEqual([true, true, true])
  })

  it('nuevaBase escribe sesion.json primero: aunque la base falle, la carpeta ya dice de qué proceso es', () => {
    const s = new Sesion(dir, ID_A, 4242)
    mkdirSync(join(s.dir, 'base.kir'), { recursive: true })
    writeFileSync(join(s.dir, 'base.kir', 'ocupa'), 'x')
    expect(() => s.nuevaBase(base, { ruta: null, nombre: 'a.kir', sucio: true })).toThrow()
    expect(JSON.parse(readFileSync(join(s.dir, 'sesion.json'), 'utf8'))).toMatchObject({ pid: 4242 })
    // Con el proceso vivo nadie la borra; muerto y con la base incompleta, solo cuando es vieja.
    expect(buscarRecuperables(dir, null, (p) => p === 4242, Date.now() + DIEZ_MIN)).toEqual([])
    expect(existsSync(s.dir)).toBe(true)
  })

  it('no toca la propia, ni las de otro Kirchi abierto, ni carpetas ajenas', () => {
    const a = new Sesion(dir, ID_A, 1)
    a.nuevaBase(base, { ruta: null, nombre: 'a.kir', sucio: true })
    const b = new Sesion(dir, ID_B, 2)
    b.nuevaBase(base, { ruta: null, nombre: 'b.kir', sucio: true })
    mkdirSync(join(dir, CARPETA_RECUPERACION, 'ajena'))
    expect(buscarRecuperables(dir, ID_A, (pid) => pid === 2)).toEqual([])
    expect(readdirSync(join(dir, CARPETA_RECUPERACION)).sort()).toEqual([ID_A, ID_B, 'ajena'].sort())
  })

  it('sin carpeta de recuperación no hay nada', () => {
    expect(buscarRecuperables(join(dir, 'nada'), null, nadieVive)).toEqual([])
  })
})

describe('leer y descartar', () => {
  it('devuelve la base, el diario y el archivo; rechaza ids que no son de sesión', () => {
    const s = new Sesion(dir, ID_A, 1)
    s.nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    s.anotar('{"v":1,"c":[]}')
    // El renglón de la generación no llega a la interfaz.
    expect(leerRecuperacion(dir, ID_A)).toEqual({ base, diario: '{"v":1,"c":[]}\n', ruta: 'C:\\p.kir', nombre: 'p.kir' })
    expect(leerRecuperacion(dir, '../../settings')).toBeNull()
    expect(leerRecuperacion(dir, ID_B)).toBeNull()
    descartarRecuperacion(dir, '..')
    expect(existsSync(s.dir)).toBe(true)
    descartarRecuperacion(dir, ID_A)
    expect(existsSync(s.dir)).toBe(false)
  })

  it('un diario de otra generación no se aplica: se recupera solo la base, con aviso', () => {
    const s = new Sesion(dir, ID_A, 1)
    s.nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    s.anotar('{"v":1,"c":[]}')
    // Corte entre sesion.json (generación 2) y el diario nuevo: queda el diario de la generación 1.
    const sesion = JSON.parse(readFileSync(join(s.dir, 'sesion.json'), 'utf8'))
    writeFileSync(join(s.dir, 'sesion.json'), JSON.stringify({ ...sesion, generacion: 2 }))
    const r = leerRecuperacion(dir, ID_A)
    expect(r).toMatchObject({ base, diario: '', ruta: 'C:\\p.kir', nombre: 'p.kir' })
    expect(r?.aviso).toMatch(/copia de seguridad automática/)
    // Sin renglón de generación (dañado) pasa lo mismo.
    writeFileSync(join(s.dir, 'sesion.json'), JSON.stringify(sesion))
    writeFileSync(join(s.dir, 'diario.jsonl'), '{"v":1,"c":[]}\n')
    expect(leerRecuperacion(dir, ID_A)).toMatchObject({ base, diario: '', aviso: expect.any(String) })
  })

  it('una base de otra generación (el corte fue antes de escribirla) se recupera sin archivo: no pisa el archivo nuevo', () => {
    const s = new Sesion(dir, ID_A, 1)
    s.nuevaBase(base, { ruta: 'C:\\a.kir', nombre: 'a.kir', sucio: false })
    s.anotar('{"v":1,"c":[]}')
    // sesion.json ya dice b.kir y su base, pero base.kir sigue siendo la de a.kir.
    const otra = new Uint8Array([9, 9])
    const sesion = JSON.parse(readFileSync(join(s.dir, 'sesion.json'), 'utf8'))
    writeFileSync(join(s.dir, 'sesion.json'), JSON.stringify({ ...sesion, ruta: 'C:\\b.kir', nombre: 'b.kir', generacion: 2, huella: huellaBase(otra) }))
    const r = leerRecuperacion(dir, ID_A)
    expect(r).toMatchObject({ base, diario: '', ruta: null, nombre: 'sin título.kir' })
    expect(r?.aviso).toMatch(/copia de seguridad automática/)
  })

  it('un diario más grande que el tope en disco no impide recuperar la base', () => {
    const s = new Sesion(dir, ID_A, 1)
    s.nuevaBase(base, { ruta: 'C:\\p.kir', nombre: 'p.kir', sucio: false })
    for (let i = 0; i < 10; i++) s.anotar('{"v":1,"c":[]}')
    expect(buscarRecuperables(dir, null, nadieVive).map((r) => r.id)).toEqual([ID_A])
    const r = leerRecuperacion(dir, ID_A, 64)
    expect(r).toMatchObject({ base, diario: '', ruta: 'C:\\p.kir', nombre: 'p.kir' })
    expect(r?.aviso).toMatch(/copia de seguridad automática/)
  })

  it('anotar más allá del tope en disco se rechaza con un error propio', () => {
    const s = new Sesion(dir, ID_A, 1, 40)
    s.nuevaBase(base, { ruta: null, nombre: 'a.kir', sucio: false })
    s.anotar('{"v":1,"c":[1]}')
    expect(() => s.anotar('{"v":1,"c":[2]}')).toThrow(DiarioLleno)
    expect(readFileSync(join(s.dir, 'diario.jsonl'), 'utf8')).toBe('{"generacion":1}\n{"v":1,"c":[1]}\n')
  })

  it('pidVivo: este proceso vive', () => {
    expect(pidVivo(process.pid)).toBe(true)
  })
})
