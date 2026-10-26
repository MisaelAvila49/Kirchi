import { describe, expect, it } from 'vitest'
import { borrar, crear, modificar } from '../doc/comandos'
import { Historial } from '../doc/historial'
import { documentoVacio, type Documento, type Pieza } from '../doc/tipos'
import { divisor } from '../prueba/circuitos'
import { Diario, recuperar, type DestinoDiario, type Reloj } from './diario'
import { escribirKir, serializarDocumento } from './kir'

const pieza = (id: string, x = 0): Pieza => ({ id, tipo: 'resistencia', ref: `R${id}`, x, y: 0, rot: 0, espejo: false, props: {} })

/** Reloj de pruebas: los temporizadores corren solo al llamar a `correr`. */
function relojFalso() {
  let n = 0
  const vivos = new Map<number, () => void>()
  const reloj: Reloj = {
    poner: (f) => {
      vivos.set(++n, f)
      return n
    },
    quitar: (t) => vivos.delete(t as number)
  }
  const correr = () => {
    const fs = [...vivos.values()]
    vivos.clear()
    for (const f of fs) f()
  }
  return { reloj, correr, pendientes: () => vivos.size }
}

function armar(doc: Documento = documentoVacio(), o: { ocupado?: () => boolean; limite?: number } = {}) {
  const h = new Historial(doc)
  const renglones: string[] = []
  const bases: Documento[] = []
  const destino: DestinoDiario = { anotar: (r) => renglones.push(r), nuevaBase: (d) => bases.push(d) }
  const r = relojFalso()
  const d = new Diario(destino, () => h.doc, o.ocupado, r.reloj, 1000, o.limite)
  h.suscribir(d.alCambiar)
  return { h, d, renglones, bases, ...r }
}

describe('Diario', () => {
  it('junta los cambios de un intervalo en un renglón con el estado final de cada elemento', () => {
    const { h, renglones, correr } = armar()
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    h.ejecutar(modificar('mover', 'piezas', pieza('a'), pieza('a', 2)))
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    h.ejecutar(borrar('borrar', 'piezas', pieza('b')))
    expect(renglones).toEqual([])
    correr()
    expect(renglones.map((r) => JSON.parse(r))).toEqual([{ v: 1, c: [['piezas', 'a', pieza('a', 2)], ['piezas', 'b', null]] }])
  })

  it('deshacer anota el estado al que se vuelve; reemplazar no anota nada', () => {
    const { h, renglones, correr } = armar()
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    correr()
    h.deshacer()
    h.reemplazar(divisor())
    correr()
    expect(renglones.map((r) => JSON.parse(r).c)).toEqual([[['piezas', 'a', pieza('a')]], [['piezas', 'a', null]]])
  })

  it('espera mientras hay un gesto en curso; vaciar escribe aunque lo haya', () => {
    let ocupado = true
    const { h, d, renglones, correr, pendientes } = armar(documentoVacio(), { ocupado: () => ocupado })
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    correr()
    expect(renglones).toEqual([])
    expect(pendientes()).toBe(1)
    d.vaciar()
    expect(renglones).toHaveLength(1)
    expect(pendientes()).toBe(0)
    ocupado = false
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    correr()
    expect(renglones).toHaveLength(2)
  })

  it('reiniciar descarta lo pendiente (ya está en la base nueva)', () => {
    const { h, d, renglones, correr } = armar()
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    d.reiniciar()
    correr()
    expect(renglones).toEqual([])
    expect(d.hayPendientes).toBe(false)
  })

  it('guardado vuelve a contar desde cero y conserva lo pendiente', () => {
    const { h, d, renglones, bases, correr } = armar(documentoVacio(), { limite: 10 })
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    correr()
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    d.guardado()
    correr()
    expect(renglones).toHaveLength(2)
    expect(bases).toHaveLength(0)
  })

  it('pasado el límite rehace la base con el documento entero en lugar de anotar', () => {
    const { h, renglones, bases, correr } = armar(documentoVacio(), { limite: 10 })
    h.ejecutar(crear('crear', 'piezas', pieza('a')))
    correr()
    h.ejecutar(crear('crear', 'piezas', pieza('b')))
    correr()
    expect(renglones).toHaveLength(1)
    expect(bases).toHaveLength(1)
    expect(Object.keys(bases[0].piezas)).toEqual(['a', 'b'])
    h.ejecutar(crear('crear', 'piezas', pieza('c')))
    correr()
    expect(renglones).toHaveLength(2)
  })
})

describe('recuperar', () => {
  /** Secuencias al azar de hacer, deshacer y rehacer con escrituras del diario intercaladas. */
  it('la base más el diario dan el documento final, con cualquier secuencia', () => {
    for (let semilla = 1; semilla <= 30; semilla++) {
      let s = semilla
      const azar = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
      const base = divisor()
      const { h, renglones, correr } = armar(base)
      for (let i = 0; i < 60; i++) {
        const r = azar()
        const ids = Object.keys(h.doc.piezas)
        if (r < 0.2) h.ejecutar(crear('crear', 'piezas', pieza(`n${i}`, i)))
        else if (r < 0.27) h.ejecutar(crear('crear', 'cables', { id: `c${i}`, puntos: [{ x: i, y: 0 }, { x: i, y: 4 }] }))
        else if (r < 0.32) h.ejecutar(crear('crear', 'etiquetas', { id: `e${i}`, nombre: `RED${i}`, x: i, y: 2, rot: 90, formato: { negrita: true } }))
        else if (r < 0.37) h.ejecutar(crear('crear', 'notas', { id: `t${i}`, x: i, y: 6, ancho: 24, texto: `Nota ${i} con Ω y ñ`, formato: { cursiva: true, alinear: 'centro' } }))
        else if (r < 0.55 && ids.length) {
          const p = h.doc.piezas[ids[Math.floor(azar() * ids.length)]]
          h.ejecutar(modificar('mover', 'piezas', p, { ...p, x: p.x + 2 }, azar() < 0.5 ? 'arrastre' : undefined))
        } else if (r < 0.65 && ids.length) h.ejecutar(borrar('borrar', 'piezas', h.doc.piezas[ids[0]]))
        else if (r < 0.8) h.deshacer()
        else if (r < 0.9) h.rehacer()
        else correr()
      }
      correr()
      const rec = recuperar(escribirKir(base, '0.0.1'), renglones.join('\n') + '\n')
      expect(rec.ok).toBe(true)
      if (rec.ok) {
        expect(serializarDocumento(rec.doc)).toBe(serializarDocumento(h.doc))
        expect(rec.avisos).toEqual([])
      }
    }
  })

  it('el voltaje de un riel cambiado se anota y se recupera, y volver al de omisión lo quita', () => {
    const { h, renglones, correr } = armar()
    const vcc = { id: 'a_1', nombre: 'VCC', voltaje: '15' }
    h.ejecutar(crear('riel', 'alimentaciones', vcc))
    correr()
    const base = escribirKir(documentoVacio(), '0.0.1')
    const r = recuperar(base, renglones.join('\n') + '\n')
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.alimentaciones).toEqual({ a_1: vcc })
    h.ejecutar(borrar('riel', 'alimentaciones', vcc))
    correr()
    const r2 = recuperar(base, renglones.join('\n') + '\n')
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.doc.alimentaciones ?? {}).toEqual({})
  })

  it('una figura dibujada se anota y se recupera, y borrarla la quita', () => {
    const { h, renglones, correr } = armar()
    const f = { id: 'f_1', tipo: 'elipse' as const, x1: 0, y1: 0, x2: 12, y2: 8, orden: 0, trazo: 'puntos' as const }
    h.ejecutar(crear('figura', 'figuras', f))
    correr()
    const base = escribirKir(documentoVacio(), '0.0.1')
    const r = recuperar(base, renglones.join('\n') + '\n')
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.figuras).toEqual({ f_1: f })
    h.ejecutar(borrar('figura', 'figuras', f))
    correr()
    const r2 = recuperar(base, renglones.join('\n') + '\n')
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.doc.figuras ?? {}).toEqual({})
  })

  it('una sonda puesta se anota y se recupera, y quitarla la quita', () => {
    const { h, renglones, correr } = armar()
    const s = { id: 's_1', tipo: 'voltaje' as const, x: 4, y: 0 }
    h.ejecutar(crear('sonda', 'sondas', s))
    correr()
    const base = escribirKir(documentoVacio(), '0.0.1')
    const r = recuperar(base, renglones.join('\n') + '\n')
    if (!r.ok) throw new Error(r.error)
    expect(r.doc.sondas).toEqual({ s_1: s })
    h.ejecutar(borrar('sonda', 'sondas', s))
    correr()
    const r2 = recuperar(base, renglones.join('\n') + '\n')
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.doc.sondas ?? {}).toEqual({})
  })

  it('un último renglón a medias se pierde solo y lo dice', () => {
    const base = escribirKir(documentoVacio(), '0.0.1')
    const bueno = JSON.stringify({ v: 1, c: [['piezas', 'a', pieza('a')]] })
    const r = recuperar(base, `${bueno}\n{"v":1,"c":[["piezas","b",{"id":`)
    expect(r.ok && Object.keys(r.doc.piezas)).toEqual(['a'])
    expect(r.ok && r.avisos).toEqual(['Se perdió el último segundo de cambios: Kirchi se cerró mientras lo guardaba.'])
    expect(r.ok && r.renglones).toBe(1)
  })

  it('un renglón dañado a la mitad detiene la reconstrucción ahí', () => {
    const base = escribirKir(documentoVacio(), '0.0.1')
    const a = JSON.stringify({ v: 1, c: [['piezas', 'a', pieza('a')]] })
    const c = JSON.stringify({ v: 1, c: [['piezas', 'c', pieza('c')]] })
    const r = recuperar(base, `${a}\nbasura\n${c}\n`)
    expect(r.ok && Object.keys(r.doc.piezas)).toEqual(['a'])
    expect(r.ok && r.avisos).toEqual(['Se recuperó hasta el cambio 1: el resto de la copia de seguridad automática está dañado.'])
  })

  it('valida lo reconstruido como un archivo: elementos malos no pasan', () => {
    const base = escribirKir(documentoVacio(), '0.0.1')
    const r = recuperar(base, JSON.stringify({ v: 1, c: [['piezas', 'm', { ...pieza('m'), x: 0.5 }], ['piezas', 'a', pieza('a')]] }))
    expect(r.ok && Object.keys(r.doc.piezas)).toEqual(['a'])
    expect(r.ok && r.avisos).toEqual(['Se descartó la pieza Rm: posición no entera.'])
  })

  it.each([
    ['una colección ajena', ['otra', 'x', {}]],
    ['un id que no es texto', ['piezas', 7, {}]],
    ['un id __proto__', ['piezas', '__proto__', {}]]
  ])('un renglón con %s se trata como dañado: la reconstrucción se detiene ahí', (_n, entrada) => {
    const base = escribirKir(documentoVacio(), '0.0.1')
    const a = JSON.stringify({ v: 1, c: [['piezas', 'a', pieza('a')]] })
    const malo = JSON.stringify({ v: 1, c: [['piezas', 'b', pieza('b')], entrada] })
    const c = JSON.stringify({ v: 1, c: [['piezas', 'c', pieza('c')]] })
    const r = recuperar(base, `${a}\n${malo}\n${c}\n`)
    expect(r.ok && Object.keys(r.doc.piezas)).toEqual(['a'])
    expect(r.ok && r.avisos).toEqual(['Se recuperó hasta el cambio 1: el resto de la copia de seguridad automática está dañado.'])
    expect(r.ok && r.renglones).toBe(1)
  })

  it('los avisos al usuario hablan de la copia de seguridad automática y no del diario', () => {
    const base = escribirKir(documentoVacio(), '0.0.1')
    const r = recuperar(base, `${JSON.stringify({ v: 1, c: [] })}\nbasura\nmás\n`)
    expect(r.ok && r.avisos.join(' ')).toMatch(/copia de seguridad automática/)
    expect(r.ok && r.avisos.join(' ')).not.toMatch(/diario/i)
  })

  it('leer un diario largo es lineal: 20,000 renglones tardan menos de un segundo', () => {
    const base = escribirKir(documentoVacio(), '0.0.1')
    const renglones: string[] = []
    for (let i = 0; i < 20000; i++) renglones.push(JSON.stringify({ v: 1, c: [['piezas', `p${i % 50}`, pieza(`p${i % 50}`, i % 100)]] }))
    const t0 = performance.now()
    const r = recuperar(base, renglones.join('\n') + '\n')
    const ms = performance.now() - t0
    console.log(`recuperar 20,000 renglones: ${ms.toFixed(0)} ms`)
    expect(r.ok && r.renglones).toBe(20000)
    expect(ms).toBeLessThan(1000)
  })

  it('una base que no es un .kir da el error de lectura', () => {
    expect(recuperar(new Uint8Array([1, 2]), '')).toEqual({ ok: false, error: 'El archivo no es un circuito de Kirchi: no se pudo descomprimir.' })
  })
})
