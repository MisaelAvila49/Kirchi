import { describe, expect, it } from 'vitest'
import { estadoCintaDePrueba as base } from '../../prueba/cinta'
import { MENSAJE_DETENER_PARA_EDITAR } from '../vistaPrevia'
import { buscarComandos, entradasDeBusqueda } from './busqueda'

const TECLAS: Record<string, string> = { girar: 'R', 'girar-izq': 'Shift+R', guardar: 'Ctrl+S', 'guardar-como': 'Ctrl+Shift+S', duplicar: 'Ctrl+D', simular: 'F5', configuracion: 'Ctrl+,' }
const NOMBRES: Record<string, string> = { girar: 'Girar 90° a la derecha', 'girar-izq': 'Girar 90° a la izquierda', duplicar: 'Duplicar' }
const entradas = (e = base()) => entradasDeBusqueda(e, (id) => TECLAS[id], (id) => NOMBRES[id])
const ids = (q: string, e = base()) => buscarComandos(q, entradas(e)).map((x) => x.id)

describe('buscador de comandos', () => {
  it('«gir» da Girar a la izquierda y a la derecha, con su pestaña y su tecla', () => {
    const r = buscarComandos('gir', entradas())
    expect(r.map((x) => x.id)).toEqual(['girar-izq', 'girar'])
    expect(r[0]).toMatchObject({ texto: 'Girar a la izquierda', donde: 'Inicio', pestaña: 'inicio', tecla: 'Shift+R', razon: null })
  })

  it('sin importar acentos ni mayúsculas, y también por el nombre del registro', () => {
    expect(ids('configuracion')).toEqual(['configuracion'])
    expect(ids('ALIMENTACIÓN')).toEqual(['alimentacion'])
    expect(ids('90°')).toEqual(['girar-izq', 'girar'])
  })

  it('por la tecla: «ctrl+s» es Guardar y no Guardar como', () => {
    expect(ids('ctrl+s')).toEqual(['guardar'])
    expect(ids('ctrl+shift+s')).toEqual(['guardar-como'])
    expect(ids('ctrl+')).toEqual(expect.arrayContaining(['guardar', 'guardar-como', 'duplicar', 'configuracion']))
    expect(ids('ctrl+')).not.toContain('girar')
  })

  it('cada comando sale una vez, en el primer lugar donde está; lo de la fila de arriba dice «Barra»', () => {
    const e = entradas()
    expect(new Set(e.map((x) => x.id)).size).toBe(e.length)
    expect(e.find((x) => x.id === 'guardar')).toMatchObject({ donde: 'Inicio' })
    expect(e.find((x) => x.id === 'simular')).toMatchObject({ donde: 'Inicio' })
    expect(e.find((x) => x.id === 'deshacer')).toMatchObject({ donde: 'Barra', pestaña: undefined })
  })

  it('los que empiezan con lo escrito van primero', () => {
    expect(ids('pantal')[0]).toBe('pantalla-completa')
  })

  it('simulando, un comando que edita sale con su razón', () => {
    const [d] = buscarComandos('dupl', entradas(base({ fase: 'corriendo' })))
    expect(d).toMatchObject({ id: 'duplicar', razon: MENSAJE_DETENER_PARA_EDITAR })
  })

  it('el tema se encuentra por «tema», «claro» u «oscuro», y Simular dice Pausar al correr', () => {
    expect(ids('tema')).toContain('tema')
    expect(ids('oscuro')).toContain('tema')
    expect(buscarComandos('paus', entradas(base({ fase: 'corriendo' })))[0]).toMatchObject({ id: 'simular', texto: 'Pausar' })
  })

  it('como mucho ocho, y nada sin consulta', () => {
    expect(buscarComandos('a', entradas())).toHaveLength(8)
    expect(buscarComandos('   ', entradas())).toEqual([])
  })
})

describe('el zoom también se busca', () => {
  it('«acercar» da el zoom del lienzo y el de la página, en Vista', () => {
    const r = buscarComandos('acercar', entradas())
    expect(r.map((x) => x.id)).toEqual(['zoom-mas', 'pagina-mas'])
    expect(r.every((x) => x.donde === 'Vista')).toBe(true)
    expect(ids('alejar')).toEqual(['zoom-menos', 'pagina-menos'])
  })
})

describe('todas las teclas de un comando, y el comienzo de la última', () => {
  const TODAS: Record<string, string[]> = { ...Object.fromEntries(Object.entries(TECLAS).map(([k, v]) => [k, [v]])), rehacer: ['Ctrl+Y', 'Ctrl+Shift+Z'] }
  const conTodas = () => entradasDeBusqueda(base(), (id) => TODAS[id]?.[0], (id) => NOMBRES[id], (id) => TODAS[id] ?? [])
  const de = (q: string) => buscarComandos(q, conTodas()).map((x) => x.id)

  it('Rehacer se encuentra también por su segunda tecla, Ctrl+Shift+Z', () => {
    expect(de('ctrl+shift+z')).toEqual(['rehacer'])
    expect(de('ctrl+y')).toEqual(['rehacer'])
  })

  it('«ctrl+sh» es el comienzo de Ctrl+Shift; una sola letra es una tecla entera («ctrl+s» no es Ctrl+Shift+S)', () => {
    expect(de('ctrl+sh').sort()).toEqual(['guardar-como', 'rehacer'])
    expect(de('ctrl+s')).toEqual(['guardar'])
    expect(de('shift+')).toEqual(['girar-izq'])
  })

  it('Ctrl++ de la página se encuentra como se escribe', () => {
    expect(de('ctrl++')).toEqual(['pagina-mas'])
  })

  it('Ctrl+K encuentra Grabar la pantalla y Detener la grabación, en Inicio', () => {
    expect(ids('grabar')).toEqual(expect.arrayContaining(['grabar', 'detener-grabacion']))
    expect(ids('grabar la pantalla')[0]).toBe('grabar')
    const e = entradas(base({ grabacion: 'grabando' }))
    expect(e.find((x) => x.id === 'detener-grabacion')).toMatchObject({ donde: 'Inicio', pestaña: 'inicio', razon: null })
    expect(e.find((x) => x.id === 'grabar')).toMatchObject({ texto: 'Detener la grabación', donde: 'Inicio', razon: null })
    expect(entradas().find((x) => x.id === 'detener-grabacion')!.razon).toBe('No hay ninguna grabación en curso.')
    expect(entradas(base({ grabacion: 'no-disponible' })).find((x) => x.id === 'grabar')!.razon).toBe('Grabar solo funciona en la ventana de Kirchi.')
  })
})
