import { MM_POR_UNIDAD } from '../doc/tipos'
import { anchoEnEm } from '../lienzo/metricas'
import { ERRORES_FAMILIAS } from '../netlist/familias'
import { svgAGeometria } from './svg'
import { capasDeAnimacion, type Caja, type Geometria, type PiezaDef, type Rotulo } from './tipos'
import { validarPieza, type Validacion } from './validar'

/** Amplía la caja del símbolo con sus rótulos si se salen. Al girar la pieza un rótulo cambia de lado (el texto no gira),
 * así que se toma el peor caso: el ancho completo del texto hacia cada eje. */
function ampliarConRotulos(caja: Caja, rotulos: Rotulo[]): Caja {
  let { minX, minY, maxX, maxY } = caja
  for (const r of rotulos) {
    const alto = r.tam / MM_POR_UNIDAD
    const w = anchoEnEm(r.texto, { fuente: r.fuente, negrita: false, cursiva: false }) * alto
    const medio = r.alinear === 'centro' ? Math.max(w, alto) / 2 : Math.max(w, alto)
    minX = Math.min(minX, r.x - medio)
    maxX = Math.max(maxX, r.x + medio)
    minY = Math.min(minY, r.y - medio)
    maxY = Math.max(maxY, r.y + medio)
  }
  return { minX, minY, maxX, maxY }
}

const unir = (a: Caja, b: Caja): Caja => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) })

/** Lo que está mal entre capas del símbolo y su animación (null si nada): capa faltante, capa que ninguna animación usa, o
 * dos estados de un contacto con trazos distintos (el recorrido de 60 ms interpola punto a punto). */
export function problemaDeCapas(g: Geometria, animacion: PiezaDef['animacion']): string | null {
  const pide = capasDeAnimacion(animacion)
  const tiene = Object.keys(g.capas ?? {})
  for (const c of pide) if (!tiene.includes(c)) return `falta la capa «${c}» que pide su animación «${animacion!.tipo}»`
  for (const c of tiene) if (!pide.includes(c)) return `tiene la capa «${c}» y ninguna animación la usa`
  if (animacion?.tipo === 'contacto') {
    const [a, b] = pide.map((c) => g.capas![c])
    const forma = (x: Geometria) => `${x.trazos.map((t) => t.length).join(',')}|${x.rellenos.length}`
    if (forma(a) !== forma(b)) return `las capas «${pide[0]}» y «${pide[1]}» deben tener los mismos trazos con el mismo número de puntos`
  }
  return null
}

export interface Libreria {
  piezas: Map<string, PiezaDef>
  errores: string[]
}

/** `archivos`: ruta → contenido; cada pieza es una carpeta con pieza.json y simbolo.svg. */
export function cargarLibreria(archivos: Record<string, string>): Libreria {
  const carpetas = new Map<string, { json?: string; rutaJson?: string; svg?: string; accionado?: string; otros?: Record<string, string> }>()
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const r = ruta.replace(/\\/g, '/')
    const i = r.lastIndexOf('/')
    const dir = r.slice(0, i), nombre = r.slice(i + 1)
    const c = carpetas.get(dir) ?? {}
    if (nombre === 'pieza.json') {
      c.json = contenido
      c.rutaJson = r
    } else if (nombre === 'simbolo.svg') c.svg = contenido
    else if (nombre === 'accionado.svg') c.accionado = contenido
    else if (/^simbolo-[a-z0-9-]+\.svg$/.test(nombre)) c.otros = { ...c.otros, [nombre]: contenido }
    else continue
    carpetas.set(dir, c)
  }
  const piezas = new Map<string, PiezaDef>()
  const errores: string[] = []
  for (const dir of [...carpetas.keys()].sort()) {
    const c = carpetas.get(dir)!
    const carpeta = dir.slice(dir.lastIndexOf('/') + 1)
    if (!c.json) {
      errores.push(`${dir}: falta pieza.json`)
      continue
    }
    let v: Validacion
    try {
      v = validarPieza(c.json, c.rutaJson!)
    } catch (e) {
      errores.push(`${c.rutaJson}: error inesperado: ${(e as Error).message}`)
      continue
    }
    if (!v.ok) {
      errores.push(...v.errores)
      continue
    }
    if (v.def.id !== carpeta) {
      errores.push(`${c.rutaJson}: id «${v.def.id}» no coincide con la carpeta «${carpeta}»`)
      continue
    }
    if (!c.svg) {
      errores.push(`${dir}: falta simbolo.svg`)
      continue
    }
    let geometria: Geometria
    try {
      geometria = svgAGeometria(c.svg)
    } catch (e) {
      errores.push(`${dir}/simbolo.svg: ${(e as Error).message}`)
      continue
    }
    if (piezas.has(v.def.id)) {
      errores.push(`${c.rutaJson}: id repetido «${v.def.id}»`)
      continue
    }
    // El dibujo accionado (un botón presionado, un interruptor cerrado) es opcional y conserva la caja del símbolo.
    let geometriaAccionada: Geometria | undefined
    if (c.accionado !== undefined) {
      if (v.def.modelo?.tipo !== 'interruptor') {
        errores.push(`${dir}/accionado.svg: solo lo usan las piezas con modelo interruptor`)
        continue
      }
      try {
        geometriaAccionada = svgAGeometria(c.accionado)
        if (geometriaAccionada.capas) throw new Error('no lleva capas (data-capa): las capas van en simbolo.svg')
      } catch (e) {
        errores.push(`${dir}/accionado.svg: ${(e as Error).message}`)
        continue
      }
    }
    // Las capas del símbolo son las que pide su animación, ni una más ni una menos.
    const problema = c.accionado !== undefined && v.def.animacion?.tipo === 'contacto' ? 'accionado.svg y la animación «contacto» dibujan lo mismo: usa uno de los dos' : problemaDeCapas(geometria, v.def.animacion)
    // El cursor recorre el dibujo: sus extremos quedan dentro de la caja del símbolo.
    const cursor = v.def.animacion?.tipo === 'cursor' ? v.def.animacion : null
    const problemaCursor = cursor && (cursor.desde < geometria.caja.minX || cursor.hasta > geometria.caja.maxX) ? `animacion: desde y hasta del cursor (${cursor.desde} y ${cursor.hasta}) deben quedar dentro del dibujo, de ${geometria.caja.minX} a ${geometria.caja.maxX}` : null
    if (problema || problemaCursor) {
      errores.push(problema ? `${dir}/simbolo.svg: ${problema}` : `${c.rutaJson}: ${problemaCursor}`)
      continue
    }
    // La caja del símbolo cubre también lo que dibujan sus capas (el cursor recorre el cuerpo, el rotor gira dentro).
    for (const c of Object.values(geometria.capas ?? {})) geometria = { ...geometria, caja: unir(geometria.caja, c.caja) }
    // El símbolo de siempre lleva las capas en reposo; la parte fija queda aparte para la escena y la capa de movimiento.
    if (geometria.capas) {
      const capas = geometria.capas
      const pide = capasDeAnimacion(v.def.animacion)
      const reposo = v.def.animacion?.tipo === 'contacto' ? pide.slice(0, 1) : pide
      geometria = {
        ...geometria,
        fija: { trazos: geometria.trazos, rellenos: geometria.rellenos },
        trazos: [...geometria.trazos, ...reposo.flatMap((c) => capas[c].trazos)],
        rellenos: [...geometria.rellenos, ...reposo.flatMap((c) => capas[c].rellenos)]
      }
    }
    if (v.def.rotulos) geometria = { ...geometria, caja: ampliarConRotulos(geometria.caja, v.def.rotulos) }
    const { variantes: archivosVariantes, ...resto } = v.def
    let variantes: PiezaDef['variantes']
    if (archivosVariantes) {
      const geometrias: Record<string, Geometria> = {}
      let falta: string | null = null
      for (const [opcion, archivo] of Object.entries(archivosVariantes.simbolos)) {
        const svg = c.otros?.[archivo]
        if (svg === undefined) {
          falta = `${dir}: falta ${archivo} (variante «${opcion}» de ${archivosVariantes.prop})`
          break
        }
        try {
          geometrias[opcion] = svgAGeometria(svg)
          if (geometrias[opcion].capas) throw new Error('no lleva capas (data-capa): las capas van en simbolo.svg')
        } catch (e) {
          falta = `${dir}/${archivo}: ${(e as Error).message}`
          break
        }
      }
      if (falta) {
        errores.push(falta)
        continue
      }
      variantes = { prop: archivosVariantes.prop, geometrias }
    }
    piezas.set(v.def.id, {
      ...resto,
      geometria,
      ...(variantes ? { variantes } : {}),
      ...(geometriaAccionada ? { geometriaAccionada: { ...geometriaAccionada, caja: geometria.caja } } : {})
    })
  }
  // Un error en componentes/familias-logicas.json se ve en el Registro al arrancar, como los de las piezas.
  errores.push(...ERRORES_FAMILIAS)
  return { piezas, errores }
}
