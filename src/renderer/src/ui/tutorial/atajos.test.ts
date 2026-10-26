// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { idSecuencial } from '../../doc/ids'
import { registrarAtajosDelEditor } from '../../editor/atajosEditor'
import { Editor } from '../../editor/Editor'
import { Atajos } from '../../editor/teclado'
import { documentoVacio } from '../../doc/tipos'
import { libreriaDePrueba } from '../../prueba/libreria'
import { registrarAtajosDeArchivo } from '../atajosArchivo'
import { registrarAtajosDeSimulacion } from '../atajosSimulacion'
import { registrarAtajosDeLaVentana } from '../atajosVentana'
import { CAPITULOS } from './capitulos'
import { partirTexto, textoLlano } from './texto'

/** La tabla de atajos como la arma la ventana: las mismas cuatro familias de registros con sus ids reales. */
function tablaReal(): Atajos {
  const a = new Atajos()
  const nada = () => undefined
  registrarAtajosDelEditor(a, new Editor(libreriaDePrueba().piezas, documentoVacio(), idSecuencial()), { encuadrar: nada })
  registrarAtajosDeLaVentana(a, { hojaDeAtajos: nada, lienzoLimpio: nada, menuContextual: nada, configuracion: nada, enfocarFormato: nada, plegarCinta: nada, buscarComando: nada })
  registrarAtajosDeSimulacion(a, { simularOPausar: nada, detener: nada, alternarVoltajes: nada, potenciometro: { paso: nada, hay: () => false }, tiempo: { ejecutar: nada } })
  registrarAtajosDeArchivo(a, { nuevo: nada, abrir: nada, guardar: nada, guardarComo: nada })
  return a
}

const idsDeTeclas = (): { capitulo: string; paso: string; id: string }[] =>
  CAPITULOS.flatMap((c) => c.pasos.flatMap((p) => [...p.texto.matchAll(/\{tecla:([a-z0-9-]+)\}/g)].map((m) => ({ capitulo: c.id, paso: p.id, id: m[1] }))))

describe('las teclas del tutorial salen de la tabla real de atajos', () => {
  it('cada {tecla:id} de los cinco capítulos es un comando registrado con alguna tecla', () => {
    const a = tablaReal()
    const usados = idsDeTeclas()
    expect(usados.length).toBeGreaterThan(15)
    for (const u of usados) expect(a.teclasDe(u.id).length, `${u.capitulo}/${u.paso}: ${u.id}`).toBeGreaterThan(0)
  })

  it('el capítulo 5 nombra las cinco teclas que enseña', () => {
    const ids = idsDeTeclas().filter((u) => u.capitulo === 'trucos').map((u) => u.id)
    expect([...new Set(ids)].sort()).toEqual(['atajos', 'buscar-comando', 'deshacer', 'encuadrar', 'limpio'])
  })

  it('el texto sigue a la tecla que el usuario tenga configurada', () => {
    const a = tablaReal()
    const paso = CAPITULOS[4].pasos.find((p) => p.id === 'encuadrar')!
    const teclaDe = (id: string) => a.teclasDe(id)[0]
    const nombreDe = (id: string) => a.nombreDe(id) ?? id
    expect(partirTexto(paso.texto, teclaDe).some((p) => p.tipo === 'tecla' && p.tecla === 'F')).toBe(true)
    a.ponerTeclas('encuadrar', ['Ctrl+E'])
    expect(partirTexto(paso.texto, teclaDe).some((p) => p.tipo === 'tecla' && p.tecla === 'Ctrl+E')).toBe(true)
    expect(textoLlano(paso.texto, teclaDe, nombreDe)).toContain('Ctrl+E')
    // Sin tecla (el usuario la quitó) el texto dice el nombre del comando en vez de dejar un hueco.
    a.ponerTeclas('encuadrar', [])
    expect(textoLlano(paso.texto, teclaDe, nombreDe)).toContain('Encuadrar todo')
  })
})
