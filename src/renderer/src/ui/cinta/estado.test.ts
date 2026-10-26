import { describe, expect, it } from 'vitest'
import { PISTA_SIN_RECIENTES, PISTA_SOLO_LECTURA, PISTA_VACIO, razonSinPegar } from '../menus'
import { estadoCintaDePrueba as base } from '../../prueba/cinta'
import { MENSAJE_DETENER_PARA_EDITAR } from '../vistaPrevia'
import { COMANDOS, type IdComando } from './comandos'
import {
  conFlecha, globoDe, iconoDe, marcado, RAZON_RETROCEDER_AVANZANDO, RAZON_RETROCEDER_CORRIENDO, RAZON_RETROCEDER_DETENIDA, RAZON_SIN_RETROCESO, RAZON_SIN_TEXTOS_MANUALES, RAZON_GRABAR_OCUPADA, RAZON_GRABAR_SIN_VENTANA, RAZON_SIN_GRABACION, mismoEstadoCinta, nombreAccesible, textoReloj, RAZON_ARRANCANDO, RAZON_DETENIDA, RAZON_SIN_DESHACER, RAZON_SIN_REHACER, RAZON_SIN_VENTANA,
  RAZON_GIRAR_SIN_PIEZA, RAZON_INTERFAZ_MAXIMA, RAZON_INTERFAZ_MINIMA, RAZON_REFLEJAR_SIN_PIEZA, RAZON_SIN_SELECCION, RAZON_SONDAS_NO_SE_COPIAN, RAZON_TODO_VACIO, RAZON_ZOOM_MAXIMO, RAZON_ZOOM_MINIMO, RAZON_ANALISIS_CON_VISTA_PREVIA, RAZON_ANALISIS_EN_CURSO, RAZON_ANALISIS_SIN_CORRER, RAZON_ANALISIS_SIN_ELEGIR, razonDeshabilitado, razonVoltajes, teclaVisible, textoDe,
  type EstadoCinta
} from './estado'

const TECLAS: Record<string, string> = { girar: 'R', copiar: 'Ctrl+C', simular: 'F5', guardar: 'Ctrl+S' }
const tecla = (id: string) => TECLAS[id]
const ids = Object.keys(COMANDOS) as IdComando[]
const editan = ids.filter((id) => COMANDOS[id].edita)

describe('razones de deshabilitado', () => {
  it('detenida y con todo a mano no hay nada deshabilitado salvo Detener, Detener la grabación, Voltajes y, sin análisis elegido ni en curso, Ejecutar y Cancelar', () => {
    const r = ids.filter((id) => razonDeshabilitado(id, base(), tecla) !== null)
    // Retroceder tampoco actúa sin un avance anterior.
    expect(r.sort()).toEqual(['analisis-cancelar', 'analisis-ejecutar', 'detener', 'detener-grabacion', 'restablecer-textos', 'retroceder', 'voltajes'])
    expect(razonDeshabilitado('detener', base(), tecla)).toBe(RAZON_DETENIDA)
    expect(razonDeshabilitado('voltajes', base(), tecla)).toBe(razonVoltajes('F5'))
    expect(razonVoltajes('F5')).toBe('Los voltajes se ven con la vista previa (F5).')
  })

  it('Ejecutar: con la vista previa, en curso, con un aviso que bloquea o sin análisis elegido dice por qué; Cancelar solo en curso', () => {
    const listo = base({ analisisFicha: 'ac' })
    expect(razonDeshabilitado('analisis-ejecutar', listo, tecla)).toBeNull()
    expect(razonDeshabilitado('analisis-ejecutar', base({ analisisFicha: 'ac', fase: 'corriendo' }), tecla)).toBe(RAZON_ANALISIS_CON_VISTA_PREVIA)
    expect(razonDeshabilitado('analisis-ejecutar', base({ analisisFicha: 'ac', fase: 'pausada' }), tecla)).toBe(RAZON_ANALISIS_CON_VISTA_PREVIA)
    expect(razonDeshabilitado('analisis-ejecutar', base({ analisisFicha: 'ac', analisisCorriendo: true }), tecla)).toBe(RAZON_ANALISIS_EN_CURSO)
    expect(razonDeshabilitado('analisis-ejecutar', base({ analisisFicha: 'ac', analisisBloqueo: 'R1 no tiene valor.' }), tecla)).toBe('R1 no tiene valor.')
    expect(razonDeshabilitado('analisis-ejecutar', base(), tecla)).toBe(RAZON_ANALISIS_SIN_ELEGIR)
    expect(razonDeshabilitado('analisis-cancelar', base(), tecla)).toBe(RAZON_ANALISIS_SIN_CORRER)
    expect(razonDeshabilitado('analisis-cancelar', base({ analisisCorriendo: true }), tecla)).toBeNull()
    // Sin nada corriendo, Cancelar descarta el análisis que se prepara; corriendo, el mismo botón es Detener.
    expect(razonDeshabilitado('analisis-cancelar', base({ analisisFicha: 'ac' }), tecla)).toBeNull()
    expect(textoDe('analisis-cancelar', base({ analisisFicha: 'ac' }))).toBe('Cancelar')
    expect(textoDe('analisis-cancelar', base({ analisisFicha: 'ac', analisisCorriendo: true }))).toBe('Detener')
  })

  it('el análisis cuya ficha está abierta queda presionado, solo con la pestaña Análisis del riel derecho abierta', () => {
    const abierto = { inspector: true, panelDerecho: 'analisis' as const, analisisFicha: 'ac' }
    expect(marcado('analisis-ac', base(abierto))).toBe(true)
    expect(marcado('analisis-dc', base(abierto))).toBe(false)
    expect(marcado('analisis-ac', base({ ...abierto, panelDerecho: 'proyecto' }))).toBe(false)
    expect(marcado('analisis-ac', base({ ...abierto, inspector: false }))).toBe(false)
    expect(marcado('franja-graficas', base({ franja: 'graficas' }))).toBe(true)
    expect(marcado('panel-analisis', base({ inspector: true, panelDerecho: 'analisis' }))).toBe(true)
    expect(marcado('panel-analisis', base({ inspector: true, panelDerecho: 'proyecto' }))).toBe(false)
  })

  it('simulando, todo lo que edita dice «Detén la vista previa para editar.» y lo demás sigue activo', () => {
    const e = base({ fase: 'corriendo' })
    expect(editan.length).toBeGreaterThan(10)
    for (const id of editan) expect(razonDeshabilitado(id, e, tecla), id).toBe(MENSAJE_DETENER_PARA_EDITAR)
    for (const id of ['copiar', 'todo', 'guardar', 'encuadrar', 'zoom-100', 'tema', 'panel-proyecto', 'detener', 'voltajes', 'simular'] as const)
      expect(razonDeshabilitado(id, e, tecla), id).toBeNull()
    expect(razonDeshabilitado('simular', base({ fase: 'arrancando' }), tecla)).toBe(RAZON_ARRANCANDO)
  })

  it('en solo lectura no se edita ni se guarda, pero se exporta', () => {
    const e = base({ soloLectura: true })
    expect(razonDeshabilitado('girar', e, tecla)).toBe(PISTA_SOLO_LECTURA)
    expect(razonDeshabilitado('guardar', e, tecla)).toBe(PISTA_SOLO_LECTURA)
    expect(razonDeshabilitado('guardar-como', e, tecla)).toBe(PISTA_SOLO_LECTURA)
    expect(razonDeshabilitado('exportar', e, tecla)).toBeNull()
  })

  it('lo que depende del documento, del historial, del portapapeles y de la ventana', () => {
    expect(razonDeshabilitado('exportar', base({ vacio: true }), tecla)).toBe(PISTA_VACIO)
    expect(razonDeshabilitado('recientes', base({ recientes: 0 }), tecla)).toBe(PISTA_SIN_RECIENTES)
    expect(razonDeshabilitado('deshacer', base({ puedeDeshacer: false }), tecla)).toBe(RAZON_SIN_DESHACER)
    expect(razonDeshabilitado('rehacer', base({ puedeRehacer: false }), tecla)).toBe(RAZON_SIN_REHACER)
    expect(razonDeshabilitado('pegar', base({ puedePegar: false }), tecla)).toBe('Primero copia algo con Ctrl+C.')
    expect(razonSinPegar(undefined)).toBe('Primero copia algo.')
    expect(razonDeshabilitado('pantalla-completa', base({ ventana: false }), tecla)).toBe(RAZON_SIN_VENTANA)
    expect(razonDeshabilitado('pagina-mas', base({ ventana: false }), tecla)).toBe(RAZON_SIN_VENTANA)
  })

  it('el tamaño de la interfaz no pasa de sus topes: + deshabilitado en 150 % y − en 80 %', () => {
    expect(razonDeshabilitado('pagina-mas', base({ tamañoInterfaz: 150 }), tecla)).toBe(RAZON_INTERFAZ_MAXIMA)
    expect(razonDeshabilitado('pagina-menos', base({ tamañoInterfaz: 80 }), tecla)).toBe(RAZON_INTERFAZ_MINIMA)
    expect(RAZON_INTERFAZ_MAXIMA).toBe('La interfaz ya está en su tamaño máximo (150 %).')
    expect(RAZON_INTERFAZ_MINIMA).toBe('La interfaz ya está en su tamaño mínimo (80 %).')
    expect(razonDeshabilitado('pagina-mas', base({ tamañoInterfaz: 125 }), tecla)).toBeNull()
    expect(razonDeshabilitado('pagina-menos', base({ tamañoInterfaz: 150 }), tecla)).toBeNull()
  })

  it('con una sola pieza seleccionada, Plantilla y Exportar de la cinta están disponibles (el clic derecho ya no los trae)', () => {
    const una = base({ seleccion: 1, piezasSeleccionadas: 1 })
    expect(razonDeshabilitado('guardar-plantilla', una, tecla)).toBeNull()
    expect(razonDeshabilitado('exportar', una, tecla)).toBeNull()
  })

  it('sin selección no se corta, copia, duplica ni borra; sin pieza no se gira ni se refleja, salvo la que se está colocando', () => {
    const nada = base({ seleccion: 0, piezasSeleccionadas: 0 })
    for (const id of ['cortar', 'copiar', 'duplicar', 'guardar-plantilla', 'borrar'] as const) expect(razonDeshabilitado(id, nada, tecla), id).toBe(RAZON_SIN_SELECCION)
    expect(RAZON_SIN_SELECCION).toBe('Selecciona algo primero.')
    // Solo sondas: se borran, pero no se copian.
    const soloSondas = base({ seleccion: 2, piezasSeleccionadas: 0, soloSondas: true })
    for (const id of ['cortar', 'copiar', 'duplicar', 'guardar-plantilla'] as const) expect(razonDeshabilitado(id, soloSondas, tecla), id).toBe(RAZON_SONDAS_NO_SE_COPIAN)
    expect(razonDeshabilitado('borrar', soloSondas, tecla)).toBeNull()
    expect(RAZON_SONDAS_NO_SE_COPIAN).toBe('Las sondas no se copian: ponlas con el clic derecho de un cable.')
    const soloCables = base({ seleccion: 3, piezasSeleccionadas: 0 })
    expect(razonDeshabilitado('borrar', soloCables, tecla)).toBeNull()
    for (const id of ['girar', 'girar-izq'] as const) expect(razonDeshabilitado(id, soloCables, tecla), id).toBe(RAZON_GIRAR_SIN_PIEZA)
    for (const id of ['espejo-x', 'espejo-y'] as const) expect(razonDeshabilitado(id, nada, tecla), id).toBe(RAZON_REFLEJAR_SIN_PIEZA)
    expect([RAZON_GIRAR_SIN_PIEZA, RAZON_REFLEJAR_SIN_PIEZA]).toEqual(['Selecciona una pieza para girarla.', 'Selecciona una pieza para reflejarla.'])
    // R, Shift+R, X e Y también orientan la pieza que se está colocando.
    expect(razonDeshabilitado('girar', base({ seleccion: 0, piezasSeleccionadas: 0, colocando: true }), tecla)).toBeNull()
    // Simulando manda la razón de la vista previa.
    expect(razonDeshabilitado('borrar', base({ fase: 'corriendo', seleccion: 0 }), tecla)).toBe(MENSAJE_DETENER_PARA_EDITAR)
  })

  it('Todo no actúa con el circuito vacío', () => {
    expect(razonDeshabilitado('todo', base({ vacio: true }), tecla)).toBe(RAZON_TODO_VACIO)
    expect(razonDeshabilitado('todo', base(), tecla)).toBeNull()
  })

  it('el zoom en su tope y el de la página sin ventana dicen por qué', () => {
    expect(razonDeshabilitado('zoom-mas', base({ topeZoom: 'maximo' }), tecla)).toBe(RAZON_ZOOM_MAXIMO)
    expect(razonDeshabilitado('zoom-menos', base({ topeZoom: 'minimo' }), tecla)).toBe(RAZON_ZOOM_MINIMO)
    expect(razonDeshabilitado('zoom-menos', base({ topeZoom: 'maximo' }), tecla)).toBeNull()
    for (const id of ['pagina-mas', 'pagina-menos', 'pagina-real'] as const) expect(razonDeshabilitado(id, base({ ventana: false }), tecla), id).toBe(RAZON_SIN_VENTANA)
    expect(teclaVisible('pagina-mas', tecla)).toBe('Ctrl++')
  })

  it('ninguna razón lleva guion largo', () => {
    const estados = [base(), base({ fase: 'corriendo' }), base({ soloLectura: true, vacio: true, recientes: 0, puedeDeshacer: false, puedeRehacer: false, puedePegar: false, ventana: false })]
    for (const e of estados) for (const id of ids) expect(razonDeshabilitado(id, e, tecla) ?? '', id).not.toContain('—')
  })
})

describe('Restablecer posición de los textos (solo en Ctrl+K)', () => {
  it('se habilita solo si la selección tiene textos movidos a mano y no edita en solo lectura', () => {
    expect(razonDeshabilitado('restablecer-textos', base({}), tecla)).toBe(RAZON_SIN_TEXTOS_MANUALES)
    expect(razonDeshabilitado('restablecer-textos', base({ textosManuales: true }), tecla)).toBeNull()
    expect(razonDeshabilitado('restablecer-textos', base({ textosManuales: true, soloLectura: true }), tecla)).not.toBeNull()
  })
})

describe('Avanzar en el tiempo, Retroceder y Avanzar (1.2)', () => {
  it('Retroceder solo actúa en pausa, sin un avance en curso y con algo guardado, y dice qué falta', () => {
    expect(razonDeshabilitado('retroceder', base({ fase: 'detenida' }), tecla)).toBe(RAZON_RETROCEDER_DETENIDA)
    expect(razonDeshabilitado('retroceder', base({ fase: 'arrancando', retrocesos: 3 }), tecla)).toBe(RAZON_RETROCEDER_DETENIDA)
    expect(razonDeshabilitado('retroceder', base({ fase: 'corriendo', retrocesos: 3 }), tecla)).toBe(RAZON_RETROCEDER_CORRIENDO)
    expect(razonDeshabilitado('retroceder', base({ fase: 'pausada', retrocesos: 3, avanzando: true }), tecla)).toBe(RAZON_RETROCEDER_AVANZANDO)
    expect(razonDeshabilitado('retroceder', base({ fase: 'pausada', retrocesos: 0 }), tecla)).toBe(RAZON_SIN_RETROCESO)
    expect(razonDeshabilitado('retroceder', base({ fase: 'pausada' }), tecla)).toBe(RAZON_SIN_RETROCESO)
    expect(razonDeshabilitado('retroceder', base({ fase: 'pausada', retrocesos: 1 }), tecla)).toBeNull()
    // Avanzar y su menú actúan siempre, salvo arrancando.
    for (const id of ['avanzar', 'avanzar-tiempo', 'avanzar-hasta'] as const) {
      expect(razonDeshabilitado(id, base(), tecla), id).toBeNull()
      expect(razonDeshabilitado(id, base({ fase: 'arrancando' }), tecla), id).toBe(RAZON_ARRANCANDO)
    }
  })

  it('el globo de las flechas dice qué hacen con lo elegido', () => {
    expect(globoDe('avanzar', base({ avanceTexto: '1 ms' }))).toBe('Avanzar: avanza 1 ms')
    expect(globoDe('avanzar', base({ avanceTexto: 'un paso de cálculo (20 µs)' }))).toBe('Avanzar: avanza un paso de cálculo (20 µs)')
    expect(globoDe('retroceder', base())).toBe('Retroceder: regresa al avance anterior')
    expect(globoDe('avanzar-tiempo', base({ avanceTexto: '2 ms' }))).toBe('Cada avance: 2 ms. Elige qué avanza')
    expect(globoDe('guardar', base())).toBeUndefined()
  })

  it('Avanzar en el tiempo abre un menú; Avanzar y Retroceder no, y llevan F6 y Shift+F6', () => {
    expect(conFlecha('avanzar-tiempo')).toBe(true)
    expect(conFlecha('avanzar')).toBe(false)
    expect(conFlecha('retroceder')).toBe(false)
    expect(COMANDOS.avanzar.tecla).toBe('avanzar')
    expect(COMANDOS.retroceder.tecla).toBe('retroceder')
    expect(COMANDOS['avanzar-tiempo'].tecla).toBeUndefined()
    expect([COMANDOS['avanzar-tiempo'].icono, COMANDOS.retroceder.icono, COMANDOS.avanzar.icono]).toEqual(['tiempoAvanza', 'pasoAtras', 'paso'])
  })
})

describe('texto, icono, nombre y pulsado', () => {
  it('Simular cambia con la fase y su icono pasa a Pausa al correr', () => {
    expect(['detenida', 'arrancando', 'corriendo', 'pausada'].map((fase) => textoDe('simular', base({ fase: fase as EstadoCinta['fase'] })))).toEqual(['Simular', 'Arrancando…', 'Pausar', 'Reanudar'])
    expect(iconoDe('simular', base({ fase: 'corriendo' }))).toBe('pausa')
    expect(iconoDe('simular', base({ fase: 'pausada' }))).toBe('simular')
  })

  it('Tema dice el tema de ahora y su nombre accesible lo contiene', () => {
    expect(textoDe('tema', base())).toBe('Claro')
    expect(nombreAccesible('tema', base({ tema: 'oscuro' }))).toBe('Tema oscuro, ahora oscuro')
    expect(iconoDe('tema', base({ tema: 'oscuro' }))).toBe('luna')
    expect(marcado('tema', base({ tema: 'oscuro' }))).toBe(true)
  })

  it('Plegar la cinta dice lo que hará', () => {
    expect(textoDe('plegar-cinta', base())).toBe('Plegar la cinta')
    expect(textoDe('plegar-cinta', base({ plegada: true }))).toBe('Fijar la cinta')
    expect(iconoDe('plegar-cinta', base({ plegada: true }))).toBe('abajo')
  })

  it('pulsado: voltajes solo simulando, paneles y franja según lo que se ve, y nada en una orden simple', () => {
    expect(marcado('voltajes', base({ voltajes: true }))).toBe(false)
    expect(marcado('voltajes', base({ fase: 'corriendo', voltajes: true }))).toBe(true)
    expect(marcado('panel-libreria', base())).toBe(true)
    expect(marcado('panel-libreria', base({ lateral: false }))).toBe(false)
    expect(marcado('panel-proyecto', base())).toBe(false)
    expect(marcado('panel-proyecto', base({ panelDerecho: 'proyecto' }))).toBe(true)
    expect(marcado('panel-proyecto', base({ panelDerecho: 'proyecto', inspector: false }))).toBe(false)
    expect(marcado('panel-mediciones', base({ panelDerecho: 'mediciones' }))).toBe(true)
    expect(marcado('panel-inspector', base())).toBe(true)
    expect(marcado('panel-inspector', base({ panelDerecho: 'mediciones' }))).toBe(false)
    expect(marcado('panel-plantillas', base({ panel: 'plantillas' }))).toBe(true)
    expect(marcado('panel-plantillas', base())).toBe(false)
    expect(marcado('panel-calculadoras', base({ panel: 'calculadoras' }))).toBe(true)
    expect(marcado('panel-calculadoras', base())).toBe(false)
    expect(marcado('panel-inspector', base({ inspector: false }))).toBe(false)
    expect(marcado('franja-registro', base({ franja: 'registro' }))).toBe(true)
    expect(marcado('panel-instrumentos', base({ franja: 'osciloscopio' }))).toBe(true)
    expect(marcado('girar', base())).toBeUndefined()
  })

  it('Todo se llama «Seleccionar todo», que contiene su texto visible', () => {
    expect(textoDe('todo', base())).toBe('Todo')
    expect(nombreAccesible('todo', base())).toBe('Seleccionar todo')
    for (const id of ids) expect(nombreAccesible(id, base()).toLowerCase(), id).toContain(textoDe(id, base()).toLowerCase())
  })

  it('la tecla visible sale del registro o es la fija', () => {
    expect(teclaVisible('girar', tecla)).toBe('R')
    expect(teclaVisible('pantalla-completa', tecla)).toBe('F11')
    expect(teclaVisible('pieza', tecla)).toBe('doble clic')
    expect(teclaVisible('recientes', tecla)).toBeUndefined()
  })

  it('dos estados con los mismos valores son el mismo', () => {
    expect(mismoEstadoCinta(base(), base())).toBe(true)
    expect(mismoEstadoCinta(base(), base({ franja: 'registro' }))).toBe(false)
  })
})

describe('Grabar (v1.2, tarea 20)', () => {
  it('sin grabar es Grabar con su icono rojo; grabando dice «● 00:42», detiene con el clic y queda pulsado; la flecha es un botón aparte', () => {
    const e = base()
    expect(textoDe('grabar', e)).toBe('Grabar')
    expect(iconoDe('grabar', e)).toBe('grabar')
    expect(conFlecha('grabar', e)).toBe(false)
    expect(marcado('grabar', e)).toBe(false)
    const r = base({ grabacion: 'grabando', grabacionSeg: 42 })
    expect([textoDe('grabar', r), nombreAccesible('grabar', r), iconoDe('grabar', r), conFlecha('grabar', r), marcado('grabar', r)]).toEqual(['● 00:42', 'Detener la grabación, 00:42', 'detener', false, true])
    expect(nombreAccesible('grabar', base({ grabacion: 'pausada', grabacionSeg: 3725 }))).toBe('Detener la grabación, en pausa, 1:02:05')
    expect(textoReloj(0)).toBe('00:00')
    expect(textoReloj(59.9)).toBe('00:59')
    expect(textoReloj(600)).toBe('10:00')
    expect(conFlecha('limpio', e)).toBe(false)
    expect(conFlecha('recientes', e)).toBe(true)
  })

  it('Grabar no actúa sin ventana ni mientras se prepara o se guarda; Detener la grabación solo cuando graba', () => {
    expect(razonDeshabilitado('grabar', base({ grabacion: 'no-disponible' }), tecla)).toBe(RAZON_GRABAR_SIN_VENTANA)
    expect(razonDeshabilitado('grabar', base({ grabacion: 'guardando' }), tecla)).toBe(RAZON_GRABAR_OCUPADA)
    for (const g of [undefined, 'inactivo', 'grabando', 'pausada'] as const) expect(razonDeshabilitado('grabar', base({ grabacion: g }), tecla), String(g)).toBeNull()
    expect(razonDeshabilitado('detener-grabacion', base(), tecla)).toBe(RAZON_SIN_GRABACION)
    expect(razonDeshabilitado('detener-grabacion', base({ grabacion: 'no-disponible' }), tecla)).toBe(RAZON_GRABAR_SIN_VENTANA)
    for (const g of ['grabando', 'pausada'] as const) expect(razonDeshabilitado('detener-grabacion', base({ grabacion: g }), tecla)).toBeNull()
  })

  it('grabar no edita el circuito: se puede grabar simulando', () => {
    expect(COMANDOS.grabar.edita).toBeUndefined()
    expect(razonDeshabilitado('grabar', base({ fase: 'corriendo' }), tecla)).toBeNull()
  })
})
