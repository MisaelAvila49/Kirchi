import { describe, expect, it } from 'vitest'
import { PESTAÑAS_CINTA } from '../../../../compartido/ajustes'
import { registrarAtajosDelEditor } from '../../editor/atajosEditor'
import type { Editor } from '../../editor/Editor'
import { Atajos } from '../../editor/teclado'
import { registrarAtajosDeArchivo } from '../atajosArchivo'
import { registrarAtajosDeSimulacion } from '../atajosSimulacion'
import { registrarAtajosDeLaVentana } from '../atajosVentana'
import { hojaDeAtajos } from '../hojaDeAtajos'
import { ordenDePlegado } from './ajustar'
import { COMANDOS, type IdComando } from './comandos'
import {
  ACCESO_RAPIDO, DENTRO_DE, DONDE_BARRA, ENTRADAS_MENU, FIJOS, grupoDeSeleccion, gruposConSeleccion, idsColocados, idsDeColumna, lugarDeTecla, lugares,
  pestañaDe, PESTAÑAS, SOLO_TECLADO
} from './modelo'
import { TRAZOS } from './trazos'

/** El registro completo de la ventana (los comandos no se ejecutan: el editor puede ser un objeto vacío). */
function registroCompleto(): Atajos {
  const a = new Atajos()
  const nada = () => {}
  registrarAtajosDelEditor(a, {} as Editor, { encuadrar: nada })
  registrarAtajosDeLaVentana(a, { hojaDeAtajos: nada, lienzoLimpio: nada, configuracion: nada, menuContextual: nada, enfocarFormato: nada, plegarCinta: nada, buscarComando: nada, enfocarTutorial: nada, grabar: nada, detenerGrabacion: nada })
  registrarAtajosDeSimulacion(a, { simularOPausar: nada, detener: nada, alternarVoltajes: nada, potenciometro: { paso: nada, hay: () => false }, tiempo: { ejecutar: nada } })
  registrarAtajosDeArchivo(a, { nuevo: nada, abrir: nada, guardar: nada, guardarComo: nada })
  return a
}

/** Dónde queda cada comando en la parte de arriba: el grupo de Inicio, la pestaña o la barra. */
const TABLA_O2: Readonly<Record<string, readonly string[]>> = {
  'Inicio › Archivo': ['guardar', 'nuevo', 'abrir', 'guardar-como', 'recientes', 'exportar', 'guardar-plantilla'],
  'Inicio › Editar': ['cortar', 'copiar', 'pegar', 'duplicar', 'borrar', 'todo'],
  'Inicio › Colocar': ['pieza', 'figura', 'figura-linea', 'figura-rectangulo', 'figura-elipse', 'figura-flecha', 'etiqueta', 'tierra', 'alimentacion', 'nota'],
  'Inicio › Simular': ['simular', 'detener', 'avanzar-tiempo', 'avanzar-hasta', 'retroceder', 'avanzar', 'grabar', 'detener-grabacion'],
  'Inicio › Instrumento': ['instrumentos', 'colocar-multimetro', 'colocar-osciloscopio', 'colocar-generador', 'colocar-fuente'],
  'Inicio › Análisis': ['analizar', 'analisis-op', 'analisis-dc', 'analisis-ac', 'analisis-tran', 'analisis-fourier', 'analisis-param', 'analisis-ejecutar', 'analisis-cancelar', 'franja-graficas', 'panel-analisis'],
  // Lo que solo vive en el último grupo de Inicio, que cambia con la selección.
  'Inicio › Selección': ['girar-izq', 'restablecer-textos', 'girar', 'espejo-x', 'espejo-y', 'franja-osciloscopio', 'franja-registro'],
  'Vista › Zoom': ['encuadrar', 'zoom-100', 'zoom-menos', 'zoom-mas'],
  'Vista › Paneles': ['panel-libreria', 'panel-plantillas', 'panel-calculadoras', 'panel-inspector', 'panel-proyecto', 'panel-mediciones', 'panel-instrumentos'],
  'Vista › Tiempo y animación': ['velocidad', 'mas-lento', 'mas-rapido', 'animaciones', 'sonido'],
  'Vista › Ventana': ['limpio', 'pantalla-completa', 'pagina-menos', 'pagina-real', 'pagina-mas'],
  'Ayuda › Aprender': ['aprender', 'atajos', 'enfocar-tutorial'],
  'Ayuda › Más ayuda': ['ejemplos', 'acerca'],
  Barra: ['deshacer', 'rehacer', 'voltajes', 'corriente', 'tema', 'configuracion', 'plegar-cinta']
}

describe('modelo de la cinta', () => {
  it('tres pestañas en el orden de los ajustes: Inicio, Vista y Ayuda', () => {
    expect(PESTAÑAS.map((p) => p.id)).toEqual([...PESTAÑAS_CINTA])
    expect(PESTAÑAS.map((p) => p.nombre)).toEqual(['Inicio', 'Vista', 'Ayuda'])
  })

  it('Inicio: Archivo, Editar, Colocar, Simular, Instrumento y Análisis; con la selección, el último es Selección', () => {
    const inicio = PESTAÑAS[0]
    expect(inicio.grupos.map((g) => g.nombre)).toEqual(['Archivo', 'Editar', 'Colocar', 'Simular', 'Instrumento', 'Análisis'])
    expect(gruposConSeleccion(inicio, 'nada', '').map((g) => g.nombre)).toEqual(['Archivo', 'Editar', 'Colocar', 'Simular', 'Instrumento', 'Análisis', 'Selección'])
    expect(gruposConSeleccion(inicio, 'pieza', 'Resistencia R1').at(-1)!.nombre).toBe('Resistencia R1')
    // Vista y Ayuda no cambian con la selección.
    expect(gruposConSeleccion(PESTAÑAS[1], 'pieza', 'R1')).toBe(PESTAÑAS[1].grupos)
  })

  it('Archivo con nombres: Guardar grande y tres pilas de dos; Editar y las cuatro piezas menores de Colocar, solo con icono', () => {
    const [archivo, editar, colocar] = PESTAÑAS[0].grupos
    expect(archivo.columnas).toEqual([
      { tipo: 'grande', id: 'guardar' }, { tipo: 'pila', ids: ['nuevo', 'abrir'] }, { tipo: 'pila', ids: ['guardar-como', 'recientes'] }, { tipo: 'pila', ids: ['exportar', 'guardar-plantilla'] }
    ])
    expect(editar.columnas).toEqual([{ tipo: 'iconos', ids: ['cortar', 'copiar', 'pegar', 'duplicar', 'borrar', 'todo'], filas: 2 }])
    expect(colocar.columnas).toEqual([{ tipo: 'grande', id: 'pieza' }, { tipo: 'grande', id: 'figura' }, { tipo: 'iconos', ids: ['etiqueta', 'tierra', 'alimentacion', 'nota'], filas: 2 }])
    expect(DENTRO_DE.figura).toEqual(['figura-linea', 'figura-rectangulo', 'figura-elipse', 'figura-flecha'])
  })

  it('Instrumentos y Analizar son botones con menú; el menú trae cada orden y Resultados lo parte en dos', () => {
    expect(COMANDOS.instrumentos.menu && COMANDOS.analizar.menu).toBe(true)
    expect(ENTRADAS_MENU.instrumentos).toEqual(['colocar-multimetro', 'colocar-osciloscopio', 'colocar-generador', 'colocar-fuente'])
    expect(ENTRADAS_MENU.analizar).toEqual(['analisis-op', 'analisis-dc', 'analisis-ac', 'analisis-tran', 'analisis-fourier', 'analisis-param', { titulo: 'Resultados' }, 'franja-graficas', 'panel-analisis'])
    // Lo que abre cambia el circuito y se deshabilita con la vista previa; correr y ver, no.
    for (const id of ['colocar-multimetro', 'colocar-osciloscopio', 'colocar-generador', 'colocar-fuente', 'analisis-op', 'analisis-ac'] as const) expect(COMANDOS[id].edita, id).toBe(true)
    for (const id of ['analisis-ejecutar', 'analisis-cancelar', 'franja-graficas', 'panel-analisis'] as const) expect(COMANDOS[id].edita, id).toBeUndefined()
    expect(Object.keys(COMANDOS)).not.toContain('franja-analisis')
    expect(DENTRO_DE.analizar).toHaveLength(8)
    expect(pestañaDe('analisis-ac')).toBe('inicio')
  })

  it('Análisis: Analizar con su menú y Ejecutar y Cancelar en pila, sin tecla propia', () => {
    const an = PESTAÑAS[0].grupos[5]
    expect(an.columnas).toEqual([{ tipo: 'grande', id: 'analizar' }, { tipo: 'pila', ids: ['analisis-ejecutar', 'analisis-cancelar'] }])
    for (const id of [...an.columnas.flatMap(idsDeColumna), ...(DENTRO_DE.analizar ?? [])]) expect(COMANDOS[id].tecla, id).toBeUndefined()
  })

  it('Vista: Zoom, Paneles, Tiempo y animación, y Ventana (con Lienzo limpio); el tamaño de la interfaz sigue en Ventana', () => {
    const vista = PESTAÑAS[1]
    expect(vista.grupos.map((g) => g.nombre)).toEqual(['Zoom', 'Paneles', 'Tiempo y animación', 'Ventana'])
    expect(vista.grupos[2].columnas).toEqual([{ tipo: 'grande', id: 'velocidad' }, { tipo: 'pila', ids: ['mas-lento', 'mas-rapido'] }, { tipo: 'pila', ids: ['animaciones', 'sonido'] }])
    expect(vista.grupos[3].columnas).toEqual([{ tipo: 'grande', id: 'limpio' }, { tipo: 'pila', ids: ['pantalla-completa', 'control-tamano'] }])
    expect(DENTRO_DE['control-tamano']).toEqual(['pagina-menos', 'pagina-real', 'pagina-mas'])
    expect(COMANDOS['avanzar-tiempo'].menu && COMANDOS.velocidad.menu).toBe(true)
    expect(COMANDOS.avanzar.menu).toBeUndefined()
    expect(Object.keys(COMANDOS)).not.toContain('zoom-pagina')
  })

  it('Ayuda: grupos Aprender y Más ayuda, con el botón Aprende Kirchi, que se encuentra con Ctrl+K y no trae tecla', () => {
    const ayuda = PESTAÑAS[2]
    expect(ayuda.grupos.map((g) => g.nombre)).toEqual(['Aprender', 'Más ayuda'])
    expect(ayuda.grupos[0].columnas).toEqual([{ tipo: 'grande', id: 'aprender' }, { tipo: 'grande', id: 'atajos' }, { tipo: 'pila', ids: ['enfocar-tutorial'] }])
    expect(COMANDOS['enfocar-tutorial'].tecla).toBe('enfocar-tutorial')
    expect(COMANDOS.aprender.tecla).toBeUndefined()
    expect(pestañaDe('aprender')).toBe('ayuda')
  })

  it('cada comando está donde dice la tabla, y la tabla no deja ninguno fuera', () => {
    const dondeEsta = new Map<string, string>()
    // Un comando puede estar en dos lugares (Mediciones en Vista y en la selección): la tabla da el primero.
    for (const l of lugares()) {
      const lugar = l.pestaña && l.grupo ? `${l.pestaña.nombre} › ${l.grupo.nombre}` : DONDE_BARRA
      if (!dondeEsta.has(l.id)) dondeEsta.set(l.id, lugar)
    }
    const enTabla = new Map<string, string>()
    for (const [lugar, ids] of Object.entries(TABLA_O2)) for (const id of ids) enTabla.set(id, lugar)
    for (const [id, lugar] of enTabla) expect(dondeEsta.get(id), id).toBe(lugar)
    expect((Object.keys(COMANDOS) as IdComando[]).filter((id) => !enTabla.has(id))).toEqual([])
    expect([...dondeEsta.keys()].filter((id) => !enTabla.has(id))).toEqual([])
  })

  it('el orden de plegado de Inicio es este: Simular, Colocar, Editar, Instrumento, Análisis, Archivo y, al final, la selección', () => {
    const grupos = gruposConSeleccion(PESTAÑAS[0], 'pieza', 'Resistencia R1')
    const orden = ordenDePlegado(grupos.map((g) => g.prioridad)).map((i) => grupos[i].id)
    expect(orden).toEqual(['vista-previa', 'colocar', 'editar', 'instrumentos', 'analisis', 'archivo', 'seleccion'])
  })

  it('ningún grupo crece cuando sobra ancho', () => {
    for (const g of PESTAÑAS.flatMap((p) => p.grupos)) expect(g.crecer, g.id).toBeUndefined()
  })

  it('los grupos tienen id único, prioridad de 1 en adelante (el de la selección, 0) e icono que existe', () => {
    const grupos = [...PESTAÑAS.flatMap((p) => p.grupos), grupoDeSeleccion('nada', '')]
    expect(new Set(grupos.map((g) => g.id)).size).toBe(grupos.length)
    for (const g of grupos) {
      expect(g.prioridad, g.id).toBeGreaterThanOrEqual(g.id === 'seleccion' ? 0 : 1)
      expect(TRAZOS, g.id).toHaveProperty([g.icono])
      expect(g.columnas.length, g.id).toBeGreaterThan(0)
    }
  })

  it('cada comando de la tabla tiene un lugar visible, y cada lugar es un comando de la tabla', () => {
    const colocados = idsColocados()
    expect([...colocados].sort()).toEqual((Object.keys(COMANDOS) as IdComando[]).sort())
  })

  it('cada comando del registro tiene un botón o está en la lista de solo teclado', () => {
    const a = registroCompleto()
    const conBoton = new Set([...idsColocados()].map((id) => COMANDOS[id].tecla).filter(Boolean))
    for (const c of a.lista()) expect(conBoton.has(c.id) || SOLO_TECLADO.includes(c.id), c.id).toBe(true)
    for (const id of SOLO_TECLADO) expect(a.nombreDe(id), id).toBeDefined()
    expect(a.conflictos()).toEqual([])
  })

  it('cada tecla que nombra la tabla existe en el registro', () => {
    const a = registroCompleto()
    for (const id of Object.keys(COMANDOS) as IdComando[]) {
      const t = COMANDOS[id].tecla
      if (t) expect(a.nombreDe(t), id).toBeDefined()
    }
  })

  it('fila de título: Guardar, Deshacer, Rehacer, Simular, Detener, Voltajes y Corriente; a la derecha Atajos, Tema, Configuración y Plegar', () => {
    // Voltajes y Corriente pasan a la fila de título; Simular (que pausa y reanuda) y Detener también, además de Inicio › Simular.
    expect(ACCESO_RAPIDO).toEqual(['guardar', 'deshacer', 'rehacer', '|', 'simular', 'detener', '|', 'voltajes', 'corriente'])
    expect(FIJOS).toEqual(['atajos', 'tema', 'configuracion', 'plegar-cinta'])
  })

  it('dónde está cada comando: la primera pestaña que lo trae, o la barra', () => {
    expect(lugarDeTecla('girar')).toBe('Inicio › Selección')
    expect(lugarDeTecla('guardar')).toBe('Inicio › Archivo')
    expect(lugarDeTecla('voltajes')).toBe(DONDE_BARRA)
    expect(lugarDeTecla('limpio')).toBe('Vista › Ventana')
    expect(lugarDeTecla('deshacer')).toBe(DONDE_BARRA)
    expect(lugarDeTecla('retroceso')).toBeUndefined()
    expect(pestañaDe('girar')).toBe('inicio')
    expect(pestañaDe('deshacer')).toBeUndefined()
    // Lo que está dentro del control de zoom y del menú Zoom de la página también tiene lugar.
    expect(pestañaDe('zoom-mas')).toBe('vista')
    expect(pestañaDe('pagina-real')).toBe('vista')
  })

  it('la hoja de atajos dice dónde está el botón de cada comando, sin cambiar sus filas si no se le pide', () => {
    const a = registroCompleto()
    const filas = hojaDeAtajos(a, lugarDeTecla).flatMap((g) => g.filas)
    expect(filas.find((f) => f.id === 'girar')).toMatchObject({ lugar: 'Inicio › Selección' })
    expect(filas.find((f) => f.id === 'retroceso')).not.toHaveProperty('lugar')
    expect(hojaDeAtajos(a).flatMap((g) => g.filas).some((f) => 'lugar' in f)).toBe(false)
  })

  it('Vista › Paneles trae Plantillas junto a la Librería, Calculadoras junto al Inspector y la Franja en su propia pila', () => {
    const paneles = PESTAÑAS.find((p) => p.id === 'vista')!.grupos.find((g) => g.id === 'paneles')!
    expect(paneles.columnas).toEqual([
      { tipo: 'pila', ids: ['panel-libreria', 'panel-plantillas'] }, { tipo: 'pila', ids: ['panel-calculadoras', 'panel-inspector'] },
      { tipo: 'pila', ids: ['panel-proyecto', 'panel-mediciones'] }, { tipo: 'pila', ids: ['panel-instrumentos'] }
    ])
    expect(COMANDOS['panel-plantillas']).toMatchObject({ texto: 'Plantillas', icono: 'plantillas' })
    expect(COMANDOS['panel-calculadoras']).toMatchObject({ texto: 'Calculadoras', icono: 'calculadoras' })
    expect(COMANDOS['panel-instrumentos'].texto).toBe('Franja')
    expect(pestañaDe('panel-plantillas')).toBe('vista')
  })

  it('Inicio › Simular: el botón grande partido Grabar va al final, con su icono, sin tecla de fábrica y con Detener la grabación dentro', () => {
    const simular = PESTAÑAS.find((p) => p.id === 'inicio')!.grupos.find((g) => g.id === 'vista-previa')!
    expect(simular.columnas.map((c) => (c.tipo === 'grande' ? c.id : c.tipo === 'pila' ? c.ids[0] : c.tipo))).toEqual(['simular', 'detener', 'par', 'grabar'])
    // Arriba el botón con el menú de qué avanza y debajo, lado a lado, Retroceder y Avanzar; «Avanzar hasta…» vive en su menú.
    expect(simular.columnas[2]).toEqual({ tipo: 'par', arriba: 'avanzar-tiempo', abajo: ['retroceder', 'avanzar'] })
    expect(DENTRO_DE['avanzar-tiempo']).toEqual(['avanzar-hasta'])
    expect(COMANDOS.retroceder).toMatchObject({ texto: 'Retroceder', icono: 'pasoAtras', tecla: 'retroceder' })
    expect(COMANDOS['avanzar-tiempo']).toMatchObject({ texto: 'Avanzar', icono: 'tiempoAvanza', menu: true })
    expect(TRAZOS).toHaveProperty(['pasoAtras'])
    expect(TRAZOS).toHaveProperty(['tiempoAvanza'])
    const ventana = PESTAÑAS.find((p) => p.id === 'vista')!.grupos.find((g) => g.id === 'ventana')!
    expect(ventana.columnas.map((c) => (c.tipo === 'grande' ? c.id : c.tipo === 'pila' ? c.ids[0] : c.tipo))).toEqual(['limpio', 'pantalla-completa'])
    expect(COMANDOS.grabar).toMatchObject({ texto: 'Grabar', nombre: 'Grabar la pantalla', icono: 'grabar', popover: true, partido: true })
    expect(COMANDOS.grabar.menu).toBeUndefined()
    expect(COMANDOS['detener-grabacion']).toMatchObject({ texto: 'Detener la grabación', icono: 'detener' })
    expect(DENTRO_DE.grabar).toEqual(['detener-grabacion'])
    expect(TRAZOS).toHaveProperty(['grabar'])
    expect(pestañaDe('grabar')).toBe('inicio')
    expect(pestañaDe('detener-grabacion')).toBe('inicio')
    // Sin tecla propia: se asigna en Configuración › Atajos.
    expect(registroCompleto().teclasDe('grabar')).toEqual([])
    expect(registroCompleto().teclasDe('detener-grabacion')).toEqual([])
  })
})
