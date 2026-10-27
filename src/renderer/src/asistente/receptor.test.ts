// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { TEXTO_CAMBIOS_DEL_USUARIO, TEXTO_USUARIO_EDITANDO } from '../../../compartido/asistente'
import { leerKir } from '../archivo/kir'
import { idSecuencial } from '../doc/ids'
import { documentoVacio } from '../doc/tipos'
import { MENSAJE_SIMULANDO, MENSAJE_SOLO_LECTURA } from '../edicion/nucleo'
import { Editor } from '../editor/Editor'
import type { Efecto } from '../lienzo/animaciones'
import { libreriaDePrueba } from '../prueba/libreria'
import { perilla } from '../prueba/piezasNuevas'
import type { PiezaDef } from '../piezas/tipos'
import { aBase64, deBase64, Receptor } from './receptor'

const lib = libreriaDePrueba().piezas

function preparar(bloqueo?: () => string | null) {
  const registro: string[] = []
  const efectos: Efecto[] = []
  const editor = new Editor(lib, documentoVacio(), idSecuencial())
  const pasos: string[] = []
  editor.historial.suscribir((_d, cmd) => pasos.push(cmd.nombre))
  let gesto = false
  let reloj = 0
  const espera: number[] = []
  const receptor = new Receptor({
    editor: Object.assign(editor, { enGesto: () => gesto }),
    version: 'prueba',
    titulo: () => ({ titulo: 'Sin título', archivo: null }),
    registrar: (t) => registro.push(t),
    animar: (e) => efectos.push(e),
    ...(bloqueo ? { bloqueo } : {}),
    esperar: async (ms) => {
      espera.push(ms)
      reloj += ms
      await new Promise((r) => setTimeout(r, 0))
    },
    ahora: () => reloj
  })
  return { editor, receptor, registro, efectos, espera, pasos, gesto: (v: boolean) => (gesto = v) }
}

const colocar = { orden: { orden: 'colocar', tipo: 'resistencia', valor: '4k7', en: { x: 25, y: 25 } } }

describe('receptor del asistente', () => {
  it('colocar deja un paso deshacible con nombre del asistente, un renglón y un pulso', async () => {
    const { editor, receptor, registro, efectos, pasos } = preparar()
    const r = (await receptor.atender('orden', colocar)) as { ok: boolean; creados: Record<string, string> }
    expect(r.ok).toBe(true)
    expect(Object.values(editor.doc.piezas)).toHaveLength(1)
    expect(pasos.at(-1)).toMatch(/^Asistente: colocar resistencia/)
    expect(registro).toEqual(['Asistente: colocó R1 (4k7).'])
    expect(efectos.map((e) => e.tipo)).toEqual(['pulso'])
    editor.deshacer()
    expect(Object.keys(editor.doc.piezas)).toEqual([])
  })

  it('durante un gesto espera y luego aplica; si el gesto no termina, rechaza', async () => {
    const a = preparar()
    a.gesto(true)
    const pendiente = a.receptor.atender('orden', colocar)
    await new Promise((r) => setTimeout(r, 0))
    expect(Object.keys(a.editor.doc.piezas)).toHaveLength(0)
    a.gesto(false)
    expect(((await pendiente) as { ok: boolean }).ok).toBe(true)
    const b = preparar()
    b.gesto(true)
    expect(await b.receptor.atender('orden', colocar)).toEqual({ ok: false, motivo: TEXTO_USUARIO_EDITANDO })
    expect(b.espera.length).toBeGreaterThan(0)
  })

  it('simulando o en solo lectura rechaza con el mensaje del editor', async () => {
    const a = preparar()
    a.editor.simulando = true
    expect(await a.receptor.atender('orden', colocar)).toEqual({ ok: false, motivo: MENSAJE_SIMULANDO })
    const b = preparar()
    b.editor.soloLectura = true
    expect(await b.receptor.atender('orden', colocar)).toEqual({ ok: false, motivo: MENSAJE_SOLO_LECTURA })
    expect(b.registro).toEqual([])
  })

  it('leer no deja renglón y entrega el documento como un .kir', async () => {
    const { receptor, registro, editor } = preparar()
    await receptor.atender('orden', colocar)
    registro.length = 0
    const d = (await receptor.atender('documento', null)) as { bytes: string }
    expect(await receptor.atender('estado', null)).toMatchObject({ ventana: true, editable: null, piezas: 1 })
    expect(registro).toEqual([])
    const k = leerKir(deBase64(d.bytes))
    expect(k.ok && Object.keys(k.doc.piezas).length).toBe(Object.keys(editor.doc.piezas).length)
  })

  it('una orden inválida se rechaza sin tocar el documento', async () => {
    const { receptor, editor } = preparar()
    const r = (await receptor.atender('orden', { orden: { orden: 'colocar', tipo: 'no-existe-xyz' } })) as { ok: boolean }
    expect(r.ok).toBe(false)
    expect(Object.keys(editor.doc.piezas)).toEqual([])
  })

  it('deshacer por el asistente deshace el último paso y lo anota', async () => {
    const { receptor, editor, registro } = preparar()
    await receptor.atender('orden', colocar)
    await receptor.atender('orden', { orden: { orden: 'deshacer' } })
    expect(Object.keys(editor.doc.piezas)).toEqual([])
    expect(registro.at(-1)).toBe('Asistente: deshizo el último paso.')
  })

  it('nombrar una red y guardar un análisis dejan su paso, su renglón y se deshacen', async () => {
    const { receptor, editor, registro, pasos } = preparar()
    await receptor.atender('orden', colocar)
    const n = (await receptor.atender('orden', { orden: { orden: 'nombrar', punto: 'R1.1', nombre: 'ENTRADA' } })) as { ok: boolean }
    expect(n.ok).toBe(true)
    expect(Object.values(editor.doc.etiquetas).map((e) => e.nombre)).toEqual(['ENTRADA'])
    expect(pasos.at(-1)).toBe('Asistente: nombrar R1.1')
    expect(registro.at(-1)).toBe('Asistente: nombró R1.1 como ENTRADA.')
    const a = (await receptor.atender('orden', { orden: { orden: 'analisis', nombre: 'Operación', config: { tipo: 'op' } } })) as { ok: boolean }
    expect(a.ok).toBe(true)
    expect(Object.values(editor.doc.analisis ?? {}).map((x) => x.nombre)).toEqual(['Operación'])
    expect(registro.at(-1)).toBe('Asistente: guardó el análisis Operación.')
    editor.deshacer()
    expect(Object.keys(editor.doc.analisis ?? {})).toEqual([])
  })

  it('con la versión del usuario conservada frente al disco rechaza la orden y no toca el documento', async () => {
    let conservado = true
    const { receptor, editor, registro } = preparar(() => (conservado ? TEXTO_CAMBIOS_DEL_USUARIO : null))
    expect(await receptor.atender('orden', colocar)).toEqual({ ok: false, motivo: TEXTO_CAMBIOS_DEL_USUARIO })
    expect(Object.keys(editor.doc.piezas)).toEqual([])
    expect(registro).toEqual([])
    expect(await receptor.atender('estado', null)).toMatchObject({ ventana: true })
    conservado = false
    expect(((await receptor.atender('orden', colocar)) as { ok: boolean }).ok).toBe(true)
  })

  it('base64 ida y vuelta', () => {
    const b = new Uint8Array(70000).map((_, i) => i % 251)
    expect(deBase64(aBase64(b))).toEqual(b)
  })
})

describe('receptor: perilla', () => {
  const sensor: PiezaDef = {
    ...lib.get('resistencia')!,
    id: 'sensor-t',
    prefijo: 'U',
    props: [perilla('temp', 'Temperatura', '°C', '25', 0, 200)]
  }
  const armar = () => {
    const libS = new Map(lib).set(sensor.id, sensor)
    const editor = new Editor(libS, documentoVacio(), idSecuencial())
    const movidas: [string, string, number][] = []
    const registro: string[] = []
    const receptor = new Receptor({
      editor: Object.assign(editor, { enGesto: () => false }),
      version: 'prueba',
      titulo: () => ({ titulo: 'Sin título', archivo: null }),
      registrar: (x) => registro.push(x),
      moverPerilla: (id, prop, v) => movidas.push([id, prop, v]),
      animar: () => {}
    })
    return { editor, receptor, movidas, registro }
  }

  it('mueve la perilla simulando, la manda al motor y deja un renglón en el Registro', async () => {
    const { editor, receptor, movidas, registro } = armar()
    await receptor.atender('orden', { orden: { orden: 'colocar', tipo: 'sensor-t' } })
    editor.simulando = true
    const r = await receptor.atender('perilla', { ref: 'U1', valor: 60 })
    expect(r).toEqual({ ok: true, ref: 'U1', prop: 'temp', valor: '60 °C' })
    const id = Object.keys(editor.doc.piezas)[0]
    expect(editor.doc.piezas[id].props.temp).toBe('60 °C')
    expect(movidas).toEqual([[id, 'temp', 60]])
    expect(registro.at(-1)).toBe('Asistente: movió temperatura de U1 a 60 °C.')
  })

  it('un valor fuera de rango no toca el documento ni el motor', async () => {
    const { editor, receptor, movidas } = armar()
    await receptor.atender('orden', { orden: { orden: 'colocar', tipo: 'sensor-t' } })
    expect(await receptor.atender('perilla', { ref: 'U1', valor: 900 })).toEqual({ ok: false, motivo: 'Temperatura va de 0 °C a 200 °C.' })
    expect(Object.values(editor.doc.piezas)[0].props.temp).toBe('25')
    expect(movidas).toEqual([])
  })
})
