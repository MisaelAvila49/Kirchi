// @vitest-environment happy-dom
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { leerKir } from '../archivo/kir'
import { calcularConexiones, clavePin } from '../conexiones/conexiones'
import { idSecuencial } from '../doc/ids'
import { violaciones } from '../editor/conflictos'
import { compilarNetlist } from '../netlist/netlist'
import { problemasDeRedes } from '../prueba/ayudaImportar'
import { libreriaDePrueba } from '../prueba/libreria'
import type { CircuitoAjeno } from './ajeno'
import { convertir } from './convertir'
import { decodificarTexto } from './detectar'
import type { Documento } from '../doc/tipos'
import { leerValor } from '../valores/valores'
import { armarDocumento, importarBytes, type ResultadoImportar } from './importar'
import { leerKicad } from './lectores/kicad'
import { leerLtspice } from './lectores/ltspice'
import { leerProteus } from './lectores/proteus/proteus'

// Recorre los ejemplos reales de LTspice, KiCad y Proteus por el convertidor común (se omite si la carpeta no existe).
const lib = libreriaDePrueba().piezas
// Espera KIRCHI_LOTE_IMPORTAR con lote/{ltspice,kicad,proteus} y, aparte, proteus/ con el proyecto del usuario (o su ruta en
// KIRCHI_PROTEUS_USUARIO); KIRCHI_CIRCUITO_A_MANO apunta a un .kir armado a mano para comparar. Sin la variable se omite todo.
const MANUALES = process.env.KIRCHI_LOTE_IMPORTAR ?? ''
const LOTE = MANUALES ? join(MANUALES, 'lote') : ''

function archivos(dir: string, ext: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n)
    return statSync(r).isDirectory() ? archivos(r, ext) : r.toLowerCase().endsWith(ext) ? [r] : []
  })
}

/** KiCad no tiene disco en `importarBytes`: las hojas hijas se arman aquí con los archivos de la misma carpeta. */
function leerKicadConHojas(ruta: string): CircuitoAjeno {
  const carpeta = join(ruta, '..')
  const hojas: Record<string, string> = {}
  for (const f of archivos(carpeta, '.kicad_sch')) hojas[f.slice(carpeta.length + 1).replaceAll('\\', '/')] = readFileSync(f, 'utf8')
  return leerKicad(readFileSync(ruta, 'utf8'), ruta, hojas)
}

const leerAjeno = (formato: string, ruta: string): CircuitoAjeno =>
  formato === 'kicad' ? leerKicadConHojas(ruta) : formato === 'ltspice' ? leerLtspice(decodificarTexto(readFileSync(ruta)), ruta) : leerProteus(readFileSync(ruta), ruta)

function importarArchivo(formato: string, ruta: string): { r: ResultadoImportar; ajeno?: CircuitoAjeno } {
  if (formato === 'kicad') {
    const ajeno = leerKicadConHojas(ruta)
    if (ajeno.piezas.length === 0) return { r: { ok: false, motivo: 'sin piezas' } }
    const gen = idSecuencial()
    return { r: armarDocumento(convertir(ajeno, lib, gen), lib, gen), ajeno }
  }
  return { r: importarBytes(ruta, readFileSync(ruta), lib, idSecuencial()) }
}

const FORMATOS = [
  { formato: 'ltspice', ext: '.asc', carpetas: [join(LOTE, 'ltspice')] },
  { formato: 'kicad', ext: '.kicad_sch', carpetas: [join(LOTE, 'kicad')] },
  { formato: 'proteus', ext: '.pdsprj', carpetas: [join(LOTE, 'proteus'), join(MANUALES, 'proteus')] }
]

describe.skipIf(LOTE === '' || !existsSync(LOTE))('lote local de LTspice, KiCad y Proteus', () => {
  for (const { formato, ext, carpetas } of FORMATOS)
    it(`${formato}: ningún archivo lanza y las redes del origen se conservan`, () => {
      const lineas: string[] = []
      let total = 0, ok = 0, piezas = 0, cajas = 0, aprox = 0, etiquetas = 0, conViolaciones = 0, redesMal = 0, ms = 0
      const motivos = new Map<string, number>()
      for (const ruta of carpetas.filter(existsSync).flatMap((c) => archivos(c, ext))) {
        total++
        const t0 = performance.now()
        let r: ResultadoImportar
        let ajeno: CircuitoAjeno | undefined
        expect(() => ({ r, ajeno } = importarArchivo(formato, ruta)), ruta).not.toThrow()
        const dt = performance.now() - t0
        ms += dt
        if (!r!.ok) {
          motivos.set(r!.motivo, (motivos.get(r!.motivo) ?? 0) + 1)
          lineas.push(`${ruta.slice(MANUALES.length + 1)}: sin importar (${r!.motivo.slice(0, 80)})`)
          continue
        }
        ok++
        const { doc, informe } = r!
        const v = violaciones(doc, lib)
        const redes = problemasDeRedes(ajeno ?? leerAjeno(formato, ruta), doc, lib)
        piezas += informe.total
        cajas += informe.sinEquivalencia.length
        aprox += informe.aproximadas.length
        etiquetas += informe.redesConEtiqueta.length
        if (v.length) conViolaciones++
        if (redes.length) redesMal++
        if (v.length || redes.length)
          lineas.push(`${ruta.slice(MANUALES.length + 1)}: ${v.length} violaciones, ${redes.length} redes distintas (${v[0] ?? redes[0]})`)
      }
      process.stdout.write(
        `\nLote ${formato}: ${total} archivos, ${ok} importados, ${piezas} piezas, ${cajas} cajas, ${aprox} aproximadas, ${etiquetas} redes con etiqueta, ` +
          `${conViolaciones} con violaciones, ${redesMal} con redes distintas, ${Math.round(ms)} ms\n` +
          [...motivos].map(([m, n]) => `  ${n} x ${m.slice(0, 100)}`).join('\n') +
          `\n${lineas.join('\n')}\n`
      )
      expect(total).toBeGreaterThan(0)
      expect(redesMal, 'archivos con redes distintas a las del origen').toBe(0)
    }, 900000)

  it('compila la netlist de New Project y de tres ejemplos simples por formato sin errores', () => {
    const salida: string[] = []
    const grupos: [string, string[]][] = FORMATOS.map((f) => [f.formato, f.carpetas.filter(existsSync).flatMap((c) => archivos(c, f.ext))])
    for (const [formato, rutas] of grupos) {
      const elegidos = rutas.filter((r) => r.includes('New Project'))
      for (const ruta of rutas) {
        if (elegidos.length >= 3 + (rutas.some((r) => r.includes('New Project')) ? 1 : 0)) break
        if (elegidos.includes(ruta)) continue
        const { r } = importarArchivo(formato, ruta)
        if (r.ok && r.informe.sinEquivalencia.length === 0 && r.informe.total <= 30) elegidos.push(ruta)
      }
      for (const ruta of elegidos) {
        const { r } = importarArchivo(formato, ruta)
        if (!r.ok) {
          salida.push(`${formato}/${basename(ruta)}: sin importar`)
          continue
        }
        const res = compilarNetlist(r.doc, lib, calcularConexiones(r.doc, lib))
        salida.push(`${formato}/${basename(ruta)}: ${res.errores.length ? `ERRORES ${res.errores.slice(0, 3).join(' | ')}` : 'compila'}`)
      }
    }
    process.stdout.write(`\nNetlist de lo importado:\n${salida.join('\n')}\n`)
    expect(salida.length).toBeGreaterThan(0)
  }, 300000)
})

const NUEVO = process.env.KIRCHI_PROTEUS_USUARIO ?? (MANUALES ? join(MANUALES, 'proteus', 'New Project.pdsprj') : '')
describe.skipIf(NUEVO === '' || !existsSync(NUEVO))('proyecto de Proteus de siete amplificadores TL081', () => {
  const r = NUEVO !== '' && existsSync(NUEVO) ? importarBytes('New Project.pdsprj', readFileSync(NUEVO), lib, idSecuencial()) : null
  const doc = () => (r && r.ok ? r.doc : (() => { throw new Error('no importó') })())
  const porRef = (ref: string) => Object.values(doc().piezas).find((p) => p.ref === ref)!

  it('lleva los siete amplificadores con los cinco pines conectados y V+ y V- en sus propias redes', () => {
    const d = doc()
    const con = calcularConexiones(d, lib)
    const ops = Object.values(d.piezas).filter((p) => p.tipo === 'amp-op')
    expect(ops).toHaveLength(7)
    for (const u of ops) {
      expect(u.props.modelo).toBe('TL081')
      for (const pin of ['+', '-', 'OUT', 'V+', 'V-']) expect(con.redDePin.get(clavePin(u.id, pin)), `${u.ref}.${pin}`).toBeDefined()
    }
    const redDe = (pin: string) => new Set(ops.map((u) => con.redDePin.get(clavePin(u.id, pin))))
    expect(redDe('V+').size).toBe(1)
    expect(redDe('V-').size).toBe(1)
    expect([...redDe('V+')][0]).not.toBe([...redDe('V-')][0])
    expect(con.redes[[...redDe('V+')][0]!]!.tierra).toBe(false)
    expect(con.redes[[...redDe('+')][0]!]!.tierra).toBe(true)
    expect(violaciones(d, lib)).toEqual([])
    expect(problemasDeRedes(leerAjeno('proteus', NUEVO), d, lib)).toEqual([])
    // El cursor de Proteus (pin 3) es el cursor del reóstato de Kirchi (pin 2) y va a la entrada inversora de U5.
    const u5 = ops.find((u) => u.ref === 'U5')!
    expect(con.redDePin.get(clavePin(porRef('RV1').id, '2'))).toBe(con.redDePin.get(clavePin(u5.id, '-')))
  })

  it('conserva los valores, los rieles de ±15 V, el pulso, las dos sondas y el transitorio de 0 a 50 s', () => {
    const d = doc()
    const valor = (ref: string) => leerValor(porRef(ref).props.valor!)?.valor
    expect(['R1', 'R2', 'R3', 'R4', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12'].map(valor)).toEqual(Array(10).fill(1000))
    expect([valor('R5'), valor('R6')]).toEqual([1e6, 1e6])
    expect([valor('C1'), valor('C2')]).toEqual([1e-6, 1e-6])
    expect([valor('RV1'), valor('RV2')]).toEqual([1e4, 1e4])
    // Los generadores de CD de V+ y V− son el voltaje de sus terminales, no piezas.
    expect(Object.values(d.piezas).filter((p) => p.tipo === 'fuente-dc')).toHaveLength(0)
    expect(Object.fromEntries(Object.values(d.alimentaciones ?? {}).map((a) => [a.nombre, a.voltaje]))).toEqual({ 'V+': '15', 'V-': '-15' })
    // Cada TL081 lleva su terminal V+ y V− junto al pin, como en Proteus: catorce terminales y ningún cable largo de alimentación.
    expect(Object.values(d.piezas).filter((p) => p.tipo === 'alimentacion')).toHaveLength(14)
    expect(Object.values(d.piezas).filter((p) => p.tipo === 'fuente-pulso')).toHaveLength(1)
    expect(Object.values(d.sondas ?? {}).filter((s) => s.tipo === 'voltaje')).toHaveLength(2)
    const a = Object.values(d.analisis ?? {})
    expect(a).toHaveLength(1)
    expect(a[0]!.config).toMatchObject({ tipo: 'tran', fin: 50 })
    expect(a[0]!.trazas?.redes).toHaveLength(2)
  })

  it('compila su netlist sin errores: los potenciómetros de un extremo libre pasan a reóstatos', () => {
    const d = doc()
    const errores = compilarNetlist(d, lib, calcularConexiones(d, lib)).errores
    expect(errores).toEqual([])
    expect([porRef('RV1').tipo, porRef('RV2').tipo]).toEqual(['reostato', 'reostato'])
  })

  const MANUAL = process.env.KIRCHI_CIRCUITO_A_MANO ?? ''
  it.skipIf(MANUAL === '' || !existsSync(MANUAL))('tiene las mismas conexiones que el mismo circuito armado a mano (se imprimen las diferencias)', () => {
    const k = leerKir(readFileSync(MANUAL))
    if (!k.ok) throw new Error('no abre')
    const firma = (documento: Documento): string[] => {
      const con = calcularConexiones(documento, lib)
      const porId = new Map(Object.values(documento.piezas).map((p) => [p.id, p]))
      return con.redes
        .map((red) => {
          const fichas = red.pines.map((c) => {
            const p = porId.get(c.split(':')[0]!)
            if (!p || ['tierra', 'fuente-dc', 'fuente-pulso', 'generador', 'osciloscopio', 'alimentacion'].includes(p.tipo)) return ''
            const simetrico = ['resistencia', 'capacitor'].includes(p.tipo)
            return `${p.tipo}(${leerValor(p.props.valor ?? '')?.valor ?? p.props.modelo ?? ''})${simetrico ? '' : `.${c.split(':')[1]}`}`
          })
          return fichas.filter(Boolean).sort().join(' ')
        })
        .filter(Boolean)
        .sort()
    }
    const importado = firma(doc())
    const manual = firma(k.doc)
    const soloImportado = [...importado]
    const soloManual = [...manual]
    for (const f of importado) {
      const i = soloManual.indexOf(f)
      if (i >= 0) (soloManual.splice(i, 1), soloImportado.splice(soloImportado.indexOf(f), 1))
    }
    const lineas = [`Circuito a mano: ${importado.length} redes importadas y ${manual.length} a mano; solo importadas ${soloImportado.length}, solo a mano ${soloManual.length}`]
    lineas.push(...soloImportado.map((f) => `  importada: ${f}`), ...soloManual.map((f) => `  a mano: ${f}`))
    process.stdout.write(['', ...lineas, ''].join(String.fromCharCode(10)))
    expect(importado.length).toBeGreaterThan(0)
  })
})
