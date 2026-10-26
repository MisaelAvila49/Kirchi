import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LIMITE_KIR } from '../compartido/archivos'
import { MAX_POR_CATEGORIA } from '../compartido/plantillas'
import { Sesion } from './recuperacion'
import { ServicioArchivos } from './servicioArchivos'

let dir = ''
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'kirchi-plantillas-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function servicio(sinCarpeta = false) {
  const carpetas: string[] = []
  const raiz = join(dir, 'Documentos', 'Kirchi', 'Plantillas')
  const s = new ServicioArchivos({
    dirDatos: join(dir, 'datos'),
    dialogos: { abrir: async () => null, guardar: async () => null, confirmarReemplazo: async () => false, confirmarRed: async () => false },
    recientes: () => [],
    ponerRecientes: () => {},
    abrirCarpeta: async (c) => carpetas.push(c),
    argv: ['kirchi.exe'],
    sesion: new Sesion(join(dir, 'datos'), '11111111-2222-3333-4444-555555555555', 1),
    plataforma: 'win32',
    plantillas: sinCarpeta ? undefined : raiz
  })
  return { s, raiz, carpetas }
}
const bytes = (n: number) => new Uint8Array([80, 75, 3, 4, n])

describe('plantillas: la carpeta', () => {
  it('se crea al primer uso y empieza vacía', () => {
    const { s, raiz } = servicio()
    expect(existsSync(raiz)).toBe(false)
    expect(s.listarPlantillas()).toEqual({ categorias: [], omitidas: 0 })
    expect(existsSync(raiz)).toBe(true)
  })

  it('sin carpeta conocida (el sistema no da Documentos) la lista sale vacía y guardar dice por qué', () => {
    const { s } = servicio(true)
    expect(s.listarPlantillas()).toEqual({ categorias: [], omitidas: 0 })
    expect(s.guardarPlantilla('Filtros', 'RC', bytes(1), false)).toMatchObject({ ok: false })
  })
})

describe('plantillas: guardar y leer', () => {
  it('ida y vuelta: lo guardado se lista por categoría y se lee igual', () => {
    const { s, raiz } = servicio()
    expect(s.guardarPlantilla('Filtros', 'Paso bajas', bytes(7), false)).toEqual({ ok: true })
    expect(s.guardarPlantilla('Filtros', 'Paso altas', bytes(8), false)).toEqual({ ok: true })
    expect(s.guardarPlantilla('Fuentes', 'Divisor', bytes(9), false)).toEqual({ ok: true })
    expect(existsSync(join(raiz, 'Filtros', 'Paso bajas.kir'))).toBe(true)
    const l = s.listarPlantillas()
    expect(l.categorias.map((c) => [c.nombre, c.plantillas.map((p) => p.nombre)])).toEqual([
      ['Filtros', ['Paso altas', 'Paso bajas']],
      ['Fuentes', ['Divisor']]
    ])
    expect(l.categorias[0].plantillas[0]).toEqual({ categoria: 'Filtros', nombre: 'Paso altas', bytes: 5 })
    const r = s.leerPlantilla('Filtros', 'Paso bajas')
    expect(r.ok && [...r.bytes]).toEqual([...bytes(7)])
  })

  it('no deja temporales y la escritura es atómica (sin .tmp en la carpeta)', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    expect(readdirSync(join(raiz, 'A'))).toEqual(['x.kir'])
  })

  it('un nombre repetido pide confirmación y con reemplazar sobrescribe', () => {
    const { s } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    expect(s.guardarPlantilla('A', 'x', bytes(2), false)).toMatchObject({ ok: false, existe: true })
    const r1 = s.leerPlantilla('A', 'x')
    expect(r1.ok && r1.bytes[4]).toBe(1)
    expect(s.guardarPlantilla('A', 'x', bytes(2), true)).toEqual({ ok: true })
    const r2 = s.leerPlantilla('A', 'x')
    expect(r2.ok && r2.bytes[4]).toBe(2)
  })

  it('rechaza bytes vacíos, que no son bytes o pasan el tope de un .kir', () => {
    const { s } = servicio()
    expect(s.guardarPlantilla('A', 'x', new Uint8Array(0), false)).toMatchObject({ ok: false })
    expect(s.guardarPlantilla('A', 'x', 'texto', false)).toMatchObject({ ok: false })
    expect(s.guardarPlantilla('A', 'x', { length: 5 }, false)).toMatchObject({ ok: false })
    expect(s.guardarPlantilla('A', 'x', new Uint8Array(LIMITE_KIR + 1), false)).toMatchObject({ ok: false })
  })

  it('lee con el tope de un .kir y no lee lo que no es archivo regular', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    mkdirSync(join(raiz, 'A', 'carpeta.kir'), { recursive: true })
    expect(s.leerPlantilla('A', 'carpeta')).toMatchObject({ ok: false })
    expect(s.leerPlantilla('A', 'no-existe')).toMatchObject({ ok: false })
  })
})

describe('plantillas: nombres hostiles', () => {
  const malos: [unknown, unknown][] = [
    ['..', 'x'],
    ['A', '..'],
    ['../fuera', 'x'],
    ['A', '../../fuera'],
    ['A/B', 'x'],
    ['A', 'a/b'],
    ['A', 'a\\b'],
    ['C:\\', 'x'],
    ['A', 'C:\\Windows\\x'],
    ['A', 'CON'],
    ['NUL', 'x'],
    ['A', 'x'.repeat(200)],
    ['A', ''],
    ['', 'x'],
    ['A', null],
    [{}, 'x'],
    ['Incluidas', 'x']
  ]
  it.each(malos)('guardar(%j, %j) se rechaza sin escribir nada fuera', (cat, nom) => {
    const { s } = servicio()
    expect(s.guardarPlantilla(cat, nom, bytes(1), false)).toMatchObject({ ok: false })
    expect(s.leerPlantilla(cat, nom).ok).toBe(false)
    expect(s.borrarPlantilla(cat, nom)).toMatchObject({ ok: false })
    expect(s.renombrarPlantilla(cat, nom, 'y')).toMatchObject({ ok: false })
    expect(s.moverPlantilla(cat, nom, 'B')).toMatchObject({ ok: false })
    // Nada apareció junto a la carpeta de plantillas ni arriba.
    expect(existsSync(join(dir, 'Documentos', 'fuera.kir'))).toBe(false)
    expect(existsSync(join(dir, 'fuera.kir'))).toBe(false)
  })

  it('renombrar o mover hacia un nombre o categoría hostiles se rechaza y deja el archivo', () => {
    const { s } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    for (const nuevo of ['..', '../y', 'CON', '', 'a/b']) expect(s.renombrarPlantilla('A', 'x', nuevo)).toMatchObject({ ok: false })
    for (const cat of ['..', '../B', 'NUL', '', 'Incluidas']) expect(s.moverPlantilla('A', 'x', cat)).toMatchObject({ ok: false })
    expect(s.leerPlantilla('A', 'x').ok).toBe(true)
  })
})

describe('plantillas: administrar', () => {
  it('renombra, y no pisa otra del mismo nombre', () => {
    const { s } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    s.guardarPlantilla('A', 'y', bytes(2), false)
    expect(s.renombrarPlantilla('A', 'x', 'z')).toEqual({ ok: true })
    expect(s.leerPlantilla('A', 'x').ok).toBe(false)
    expect(s.leerPlantilla('A', 'z').ok).toBe(true)
    expect(s.renombrarPlantilla('A', 'z', 'y')).toMatchObject({ ok: false, existe: true })
    expect(s.leerPlantilla('A', 'z').ok).toBe(true)
    expect(s.renombrarPlantilla('A', 'no-hay', 'w')).toMatchObject({ ok: false })
  })

  it('mueve de categoría (crea la nueva) y no pisa', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    expect(s.moverPlantilla('A', 'x', 'B')).toEqual({ ok: true })
    expect(existsSync(join(raiz, 'B', 'x.kir'))).toBe(true)
    expect(existsSync(join(raiz, 'A', 'x.kir'))).toBe(false)
    s.guardarPlantilla('A', 'x', bytes(2), false)
    expect(s.moverPlantilla('A', 'x', 'B')).toMatchObject({ ok: false, existe: true })
    expect(s.leerPlantilla('A', 'x').ok).toBe(true)
  })

  it('borra una plantilla y solo esa', () => {
    const { s } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    s.guardarPlantilla('A', 'y', bytes(2), false)
    expect(s.borrarPlantilla('A', 'x')).toEqual({ ok: true })
    expect(s.leerPlantilla('A', 'y').ok).toBe(true)
    expect(s.borrarPlantilla('A', 'x')).toMatchObject({ ok: false })
  })

  it('mostrar abre la carpeta de la categoría (o la raíz) sin recibir rutas', async () => {
    const { s, raiz, carpetas } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    await s.mostrarPlantillas('A')
    await s.mostrarPlantillas()
    await s.mostrarPlantillas('../..')
    expect(carpetas).toEqual([join(raiz, 'A'), raiz, raiz])
  })
})

describe('plantillas: carpeta modificada por fuera', () => {
  it('la lista ignora lo que no es un .kir normal y cuenta lo omitido', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    mkdirSync(join(raiz, 'A'))
    writeFileSync(join(raiz, 'A', 'bien.kir'), bytes(1))
    writeFileSync(join(raiz, 'A', 'nota.txt'), 'hola')
    writeFileSync(join(raiz, 'A', 'CON.kir'), bytes(1))
    writeFileSync(join(raiz, 'suelto.kir'), bytes(1))
    mkdirSync(join(raiz, 'A', 'carpeta.kir'))
    const l = s.listarPlantillas()
    expect(l.categorias).toHaveLength(1)
    expect(l.categorias[0].plantillas.map((p) => p.nombre)).toEqual(['bien'])
    expect(l.omitidas).toBeGreaterThan(0)
  })

  it('un enlace simbólico no se sigue (ni como categoría ni como plantilla)', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    const fuera = join(dir, 'ajena')
    mkdirSync(fuera)
    writeFileSync(join(fuera, 'secreto.kir'), bytes(9))
    try {
      symlinkSync(fuera, join(raiz, 'enlace'), 'junction')
      symlinkSync(join(fuera, 'secreto.kir'), join(raiz, 'enlace2.kir'), 'file')
    } catch {
      return // sin permiso para crear enlaces en esta máquina
    }
    mkdirSync(join(raiz, 'A'))
    try {
      symlinkSync(join(fuera, 'secreto.kir'), join(raiz, 'A', 'sec.kir'), 'file')
    } catch {
      /* sigue */
    }
    const l = s.listarPlantillas()
    expect(l.categorias.map((c) => c.nombre)).not.toContain('enlace')
    expect(l.categorias.flatMap((c) => c.plantillas)).toEqual([])
    expect(s.leerPlantilla('enlace', 'secreto').ok).toBe(false)
  })

  it('pone tope a las categorías y a las plantillas por categoría', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    mkdirSync(join(raiz, 'A'))
    for (let i = 0; i < MAX_POR_CATEGORIA + 3; i++) writeFileSync(join(raiz, 'A', `p${String(i).padStart(4, '0')}.kir`), bytes(1))
    const l = s.listarPlantillas()
    expect(l.categorias[0].plantillas).toHaveLength(MAX_POR_CATEGORIA)
    expect(l.omitidas).toBe(3)
  })

  it('el archivo que no cambió sigue ahí tras listar (listar no escribe)', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('A', 'x', bytes(3), false)
    s.listarPlantillas()
    expect([...readFileSync(join(raiz, 'A', 'x.kir'))]).toEqual([...bytes(3)])
  })

  describe('enlaces y uniones', () => {
    function conUnion() {
      const { s, raiz, carpetas } = servicio()
      s.listarPlantillas()
      const fuera = join(dir, 'fuera')
      mkdirSync(fuera)
      writeFileSync(join(fuera, 'secreto.kir'), bytes(9))
      symlinkSync(fuera, join(raiz, 'U'), 'junction')
      return { s, raiz, fuera, carpetas }
    }
    it('guardar, mover, borrar y mostrar no actúan a través de una unión', async () => {
      const { s, raiz, fuera, carpetas } = conUnion()
      expect(s.guardarPlantilla('U', 'nueva', bytes(1), false).ok).toBe(false)
      expect(existsSync(join(fuera, 'nueva.kir'))).toBe(false)
      expect(s.borrarPlantilla('U', 'secreto').ok).toBe(false)
      expect(existsSync(join(fuera, 'secreto.kir'))).toBe(true)
      expect(s.renombrarPlantilla('U', 'secreto', 'otro').ok).toBe(false)
      expect(existsSync(join(fuera, 'secreto.kir'))).toBe(true)
      s.guardarPlantilla('A', 'x', bytes(2), false)
      expect(s.moverPlantilla('A', 'x', 'U').ok).toBe(false)
      expect(existsSync(join(fuera, 'x.kir'))).toBe(false)
      expect(s.leerPlantilla('U', 'secreto').ok).toBe(false)
      await s.mostrarPlantillas('U')
      expect(carpetas).toEqual([raiz])
    })
    it('una raíz que es una unión no se usa', () => {
      const { s, raiz } = servicio()
      const real = join(dir, 'real')
      mkdirSync(real)
      mkdirSync(join(dir, 'Documentos', 'Kirchi'), { recursive: true })
      symlinkSync(real, raiz, 'junction')
      expect(s.guardarPlantilla('A', 'x', bytes(1), false).ok).toBe(false)
      expect(existsSync(join(real, 'A'))).toBe(false)
    })
  })

  it('un cambio solo de mayúsculas renombra el mismo archivo', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('A', 'Filtro', bytes(4), false)
    expect(s.renombrarPlantilla('A', 'Filtro', 'filtro')).toEqual({ ok: true })
    expect(readdirSync(join(raiz, 'A'))).toEqual(['filtro.kir'])
  })

  it('guardar sin reemplazar no pisa un archivo que apareció a medias (paso final exclusivo)', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('A', 'x', bytes(1), false)
    // Simula la carrera: la comprobación previa no lo ve, el paso final sí.
    expect(s.guardarPlantilla('A', 'x', bytes(2), false)).toMatchObject({ ok: false, existe: true })
    expect([...readFileSync(join(raiz, 'A', 'x.kir'))]).toEqual([...bytes(1)])
    expect(readdirSync(join(raiz, 'A'))).toEqual(['x.kir'])
  })
})

describe('plantillas: borrar categorías propias', () => {
  it('una categoría vacía se borra sin pedir nada', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('Vacía', 'x', bytes(1), false)
    s.borrarPlantilla('Vacía', 'x')
    expect(existsSync(join(raiz, 'Vacía'))).toBe(true)
    expect(s.borrarCategoria('Vacía', false)).toEqual({ ok: true, borradas: 0 })
    expect(existsSync(join(raiz, 'Vacía'))).toBe(false)
  })

  it('con plantillas dentro no borra hasta que se confirma, y dice cuántas se van', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('Filtros', 'a', bytes(1), false)
    s.guardarPlantilla('Filtros', 'b', bytes(2), false)
    s.guardarPlantilla('Otra', 'c', bytes(3), false)
    expect(s.borrarCategoria('Filtros', false)).toEqual({ ok: false, error: 'La categoría tiene 2 plantillas: falta confirmar el borrado.', noVacia: 2 })
    expect(s.borrarCategoria('Filtros', undefined)).toMatchObject({ ok: false, noVacia: 2 })
    expect(s.borrarCategoria('Filtros', 'sí')).toMatchObject({ ok: false, noVacia: 2 })
    expect(existsSync(join(raiz, 'Filtros', 'a.kir'))).toBe(true)
    expect(s.borrarCategoria('Filtros', true)).toEqual({ ok: true, borradas: 2 })
    expect(existsSync(join(raiz, 'Filtros'))).toBe(false)
    // Solo esa categoría: las demás siguen.
    expect(s.leerPlantilla('Otra', 'c').ok).toBe(true)
  })

  it('una sola plantilla se nombra en singular', () => {
    const { s } = servicio()
    s.guardarPlantilla('Una', 'a', bytes(1), false)
    expect(s.borrarCategoria('Una', false)).toMatchObject({ ok: false, noVacia: 1, error: 'La categoría tiene 1 plantilla: falta confirmar el borrado.' })
  })

  it('una categoría que no existe se dice y no inventa nada', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    expect(s.borrarCategoria('Nada', true)).toEqual({ ok: false, error: 'No se encontró la categoría.' })
    expect(existsSync(join(raiz, 'Nada'))).toBe(false)
  })

  it('las categorías de Kirchi, los nombres hostiles y los que no son texto se rechazan', () => {
    const { s, raiz } = servicio()
    mkdirSync(join(raiz, 'Intocable'), { recursive: true })
    for (const c of ['Incluidas', 'incluidas', '..', '../..', 'a/b', 'a\b', 'con', '', ' x', 'x.', 7, null, undefined, {}]) {
      expect(s.borrarCategoria(c, true), String(c)).toMatchObject({ ok: false })
    }
    expect(existsSync(join(raiz, 'Intocable'))).toBe(true)
    expect(existsSync(raiz)).toBe(true)
  })

  it('una carpeta con archivos que no son plantillas no se borra (nunca borra lo que no es suyo)', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('Mezcla', 'a', bytes(1), false)
    writeFileSync(join(raiz, 'Mezcla', 'notas.txt'), 'mío')
    const r = s.borrarCategoria('Mezcla', true)
    expect(r).toMatchObject({ ok: false })
    expect(r.ok ? '' : r.error).toMatch(/no son plantillas/)
    expect(readFileSync(join(raiz, 'Mezcla', 'notas.txt'), 'utf8')).toBe('mío')
    expect(existsSync(join(raiz, 'Mezcla', 'a.kir'))).toBe(true)
    // Una subcarpeta tampoco se borra.
    mkdirSync(join(raiz, 'ConHijas', 'hija'), { recursive: true })
    expect(s.borrarCategoria('ConHijas', true)).toMatchObject({ ok: false })
    expect(existsSync(join(raiz, 'ConHijas', 'hija'))).toBe(true)
  })

  it('desktop.ini y Thumbs.db (que el explorador deja solos) no frenan el borrado y se van con la carpeta', () => {
    const { s, raiz } = servicio()
    s.guardarPlantilla('Vacía', 'x', bytes(1), false)
    s.borrarPlantilla('Vacía', 'x')
    writeFileSync(join(raiz, 'Vacía', 'desktop.ini'), '[.ShellClassInfo]')
    writeFileSync(join(raiz, 'Vacía', 'Thumbs.db'), 'x')
    expect(s.borrarCategoria('Vacía', false)).toEqual({ ok: true, borradas: 0 })
    expect(existsSync(join(raiz, 'Vacía'))).toBe(false)
    // Con plantillas también: se cuentan solo las plantillas y los archivos del sistema se van con ellas.
    s.guardarPlantilla('Mixta', 'a', bytes(1), false)
    writeFileSync(join(raiz, 'Mixta', 'DESKTOP.INI'), 'x')
    expect(s.borrarCategoria('Mixta', false)).toMatchObject({ ok: false, noVacia: 1 })
    expect(s.borrarCategoria('Mixta', true)).toEqual({ ok: true, borradas: 1 })
    expect(existsSync(join(raiz, 'Mixta'))).toBe(false)
  })

  it('un archivo suelto con el nombre de la categoría no se toma por carpeta', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    writeFileSync(join(raiz, 'Suelto'), 'x')
    expect(s.borrarCategoria('Suelto', true)).toMatchObject({ ok: false })
    expect(existsSync(join(raiz, 'Suelto'))).toBe(true)
  })

  it('sin carpeta de plantillas conocida lo dice', () => {
    const { s } = servicio(true)
    expect(s.borrarCategoria('A', true)).toMatchObject({ ok: false })
  })

  it('un enlace simbólico o una unión no se sigue: no borra lo de fuera ni el enlace', () => {
    const { s, raiz } = servicio()
    s.listarPlantillas()
    const fuera = join(dir, 'fuera')
    mkdirSync(fuera)
    writeFileSync(join(fuera, 'secreto.kir'), bytes(9))
    try {
      symlinkSync(fuera, join(raiz, 'U'), 'junction')
    } catch {
      return // sin permiso para crear enlaces en esta máquina
    }
    expect(s.borrarCategoria('U', true).ok).toBe(false)
    expect(existsSync(join(fuera, 'secreto.kir'))).toBe(true)
    expect(existsSync(join(raiz, 'U'))).toBe(true)
  })

  it('un enlace a un archivo dentro de la categoría cuenta como algo que no es plantilla y frena el borrado', () => {
    const { s, raiz } = servicio()
    const fuera = join(dir, 'fuera2')
    mkdirSync(fuera)
    writeFileSync(join(fuera, 'secreto.kir'), bytes(9))
    s.guardarPlantilla('A', 'x', bytes(1), false)
    try {
      symlinkSync(join(fuera, 'secreto.kir'), join(raiz, 'A', 'sec.kir'), 'file')
    } catch {
      return
    }
    expect(s.borrarCategoria('A', true)).toMatchObject({ ok: false })
    expect(existsSync(join(fuera, 'secreto.kir'))).toBe(true)
  })

  it('la lista se actualiza: la categoría borrada ya no sale', () => {
    const { s } = servicio()
    s.guardarPlantilla('Adiós', 'a', bytes(1), false)
    s.guardarPlantilla('Queda', 'b', bytes(2), false)
    s.borrarCategoria('Adiós', true)
    expect(s.listarPlantillas().categorias.map((c) => c.nombre)).toEqual(['Queda'])
  })
})
