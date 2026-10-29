import { describe, expect, it } from 'vitest'
import { ajustesPorOmision, aplicarParche, ARG_PRUEBAS, argumentoAjustes, leerArgumentos, MAX_RECIENTES, normalizarAjustes } from './ajustes'

describe('ajustes', () => {
  it('por omisión: tema claro, cables verde azulado, librería y paneles abiertos', () => {
    expect(ajustesPorOmision()).toEqual({
      tema: 'claro', colorCables: 'verde', panel: 'libreria', panelDerecho: 'inspector', lateral: true, inspector: true, recientes: [], archivosRecientes: [],
      exportar: { fondo: 'blanco', rejilla: false, escala: 2, pagina: 'ajustar', instrumentos: true, lecturasMedidores: true, coloresVoltaje: false, margenMm: 5, tintaNegra: false },
      figura: { formato: 'png', escala: 2, fuente: 'interfaz', tamañoLetra: 11, tema: 'claro', separadorCsv: 'coma', muestreoCsv: 1, ejes: true, rejilla: true, colores: { A: 'canal-a', B: 'canal-b', C: 'canal-c', D: 'canal-d', M: 'gris' } },
      atajos: {},
      cinta: { plegada: false, pestaña: 'inicio' },
      lienzoSincronizado: true,
      tamañoInterfaz: 100,
      serieComercial: 'E12',
      textoAjuste: 'Valores',
      altoFranja: null,
      simulacion: { corriente: false, animaciones: true, sonido: true, volumen: 50, velocidadFlechas: 1, quemar: false },
      tutorial: { ofertaVista: false, avanzarSolo: true, avance: {} },
      plantillasPlegadas: [],
      libreriaPlegada: [],
      proyectoPlegado: [],
      inspectorDatosPlegado: true,
      numerosPatilla: true,
      ventana: null,
      carpetas: { abrir: null, guardar: null, exportar: null },
      grabacion: { que: 'ventana', calidad: '1080p', microfono: null, resaltarClics: true },
      asistente: { activo: false }
    })
  })

  it('numerosPatilla: visibles la primera vez, lo no booleano se ignora y un parche ajeno lo conserva', () => {
    expect(normalizarAjustes({}).numerosPatilla).toBe(true)
    expect(normalizarAjustes({ numerosPatilla: false }).numerosPatilla).toBe(false)
    expect(normalizarAjustes({ numerosPatilla: 'no' }).numerosPatilla).toBe(true)
    expect(aplicarParche(normalizarAjustes({ numerosPatilla: false }), { tema: 'oscuro' }).numerosPatilla).toBe(false)
  })

  it('inspectorDatosPlegado: plegado la primera vez, lo no booleano se ignora y un parche ajeno lo conserva', () => {
    expect(normalizarAjustes({}).inspectorDatosPlegado).toBe(true)
    expect(normalizarAjustes({ inspectorDatosPlegado: false }).inspectorDatosPlegado).toBe(false)
    expect(normalizarAjustes({ inspectorDatosPlegado: 'no' }).inspectorDatosPlegado).toBe(true)
    expect(aplicarParche(normalizarAjustes({ inspectorDatosPlegado: false }), { tema: 'oscuro' }).inspectorDatosPlegado).toBe(false)
  })

  it('las opciones de grabación: valores válidos, microfono null o texto, un parche parcial conserva el resto', () => {
    expect(normalizarAjustes({}).grabacion).toEqual({ que: 'ventana', calidad: '1080p', microfono: null, resaltarClics: true })
    const base = { ...ajustesPorOmision(), grabacion: { que: 'lienzo' as const, calidad: '720p' as const, microfono: 'mic-1', resaltarClics: false } }
    expect(normalizarAjustes({ grabacion: { que: 'pantalla', calidad: '4k', microfono: 5, resaltarClics: 'si' } }, base).grabacion).toEqual({ que: 'lienzo', calidad: '720p', microfono: null, resaltarClics: false })
    expect(normalizarAjustes({ grabacion: { calidad: 'real' } }, base).grabacion).toEqual({ que: 'lienzo', calidad: 'real', microfono: 'mic-1', resaltarClics: false })
    expect(normalizarAjustes({ grabacion: { microfono: null } }, base).grabacion.microfono).toBeNull()
    expect(normalizarAjustes({ grabacion: { microfono: 'x'.repeat(301) } }, base).grabacion.microfono).toBeNull()
    expect(normalizarAjustes({ grabacion: 7 }, base).grabacion).toEqual(base.grabacion)
  })

  it('la carpeta de grabaciones: ruta absoluta válida o ausente, y la interfaz no la escribe', () => {
    expect('carpetaGrabaciones' in ajustesPorOmision()).toBe(false)
    expect(normalizarAjustes({ carpetaGrabaciones: 'D:\\videos' }).carpetaGrabaciones).toBe('D:\\videos')
    expect(normalizarAjustes({ carpetaGrabaciones: 'relativa' }).carpetaGrabaciones).toBeUndefined()
    expect(normalizarAjustes({ carpetaGrabaciones: 5 }).carpetaGrabaciones).toBeUndefined()
    const base = { ...ajustesPorOmision(), carpetaGrabaciones: 'D:\\videos' }
    expect(normalizarAjustes({}, base).carpetaGrabaciones).toBe('D:\\videos')
    expect(aplicarParche(base, { carpetaGrabaciones: 'D:\\otra' }).carpetaGrabaciones).toBe('D:\\videos')
  })

  it('el asistente nace apagado, un settings.json viejo lo abre apagado y un valor ajeno se descarta', () => {
    expect(ajustesPorOmision().asistente).toEqual({ activo: false })
    expect(normalizarAjustes({ tema: 'oscuro' }).asistente).toEqual({ activo: false })
    expect(normalizarAjustes({ asistente: { activo: true } }).asistente).toEqual({ activo: true })
    expect(normalizarAjustes({ asistente: { activo: 'si' } }).asistente).toEqual({ activo: false })
    expect(normalizarAjustes({ asistente: 7 }).asistente).toEqual({ activo: false })
    const encendido = { ...ajustesPorOmision(), asistente: { activo: true } }
    expect(normalizarAjustes({ asistente: { activo: 3 } }, encendido).asistente).toEqual({ activo: true })
    expect(aplicarParche(encendido, { asistente: { activo: false } }).asistente).toEqual({ activo: false })
  })

  it('la carpeta del asistente: ruta absoluta válida o ausente, y la interfaz no la escribe', () => {
    expect('carpetaAsistente' in ajustesPorOmision()).toBe(false)
    expect(normalizarAjustes({ carpetaAsistente: 'D:\\circuitos' }).carpetaAsistente).toBe('D:\\circuitos')
    expect(normalizarAjustes({ carpetaAsistente: 'relativa' }).carpetaAsistente).toBeUndefined()
    expect(normalizarAjustes({ carpetaAsistente: 5 }).carpetaAsistente).toBeUndefined()
    const base = { ...ajustesPorOmision(), carpetaAsistente: 'D:\\circuitos' }
    expect(normalizarAjustes({}, base).carpetaAsistente).toBe('D:\\circuitos')
    expect(aplicarParche(base, { carpetaAsistente: 'D:\\otra' }).carpetaAsistente).toBe('D:\\circuitos')
  })

  it('las categorías de plantillas plegadas: solo textos válidos, sin repetir, con tope; un parche las reemplaza', () => {
    expect(normalizarAjustes({ plantillasPlegadas: ['Filtros', 'Filtros', 'Incluidas', 3, '', 'x'.repeat(81)] }).plantillasPlegadas).toEqual(['Filtros', 'Incluidas'])
    expect(normalizarAjustes({ plantillasPlegadas: 'Filtros' }).plantillasPlegadas).toEqual([])
    expect(normalizarAjustes({ plantillasPlegadas: Array.from({ length: 300 }, (_, i) => `c${i}`) }).plantillasPlegadas).toHaveLength(101)
    const base = { ...ajustesPorOmision(), plantillasPlegadas: ['A'] }
    expect(aplicarParche(base, { plantillasPlegadas: ['B'] }).plantillasPlegadas).toEqual(['B'])
    expect(aplicarParche(base, { tema: 'oscuro' }).plantillasPlegadas).toEqual(['A'])
  })

  it('el panel de plantillas es uno de los paneles del riel', () => {
    expect(normalizarAjustes({ panel: 'plantillas' }).panel).toBe('plantillas')
  })

  it('el alto de la franja: null hasta que se arrastra; solo un número de 150 a 4,000 px vale', () => {
    expect(normalizarAjustes({ altoFranja: 320 }).altoFranja).toBe(320)
    expect(normalizarAjustes({ altoFranja: 320.6 }).altoFranja).toBe(321)
    expect(normalizarAjustes({ altoFranja: 90 }).altoFranja).toBeNull()
    expect(normalizarAjustes({ altoFranja: '320' }).altoFranja).toBeNull()
    expect(aplicarParche({ ...ajustesPorOmision(), altoFranja: 260 }, { altoFranja: Number.NaN }).altoFranja).toBe(260)
    expect(aplicarParche({ ...ajustesPorOmision(), altoFranja: 260 }, { altoFranja: null }).altoFranja).toBeNull()
  })

  it('el tamaño de la interfaz: 100 % por omisión; solo los pasos de 80 a 150 valen y lo demás toma lo de antes', () => {
    expect(ajustesPorOmision().tamañoInterfaz).toBe(100)
    expect(normalizarAjustes({ tamañoInterfaz: 125 }).tamañoInterfaz).toBe(125)
    expect(normalizarAjustes({ tamañoInterfaz: 130 }).tamañoInterfaz).toBe(100)
    expect(aplicarParche({ ...ajustesPorOmision(), tamañoInterfaz: 90 }, { tamañoInterfaz: '150' }).tamañoInterfaz).toBe(90)
  })

  it('la serie comercial: E12 por omisión; solo E6, E12, E24 y libre valen y lo demás toma lo de antes', () => {
    expect(ajustesPorOmision().serieComercial).toBe('E12')
    expect(normalizarAjustes({ serieComercial: 'E24' }).serieComercial).toBe('E24')
    expect(normalizarAjustes({ serieComercial: 'libre' }).serieComercial).toBe('libre')
    expect(normalizarAjustes({ serieComercial: 'E96' }).serieComercial).toBe('E12')
    expect(aplicarParche({ ...ajustesPorOmision(), serieComercial: 'E6' }, { serieComercial: 7 }).serieComercial).toBe('E6')
    const { serieComercial: _sin, ...viejos } = ajustesPorOmision()
    expect(normalizarAjustes(viejos).serieComercial).toBe('E12')
  })

  it('el texto del ajuste: Valores por omisión; solo Ajuste, Valores, Ambos y Nada valen y lo demás toma lo de antes', () => {
    expect(ajustesPorOmision().textoAjuste).toBe('Valores')
    expect(normalizarAjustes({ textoAjuste: 'Ambos' }).textoAjuste).toBe('Ambos')
    expect(normalizarAjustes({ textoAjuste: 'Nada' }).textoAjuste).toBe('Nada')
    expect(normalizarAjustes({ textoAjuste: 'Todo' }).textoAjuste).toBe('Valores')
    expect(aplicarParche({ ...ajustesPorOmision(), textoAjuste: 'Ajuste' }, { textoAjuste: 3 }).textoAjuste).toBe('Ajuste')
    const { textoAjuste: _sin, ...viejos } = ajustesPorOmision()
    expect(normalizarAjustes(viejos).textoAjuste).toBe('Valores')
  })

  it('el dibujo del lienzo sincronizado: un booleano, encendido por omisión; lo que no lo es toma lo de antes', () => {
    expect(normalizarAjustes({ lienzoSincronizado: false }).lienzoSincronizado).toBe(false)
    expect(normalizarAjustes({ lienzoSincronizado: 'no' }).lienzoSincronizado).toBe(true)
    expect(aplicarParche(normalizarAjustes({ lienzoSincronizado: false }), { tema: 'oscuro' }).lienzoSincronizado).toBe(false)
  })

  it('la cinta: plegada y pestaña válidas; lo inválido toma lo de antes y un parche con una clave conserva la otra', () => {
    expect(normalizarAjustes({ cinta: { plegada: true, pestaña: 'vista' } }).cinta).toEqual({ plegada: true, pestaña: 'vista' })
    expect(normalizarAjustes({ cinta: { plegada: 'sí', pestaña: 'otra' } }).cinta).toEqual({ plegada: false, pestaña: 'inicio' })
    expect(normalizarAjustes({ cinta: { plegada: false, pestaña: 'ayuda' } }).cinta).toEqual({ plegada: false, pestaña: 'ayuda' })
    expect(normalizarAjustes({ cinta: 'plegada' }).cinta).toEqual({ plegada: false, pestaña: 'inicio' })
    // La pestaña Instrumentos ya no existe: guardada, se lee como Simulación.
    // Simulación y Análisis ya no son pestañas; una guardada así abre en Inicio.
    expect(normalizarAjustes({ cinta: { plegada: false, pestaña: 'instrumentos' } }).cinta).toEqual({ plegada: false, pestaña: 'inicio' })
    expect(normalizarAjustes({ cinta: { plegada: false, pestaña: 'analisis' } }).cinta.pestaña).toBe('inicio')
    const base = normalizarAjustes({ cinta: { plegada: true, pestaña: 'ayuda' } })
    expect(aplicarParche(base, { cinta: { pestaña: 'vista' } }).cinta).toEqual({ plegada: true, pestaña: 'vista' })
    expect(aplicarParche(base, { tema: 'oscuro' }).cinta).toEqual(base.cinta)
  })

  it('el tutorial: la oferta y el avance por capítulo; lo inválido se descarta y un parche conserva lo que no trae', () => {
    // El avance de los cinco capítulos de antes se descarta sin error: sus pasos ya no son los mismos.
    const antes = normalizarAjustes({ tutorial: { ofertaVista: true, avance: { 'primer-circuito': { paso: 9, hecho: true }, medir: { paso: 4, hecho: true }, senales: { paso: 8, hecho: true }, archivo: { paso: 4, hecho: true }, trucos: { paso: 2, hecho: false } } } })
    expect(antes.tutorial).toEqual({ ofertaVista: true, avanzarSolo: true, avance: {} })
    const a = normalizarAjustes({ tutorial: { ofertaVista: true, avance: { circuito: { paso: 3, hecho: false }, 'Mal id': { paso: 1, hecho: true }, 'medir-senales': { paso: 1.5, hecho: true }, analizar: { paso: 100, hecho: true }, conoce: { paso: -1, hecho: true } } } })
    expect(a.tutorial).toEqual({ ofertaVista: true, avanzarSolo: true, avance: { circuito: { paso: 3, hecho: false }, analizar: { paso: 99, hecho: true } } })
    expect(aplicarParche(a, { tutorial: { ofertaVista: false } }).tutorial).toEqual({ ofertaVista: false, avanzarSolo: true, avance: a.tutorial.avance })
    expect(aplicarParche(a, { tutorial: { avance: { analizar: { paso: 0, hecho: true } } } }).tutorial).toEqual({ ofertaVista: true, avanzarSolo: true, avance: { analizar: { paso: 0, hecho: true } } })
    expect(aplicarParche(a, { tema: 'oscuro' }).tutorial).toEqual(a.tutorial)
    expect(normalizarAjustes({ tutorial: 'x' }).tutorial).toEqual({ ofertaVista: false, avanzarSolo: true, avance: {} })
    expect(normalizarAjustes({ tutorial: { avanzarSolo: false } }).tutorial.avanzarSolo).toBe(false)
    expect(aplicarParche(a, { tutorial: { ofertaVista: true } }).tutorial.avanzarSolo).toBe(true)
  })

  it('el avance de ids desconocidos no cuenta contra el tope de capítulos', () => {
    const avance: Record<string, unknown> = {}
    for (let i = 0; i < 20; i++) avance[`falso-${i}`] = { paso: 1, hecho: true }
    avance.analizar = { paso: 2, hecho: false }
    expect(normalizarAjustes({ tutorial: { avance } }).tutorial.avance).toEqual({ analizar: { paso: 2, hecho: false } })
  })

  it('los atajos guardados: ids válidos, hasta cuatro teclas de texto sin repetir; un parche los reemplaza', () => {
    const a = normalizarAjustes({ atajos: { girar: ['Ctrl+R', 'Ctrl+R', 7, '', 'Q', 'W', 'E', 'T'], 'Mal id': ['X'], tierra: 'G', nota: [] } })
    expect(a.atajos).toEqual({ girar: ['Ctrl+R', 'Q', 'W', 'E'], nota: [] })
    expect(aplicarParche(a, { atajos: { tierra: ['Shift+G'] } }).atajos).toEqual({ tierra: ['Shift+G'] })
    expect(aplicarParche(a, { tema: 'oscuro' }).atajos).toEqual(a.atajos)
    expect(normalizarAjustes({ atajos: 'x' }).atajos).toEqual({})
  })

  it('descarta teclas con espacios o caracteres de control', () => {
    expect(normalizarAjustes({ atajos: { girar: ['Ctrl R', 'A\nB', 'x'.repeat(33), 'Ctrl+R'] } }).atajos).toEqual({ girar: ['Ctrl+R'] })
  })

  it('como mucho doscientos comandos con teclas propias', () => {
    const muchos = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`c${i}`, ['F1']]))
    expect(Object.keys(normalizarAjustes({ atajos: muchos }).atajos)).toHaveLength(200)
  })

  it('lo que no es un objeto da los ajustes por omisión', () => {
    for (const v of [null, undefined, 5, 'oscuro', [], true]) expect(normalizarAjustes(v)).toEqual(ajustesPorOmision())
  })

  it('cada clave inválida toma su valor por omisión y las desconocidas se descartan', () => {
    const a = normalizarAjustes({ tema: 'oscuro', colorCables: 'rojo', panel: 'calculadoras', panelDerecho: 'mediciones', lateral: 'no', inspector: false, extra: 1 })
    expect(a).toEqual({ ...ajustesPorOmision(), tema: 'oscuro', colorCables: 'verde', panel: 'calculadoras', panelDerecho: 'mediciones', lateral: true, inspector: false, recientes: [] })
  })

  it('un fondo «tema» de antes pasa al tema de la aplicación y queda explícito', () => {
    expect(normalizarAjustes({ tema: 'oscuro', exportar: { fondo: 'tema' } }).exportar.fondo).toBe('oscuro')
    expect(normalizarAjustes({ tema: 'claro', exportar: { fondo: 'tema' } }).exportar.fondo).toBe('papel')
    expect(normalizarAjustes({ tema: 'oscuro', exportar: { fondo: 'papel' } }).exportar.fondo).toBe('papel')
  })

  it('el tema de una figura se valida y el fondo de un settings.json anterior se migra', () => {
    const base = ajustesPorOmision()
    expect(aplicarParche(base, { figura: { tema: 'oscuro' } }).figura.tema).toBe('oscuro')
    expect(normalizarAjustes({ figura: { fondo: 'blanco' } }).figura.tema).toBe('claro')
    expect(normalizarAjustes({ figura: { fondo: 'tema' } }).figura.tema).toBe('app')
    expect(normalizarAjustes({ figura: { fondo: 'tema', tema: 'oscuro' } }).figura.tema).toBe('oscuro')
    expect(normalizarAjustes({ figura: { tema: 'verde' } }).figura.tema).toBe('claro')
  })

  it('el separador y el muestreo del CSV se validan', () => {
    const base = ajustesPorOmision()
    expect(aplicarParche(base, { figura: { separadorCsv: 'tab', muestreoCsv: 10 } }).figura).toMatchObject({ separadorCsv: 'tab', muestreoCsv: 10 })
    expect(aplicarParche(base, { figura: { separadorCsv: 'pipe', muestreoCsv: 7 } }).figura).toMatchObject({ separadorCsv: 'coma', muestreoCsv: 1 })
  })

  it('el panel Calculadoras se recuerda y uno desconocido vuelve a la Librería', () => {
    expect(normalizarAjustes({ panel: 'calculadoras' }).panel).toBe('calculadoras')
    expect(normalizarAjustes({ panel: 'nada' }).panel).toBe('libreria')
  })

  it('el panel derecho: Inspector, Mediciones o Proyecto; uno desconocido vuelve al Inspector', () => {
    for (const p of ['inspector', 'mediciones', 'proyecto'] as const) expect(normalizarAjustes({ panelDerecho: p }).panelDerecho).toBe(p)
    expect(normalizarAjustes({ panelDerecho: 'libreria' }).panelDerecho).toBe('inspector')
  })

  it('un settings.json anterior con Proyecto o Mediciones en el riel izquierdo los pasa al derecho', () => {
    const a = normalizarAjustes({ panel: 'proyecto' })
    expect(a.panel).toBe('libreria')
    expect(a.panelDerecho).toBe('proyecto')
    expect(normalizarAjustes({ panel: 'mediciones' }).panelDerecho).toBe('mediciones')
    // Si ya trae el panel derecho, ese manda.
    expect(normalizarAjustes({ panel: 'mediciones', panelDerecho: 'inspector' }).panelDerecho).toBe('inspector')
  })

  it('esa migración abre el panel derecho solo si el lateral antiguo estaba abierto', () => {
    expect(normalizarAjustes({ panel: 'proyecto', lateral: true, inspector: false })).toMatchObject({ panelDerecho: 'proyecto', inspector: true })
    expect(normalizarAjustes({ panel: 'mediciones', lateral: true, inspector: false })).toMatchObject({ panelDerecho: 'mediciones', inspector: true })
    expect(normalizarAjustes({ panel: 'proyecto', lateral: false, inspector: false }).inspector).toBe(false)
    expect(normalizarAjustes({ panel: 'proyecto', lateral: true, panelDerecho: 'inspector', inspector: false }).inspector).toBe(false)
  })

  it('las secciones del Proyecto plegadas: textos válidos, sin repetir, con tope; un parche las reemplaza', () => {
    expect(normalizarAjustes({ libreriaPlegada: ['digitales/Compuertas', 'digitales/Compuertas', 3, ''] }).libreriaPlegada).toEqual(['digitales/Compuertas'])
    expect(normalizarAjustes({ libreriaPlegada: 'x' }).libreriaPlegada).toEqual([])
    expect(normalizarAjustes({ proyectoPlegado: ['piezas', 'piezas', 'redes', 3, '', 'x'.repeat(81)] }).proyectoPlegado).toEqual(['piezas', 'redes'])
    expect(normalizarAjustes({ proyectoPlegado: 'piezas' }).proyectoPlegado).toEqual([])
    const base = { ...ajustesPorOmision(), proyectoPlegado: ['piezas'] }
    expect(aplicarParche(base, { proyectoPlegado: ['redes'] }).proyectoPlegado).toEqual(['redes'])
    expect(aplicarParche(base, { tema: 'oscuro' }).proyectoPlegado).toEqual(['piezas'])
  })

  it('un parche solo cambia sus claves válidas', () => {
    const base = { ...ajustesPorOmision(), tema: 'oscuro' as const, recientes: ['led'] }
    expect(aplicarParche(base, { colorCables: 'azul' })).toEqual({ ...base, colorCables: 'azul' })
    expect(aplicarParche(base, { tema: 'sepia' })).toEqual(base)
  })

  it('las recientes son ids de texto sin repetir, como máximo ocho', () => {
    const ids = ['r', 'led', 'r', 7, '', 'x'.repeat(65), 'a', 'b', 'c', 'd', 'e', 'f', 'g']
    const a = normalizarAjustes({ recientes: ids })
    expect(a.recientes).toEqual(['r', 'led', 'a', 'b', 'c', 'd', 'e', 'f'])
    expect(a.recientes).toHaveLength(MAX_RECIENTES)
  })

  it('las recientes no comparten arreglo con la base y un arreglo enorme se corta a tiempo', () => {
    const base = { ...ajustesPorOmision(), recientes: ['led'] }
    const a = normalizarAjustes({}, base)
    expect(a.recientes).toEqual(['led'])
    expect(a.recientes).not.toBe(base.recientes)
    const enorme = Array.from({ length: 2_000_000 }, (_, i) => `id${i}`)
    expect(normalizarAjustes({ recientes: enorme }).recientes).toHaveLength(MAX_RECIENTES)
  })

  it('solo lee claves propias, no heredadas', () => {
    const heredado = Object.create({ tema: 'oscuro', lateral: false })
    expect(normalizarAjustes(heredado)).toEqual(ajustesPorOmision())
  })

  it('los argumentos de la ventana van y vuelven idénticos', () => {
    const a = { ...ajustesPorOmision(), tema: 'oscuro' as const, recientes: ['fuente-dc'] }
    expect(leerArgumentos(['electron', argumentoAjustes(a)])).toEqual({ ajustes: a, pruebas: false })
    expect(leerArgumentos([argumentoAjustes(a), ARG_PRUEBAS]).pruebas).toBe(true)
  })

  it('un argumento dañado o ausente da los ajustes por omisión', () => {
    expect(leerArgumentos(['--kirchi-ajustes=%7Bno-json']).ajustes).toEqual(ajustesPorOmision())
    expect(leerArgumentos([]).ajustes).toEqual(ajustesPorOmision())
  })

  it('los archivos recientes son rutas de texto sin repetir, como máximo diez', () => {
    const rutas = ['C:\\a.kir', 'C:\\a.kir', '', 5, 'x'.repeat(4097), ...Array.from({ length: 12 }, (_, i) => `/c/${i}.kir`)]
    const a = normalizarAjustes({ archivosRecientes: rutas })
    expect(a.archivosRecientes).toEqual(['C:\\a.kir',...Array.from({ length: 9 }, (_, i) => `/c/${i}.kir`)])
  })

  it('un settings.json alterado no mete en Recientes rutas relativas, sin .kir o con caracteres nulos', () => {
    const malas = ['relativa.kir', 'C:\\Windows\\win.ini', '/etc/passwd', 'C:\\a\0.kir', '/b\0.kir', 'C:sin-barra.kir', '..\\x.kir']
    const a = normalizarAjustes({ archivosRecientes: [...malas, 'C:\\ok.kir', '/home/ana/ok.KIR', '\\\\nas\\clase\\p.kir'] })
    expect(a.archivosRecientes).toEqual(['C:\\ok.kir', '/home/ana/ok.KIR', '\\\\nas\\clase\\p.kir'])
  })

  it('la interfaz no puede escribir los archivos recientes: solo el proceso principal', () => {
    const base = { ...ajustesPorOmision(), archivosRecientes: ['C:\\a.kir'] }
    expect(aplicarParche(base, { archivosRecientes: ['C:\\Windows\\win.ini'], tema: 'oscuro' })).toEqual({ ...base, tema: 'oscuro' })
    expect(normalizarAjustes({ archivosRecientes: ['C:\\b.kir'] }, base).archivosRecientes).toEqual(['C:\\b.kir'])
  })

  it('el estado de la ventana: solo el proceso principal lo escribe y un valor alterado se descarta', () => {
    const v = { x: 10, y: 20, ancho: 1000, alto: 700, maximizada: true, pantallaCompleta: false }
    const base = { ...ajustesPorOmision(), ventana: v }
    expect(aplicarParche(base, { ventana: { ...v, x: 5 }, tema: 'oscuro' })).toEqual({ ...base, tema: 'oscuro' })
    expect(normalizarAjustes({ ventana: { ...v, x: 5 } }, base).ventana).toEqual({ ...v, x: 5 })
    expect(normalizarAjustes({ ventana: 'grande' }, base).ventana).toBeNull()
    expect(normalizarAjustes({ tema: 'oscuro' }, base).ventana).toEqual(v)
  })

  it('las carpetas de los diálogos: rutas absolutas válidas, un parche parcial conserva las otras y la interfaz no las escribe', () => {
    const base = { ...ajustesPorOmision(), carpetas: { abrir: 'C:\\a', guardar: '/home/ana', exportar: null } }
    expect(normalizarAjustes({ carpetas: { abrir: 'relativa', guardar: 5, exportar: 'C:\\x\0y' } }, base).carpetas).toEqual({ abrir: null, guardar: null, exportar: null })
    expect(normalizarAjustes({ carpetas: { exportar: 'D:\\fotos' } }, base).carpetas).toEqual({ abrir: 'C:\\a', guardar: '/home/ana', exportar: 'D:\\fotos' })
    expect(normalizarAjustes({ carpetas: 'x' }, base).carpetas).toEqual({ abrir: 'C:\\a', guardar: '/home/ana', exportar: null })
    expect(aplicarParche(base, { carpetas: { abrir: 'C:\\Windows' }, tema: 'oscuro' })).toEqual({ ...base, tema: 'oscuro' })
  })

  it('las opciones de una figura se validan una por una, los colores solo son tonos de la lista y un parche conserva lo demás', () => {
    const base = ajustesPorOmision()
    expect(aplicarParche(base, { figura: { formato: 'svg', tamañoLetra: 13 } }).figura).toMatchObject({ formato: 'svg', tamañoLetra: 13, escala: 2, fuente: 'interfaz', ejes: true })
    // Valores fuera de lista, de rango o de otro tipo se descartan.
    expect(aplicarParche(base, { figura: { formato: 'bmp', escala: 5, fuente: 'comic', tamañoLetra: 40, tema: 'rojo', fondo: 'rojo', ejes: 'sí', rejilla: 0 } }).figura).toEqual(base.figura)
    expect(aplicarParche(base, { figura: { tamañoLetra: 10.5 } }).figura.tamañoLetra).toBe(11)
    // Un color es el nombre de un tono: nunca un valor escrito (#ff0000, rgb()) ni una serie con nombre raro.
    const c = aplicarParche(base, { figura: { colores: { A: 'naranja', B: '#ff0000', C: 'rgb(1,2,3)', 'a b': 'gris', __proto__: 'gris', E: 'magenta' } } }).figura.colores
    expect(c).toEqual({ A: 'naranja', B: 'canal-b', C: 'canal-c', D: 'canal-d', M: 'gris', E: 'magenta' })
    // Con tope de series.
    const muchas = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`S${i}`, 'gris']))
    expect(Object.keys(aplicarParche(base, { figura: { colores: muchas } }).figura.colores)).toHaveLength(16)
  })

  it('un settings.json de antes con sinInstrumentos pasa a instrumentos invertido y el resto toma sus valores por omisión', () => {
    expect(normalizarAjustes({ exportar: { sinInstrumentos: true } }).exportar).toEqual({ fondo: 'blanco', rejilla: false, escala: 2, pagina: 'ajustar', instrumentos: false, lecturasMedidores: true, coloresVoltaje: false, margenMm: 5, tintaNegra: false })
    expect(normalizarAjustes({ exportar: { sinInstrumentos: false } }).exportar.instrumentos).toBe(true)
  })

  it('las opciones de exportar se validan una por una y un parche parcial conserva las demás', () => {
    const base = { ...ajustesPorOmision(), exportar: { fondo: 'blanco' as const, rejilla: true, escala: 4 as const, pagina: 'a4' as const, instrumentos: false, lecturasMedidores: true, coloresVoltaje: true, margenMm: 8, tintaNegra: true } }
    expect(aplicarParche(base, { exportar: { escala: 1 } }).exportar).toEqual({ fondo: 'blanco', rejilla: true, escala: 1, pagina: 'a4', instrumentos: false, lecturasMedidores: true, coloresVoltaje: true, margenMm: 8, tintaNegra: true })
    expect(aplicarParche(base, { exportar: { instrumentos: 'sí' } }).exportar.instrumentos).toBe(false)
    expect(aplicarParche(base, { exportar: { instrumentos: true } }).exportar.instrumentos).toBe(true)
    expect(aplicarParche(base, { exportar: { margenMm: 99 } }).exportar.margenMm).toBe(30)
    expect(aplicarParche(base, { exportar: { margenMm: -3 } }).exportar.margenMm).toBe(0)
    expect(aplicarParche(base, { exportar: { margenMm: 'x' } }).exportar.margenMm).toBe(8)
    expect(aplicarParche(base, { exportar: { fondo: 'rosa', rejilla: 'sí', escala: 8, pagina: 'oficio' } }).exportar).toEqual(base.exportar)
    expect(normalizarAjustes({ exportar: 3 }).exportar).toEqual(ajustesPorOmision().exportar)
  })

  it('la simulación se lee de un settings.json anterior con lo de omisión y se rechaza fuera de rango sin abortar', () => {
    // Un settings.json no trae la clave: todo de omisión.
    expect(normalizarAjustes({ tema: 'oscuro' }).simulacion).toEqual(ajustesPorOmision().simulacion)
    const a = normalizarAjustes({ simulacion: { corriente: true, volumen: 80.4, velocidadFlechas: 2 } })
    expect(a.simulacion).toEqual({ corriente: true, animaciones: true, sonido: true, volumen: 80, velocidadFlechas: 2, quemar: false })
    const malo = normalizarAjustes({ simulacion: { volumen: 140, velocidadFlechas: 0.1, sonido: 'no', quemar: 1 } })
    expect(malo.simulacion).toEqual(ajustesPorOmision().simulacion)
    // Un parche con una sola clave conserva las demás.
    expect(aplicarParche(a, { simulacion: { sonido: false } }).simulacion).toEqual({ ...a.simulacion, sonido: false })
    expect(normalizarAjustes({ simulacion: 'x' }).simulacion).toEqual(ajustesPorOmision().simulacion)
  })
})
