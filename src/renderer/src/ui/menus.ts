import { carpetaDeRuta, nombreDeRuta, type FormatoExportar } from '../../../compartido/archivos'
import { GROSORES, NOMBRE_FIGURA, OPACIDADES, PUNTAS, TRAZOS_FIGURA, type EstiloFigura } from '../doc/figuras'
import type { Documento, Pieza } from '../doc/tipos'
import type { ObjetivoMenu } from '../editor/Editor'
import { textoDeValor } from '../lienzo/etiquetas'
import type { PiezaDef } from '../piezas/tipos'
import { ALINEACIONES, CONTORNOS, FUENTES, NOMBRE_ALINEACION, NOMBRE_CONTORNO, nombreContorno, NOMBRE_FUENTE, NOMBRE_TINTA, textoTam, TINTAS, type Alineacion, type Contorno } from '../doc/formato'
import type { Fuente, Grosor, Opacidad, Punta, Tinta, Trazo } from '../doc/tipos'
import type { VistaFigura } from './vistaFigura'
import type { OrdenFormato, VistaFormato } from './vistaFormato'
import { COMANDOS, FIGURA_DE_COMANDO, textoMenu, type IdComando, type IdDeFigura, type IdDeMenuDeCinta } from './cinta/comandos'
import { ENTRADAS_MENU } from './cinta/modelo'
import type { NombreIcono } from './cinta/trazos'
import { CANALES, type Canal } from '../instrumentos/ajustes'
import type { Conexiones } from '../conexiones/conexiones'
import { sondaDeEntrada } from '../doc/sondas'
import { fuenteDeEntrada } from '../instrumentos/entradas'
import { entradaCableada, type PedidoMedir } from '../editor/medir'
import { nombreLargoDeSonda } from './textosSonda'
import { LO_MAS_RAPIDO, textoDelMenu, textoDelta, VELOCIDADES, type DeltaAvance } from './tiempo/velocidades'

/** Lo que mide una entrada, a la derecha de su ítem y en su nombre: «libre», «mide R1:2» o «conectada» (y entonces no se elige). */
function estadoDeEntrada(ctx: ContextoMenu, p: Pieza, entrada: string): Partial<ItemMenu> {
  const con = ctx.con
  if (!con) return {}
  const s = sondaDeEntrada(ctx.doc, p.id, entrada)
  if (s && con.redDeSonda.has(s.id) && !con.sondasSinUnir.includes(s.id)) return { detalle: `mide ${fuenteDeEntrada(ctx.doc, con, p.id, entrada) ?? 'un cable'}` }
  if (entradaCableada(con, p, entrada, s)) return { detalle: 'conectada', deshabilitado: true, pista: `La entrada ${entrada} de ${p.ref} ya está conectada con un cable.` }
  return { detalle: 'libre' }
}

/** Los instrumentos de un tipo del documento, por referencia. */
const instrumentosDe = (ctx: ContextoMenu, tipo: 'osciloscopio' | 'multimetro'): Pieza[] =>
  Object.values(ctx.doc.piezas)
    .filter((p) => ctx.lib.get(p.tipo)?.modelo?.tipo === tipo)
    .sort((a, b) => a.ref.localeCompare(b.ref, 'es', { numeric: true }))

/**
 * Menús «Medir con el multímetro ▸» y «Medir con el osciloscopio ▸» del clic derecho de un cable o etiqueta. Todo pone sondas.
 */
function entradasMedir(ctx: ContextoMenu): EntradaMenu[] {
  const oscs = instrumentosDe(ctx, 'osciloscopio')
  const mms = instrumentosDe(ctx, 'multimetro')
  const subOsc: EntradaMenu[] = oscs.length
    ? oscs.flatMap((o) => CANALES.map((c): EntradaMenu => ({ tipo: 'item', id: `medir-osc:${o.id}:${c}`, texto: oscs.length > 1 ? `${o.ref} · Entrada ${c}` : `Entrada ${c}`, ...estadoDeEntrada(ctx, o, c) })))
    : CANALES.map((c): EntradaMenu => ({ tipo: 'item', id: `medir-osc:nuevo:${c}`, texto: `Entrada ${c}` }))
  const subMm: EntradaMenu[] = [
    { tipo: 'item', id: 'medir-mm:rapido', texto: 'Medidor rápido' },
    ...mms.flatMap((m) => (['+', 'COM'] as const).map((t): EntradaMenu => ({ tipo: 'item', id: `medir-mm:${m.id}:${t}`, texto: `${m.ref} · ${t}`, ...estadoDeEntrada(ctx, m, t) }))),
    { tipo: 'item', id: 'medir-mm:nuevo', texto: 'Multímetro nuevo' }
  ]
  return [
    { tipo: 'item', id: 'medir-mm', texto: 'Medir con el multímetro', icono: 'multimetro', flecha: true, submenu: subMm },
    { tipo: 'item', id: 'medir-osc', texto: 'Medir con el osciloscopio', icono: 'osciloscopio', flecha: true, submenu: subOsc }
  ]
}

/** El pedido de medida de un ítem del menú (`medir-osc:<id|nuevo>:<canal>`, `medir-mm:<id>:<terminal>`, …); null si no es uno. */
export function pedidoDeAccion(id: AccionMenu): PedidoMedir | null {
  if (id === 'medir-mm:rapido') return { con: 'medidor' }
  if (id === 'medir-mm:nuevo') return { con: 'multimetro-nuevo' }
  const [pre, osc, que] = id.split(':')
  if (pre === 'medir-osc' && (CANALES as readonly string[]).includes(que)) return osc === 'nuevo' ? { con: 'osciloscopio', canal: que as Canal } : { con: 'osciloscopio', osc, canal: que as Canal }
  if (pre === 'medir-mm' && (que === '+' || que === 'COM')) return { con: 'multimetro', mm: osc, terminal: que }
  return null
}

export type AccionMenu =
  | 'editar-valor' | 'girar' | 'girar-izq' | 'espejo-x' | 'espejo-y' | 'cortar' | 'copiar' | 'duplicar' | 'guardar-plantilla' | 'exportar-seleccion' | 'borrar'
  | 'derivar' | 'editar-texto'
  | 'colocar-aqui' | 'pegar-aqui' | 'etiqueta' | 'tierra' | 'nota' | 'encuadrar'
  | 'nuevo' | 'abrir' | 'recientes' | 'guardar' | 'guardar-como' | 'exportar' | 'configuracion'
  | `reciente:${number}` | 'olvidar-recientes' | `exportar:${FormatoExportar}`
  | 'formato' | `formato:${string}`
  | 'pagina-mas' | 'pagina-menos' | 'pagina-real'
  | 'panel-inspector' | 'panel-mediciones' | 'franja-osciloscopio' | 'franja-registro'
  | IdDeMenuDeCinta | IdDeFigura | 'al-fondo' | 'figura' | `figura-estilo:${string}`
  | `velocidad:${string}` | 'avanzar-hasta' | 'delta:automatico' | 'delta:paso' | 'delta:escrito'
  | 'medir-osc' | `medir-osc:${string}` | 'medir-mm' | `medir-mm:${string}` | 'invertir-sentido' | 'convertir-medidor' | 'quitar-sonda'
  | 'plantilla:colocar' | 'plantilla:copiar' | 'plantilla:renombrar' | 'plantilla:descripcion' | 'plantilla:mover' | 'plantilla:mostrar' | 'plantilla:borrar'
  | 'categoria:mostrar' | 'categoria:borrar'
  | 'grabacion:pausar' | 'grabacion:continuar' | 'grabacion:detener'

export interface ItemMenu {
  tipo: 'item'
  id: AccionMenu
  texto: string
  /** Atajo que se muestra a la derecha («R», «Ctrl+C», «doble clic»). */
  atajo?: string
  /** Un dato a la derecha que no es tecla y sí se lee con el ítem («libre», «mide R1:2»). */
  detalle?: string
  /** Icono R1 a la izquierda del texto: el de su orden en la cinta; sin él, el hueco queda. */
  icono?: NombreIcono
  /** Acción destructiva (Borrar): se pinta en el color de peligro. */
  peligro?: boolean
  deshabilitado?: boolean
  /** Por qué está deshabilitado; se muestra al pasar o enfocar el ítem. */
  pista?: string
  /** Una explicación corta del ítem, que se muestra al pasar o enfocarlo aunque esté habilitado (el globo de «Sin límite de tiempo real»). */
  ayuda?: string
  /** Abre un submenú (Recientes, Exportar imagen, Formato). */
  flecha?: boolean
  /** Entradas del submenú que abre (con flecha a la derecha, Enter o el puntero). */
  submenu?: EntradaMenu[]
  /** Muestra de color junto al texto (una tinta o el color de un LED): el valor de `data-color` de `.muestra-color`. */
  muestra?: string
  /** Casilla (negrita) u opción de un grupo (fuente, tinta): se anuncia y se dibuja marcada. */
  rol?: 'casilla' | 'opcion'
  /** true, false o «mixto» (unos sí y otros no). */
  marcado?: boolean | 'mixto'
}

/** Un separador puede llevar un rótulo de sección («Resultados» en el menú Analizar). */
export type EntradaMenu = ItemMenu | { tipo: 'separador'; rotulo?: string }

export interface ModeloMenu {
  /** Nombre del menú para lectores de pantalla; en los del clic derecho también se muestra arriba. */
  titulo: string
  mostrarTitulo: boolean
  entradas: EntradaMenu[]
}

export interface ContextoMenu {
  doc: Documento
  lib: Map<string, PiezaDef>
  puedePegar: boolean
  /** Primera tecla vigente de un comando del registro de atajos. */
  teclas(id: string): string | undefined
  /** Elementos seleccionados (el objetivo ya lo está). */
  seleccionados: number
  /** Nombre de la red del objetivo, si tiene. */
  red?: string
  /** Formato de las notas y etiquetas seleccionadas, para el submenú Formato. */
  formato?: VistaFormato | null
  /** false: las figuras seleccionadas ya están detrás de las demás y «Llevar al fondo» no cambiaría nada. */
  alFondo?: boolean
  /** Estilo de las figuras seleccionadas, para su submenú Formato. */
  figura?: VistaFigura | null
  /** Las conexiones: con ellas los submenús de medir dicen qué mide cada entrada. */
  con?: Conexiones
}

const separador: EntradaMenu = { tipo: 'separador' }
const item = (id: AccionMenu, texto: string, extra: Partial<ItemMenu> = {}): ItemMenu => ({ tipo: 'item', id, texto, ...extra })
/** Un ítem que es una orden de la cinta: su nombre de menú y su icono R1. */
const orden = (id: AccionMenu & IdComando, extra: Partial<ItemMenu> = {}): ItemMenu => item(id, textoMenu(id), { icono: COMANDOS[id].icono, ...extra })
/** Las cuatro figuras del botón Figura (y del submenú del lienzo en blanco). */
const entradasFigura = (): EntradaMenu[] => (Object.keys(FIGURA_DE_COMANDO) as IdDeFigura[]).map((id) => orden(id))

/**
 * Menú del clic derecho de una plantilla. Las incluidas son de solo lectura (colocar y copiar); las propias se pueden renombrar, recategorizar, mostrar en su carpeta y borrar.
 */
export function menuDePlantilla(nombre: string, incluida: boolean): ModeloMenu {
  return {
    titulo: `Plantilla · ${nombre}`,
    mostrarTitulo: true,
    entradas: incluida
      ? [item('plantilla:colocar', 'Colocar', { icono: 'pieza' }), item('plantilla:copiar', 'Copiar a mis plantillas…', { icono: 'copiar' })]
      : [
          item('plantilla:colocar', 'Colocar', { icono: 'pieza' }),
          separador,
          item('plantilla:renombrar', 'Renombrar…', { icono: 'etiqueta', atajo: 'F2' }),
          item('plantilla:descripcion', 'Cambiar descripción…', { icono: 'nota' }),
          item('plantilla:mover', 'Cambiar de categoría…', { icono: 'mover' }),
          item('plantilla:mostrar', 'Mostrar en la carpeta', { icono: 'abrir' }),
          separador,
          item('plantilla:borrar', 'Borrar…', { peligro: true, icono: 'borrar', atajo: 'Supr' })
        ]
  }
}

/**
 * Menú del clic derecho de una categoría propia. Las de Kirchi (Incluidas) no tienen menú. `total` es lo que muestra la lista, el borrado recuenta en el proceso principal.
 */
export function menuDeCategoria(nombre: string, total: number): ModeloMenu {
  return {
    titulo: `Categoría · ${nombre}`,
    mostrarTitulo: true,
    entradas: [
      item('categoria:mostrar', 'Mostrar en la carpeta', { icono: 'abrir' }),
      separador,
      item('categoria:borrar', 'Borrar categoría…', {
        peligro: true,
        icono: 'borrar',
        atajo: 'Supr',
        detalle: total === 0 ? 'vacía' : `${total} ${total === 1 ? 'plantilla' : 'plantillas'}`
      })
    ]
  }
}

/**
 * Secciones del clic derecho, cada una con icono. Con un solo objeto, Guardar como plantilla y Exportar la selección se piden desde la cinta.
 */
function seccionesDeSeleccion(ctx: ContextoMenu, o: { girar: boolean; propias?: EntradaMenu[]; antes?: EntradaMenu[]; borrar: ItemMenu }): EntradaMenu[] {
  const t = (id: string) => ctx.teclas(id)
  const varios = ctx.seleccionados > 1
  const pegar = item('pegar-aqui', 'Pegar', { icono: 'pegar', atajo: t('pegar'), deshabilitado: !ctx.puedePegar, pista: ctx.puedePegar ? undefined : razonSinPegar(t('copiar')) })
  const girar = o.girar || varios
  const secciones: EntradaMenu[][] = [
    varios ? [] : (o.antes ?? []),
    [orden('cortar', { atajo: t('cortar') }), orden('copiar', { atajo: t('copiar') }), pegar, orden('duplicar', { atajo: t('duplicar') })],
    girar ? [orden('girar', { atajo: t('girar') }), orden('girar-izq', { atajo: t('girar-izq') }), orden('espejo-x', { atajo: t('espejo-x') }), orden('espejo-y', { atajo: t('espejo-y') })] : [],
    varios ? [orden('guardar-plantilla'), item('exportar-seleccion', 'Exportar la selección…', { icono: 'exportar' })] : (o.propias ?? []),
    [o.borrar]
  ]
  return secciones.filter((x) => x.length > 0).flatMap((x, i) => (i === 0 ? x : [separador, ...x]))
}

const eliminar = (ctx: ContextoMenu, extra: Partial<ItemMenu> = {}): ItemMenu => item('borrar', 'Eliminar', { icono: 'borrar', atajo: ctx.teclas('borrar'), peligro: true, ...extra })
const entradaEditar = (icono: NombreIcono): ItemMenu => item('editar-valor', 'Editar', { atajo: 'doble clic', icono })

/** Menú del clic derecho para lo que hay bajo el cursor. */
export function menuDeObjetivo(o: ObjetivoMenu, ctx: ContextoMenu): ModeloMenu {
  const t = (id: string) => ctx.teclas(id)
  const varios = ctx.seleccionados > 1 ? `${ctx.seleccionados} elementos seleccionados` : null
  if (o.tipo === 'pieza') {
    const p = ctx.doc.piezas[o.id]
    const def = p ? ctx.lib.get(p.tipo) : undefined
    const valor = p && def ? textoDeValor(p, def, ctx.doc) : null
    const titulo = varios ?? (!p ? 'Pieza' : def ? `${p.ref} · ${def.nombre.es}${valor ? ` ${valor}` : ''}` : `${p.ref} · pieza desconocida`)
    return {
      titulo,
      mostrarTitulo: true,
      entradas: seccionesDeSeleccion(ctx, {
        girar: true,
        // «Editar» es el doble clic: abre el editor de referencia y valor.
        antes: [entradaEditar('etiqueta'), orden('panel-inspector')],
        // Lo que el último grupo de Inicio ofrece de la selección también está aquí.
        propias: def?.modelo?.tipo === 'osciloscopio' ? [orden('franja-osciloscopio'), orden('panel-mediciones'), orden('franja-registro')] : def?.modelo?.tipo === 'multimetro' ? [orden('panel-mediciones')] : [],
        borrar: eliminar(ctx)
      })
    }
  }
  if (o.tipo === 'cable')
    return {
      titulo: varios ?? (ctx.red ? `Cable · ${ctx.red}` : 'Cable'),
      mostrarTitulo: true,
      entradas: seccionesDeSeleccion(ctx, {
        girar: false,
        antes: [item('derivar', 'Derivar desde aquí', { atajo: 'Alt+clic', icono: 'cable' }), orden('panel-inspector')],
        propias: entradasMedir(ctx),
        borrar: eliminar(ctx)
      })
    }
  if (o.tipo === 'sonda') {
    const s = ctx.doc.sondas && Object.hasOwn(ctx.doc.sondas, o.id) ? ctx.doc.sondas[o.id] : undefined
    return {
      titulo: varios ?? (s ? nombreLargoDeSonda(ctx.doc, s) : 'Sonda'),
      mostrarTitulo: true,
      entradas: [
        ...(s?.tipo === 'corriente' ? [item('invertir-sentido', 'Invertir el sentido', { icono: 'corriente' })] : []),
        ...(s?.tipo === 'medidor' ? [item('convertir-medidor', 'Convertir en multímetro completo', { icono: 'multimetro' })] : []),
        orden('panel-mediciones'),
        separador,
        item('quitar-sonda', 'Eliminar', { atajo: t('borrar'), peligro: true, icono: 'borrar' })
      ]
    }
  }
  if (o.tipo === 'figura') {
    const f = ctx.doc.figuras?.[o.id]
    return {
      titulo: varios ?? (f ? NOMBRE_FIGURA[f.tipo] : 'Figura'),
      mostrarTitulo: true,
      entradas: seccionesDeSeleccion(ctx, {
        girar: false,
        antes: [orden('panel-inspector')],
        propias: [
          ...(ctx.figura ? [item('formato', 'Formato', { icono: 'formato', flecha: true, submenu: entradasFormatoFigura(ctx.figura) })] : []),
          item('al-fondo', 'Llevar al fondo', { icono: 'figura', deshabilitado: ctx.alFondo === false, pista: ctx.alFondo === false ? 'Ya está detrás de las demás figuras.' : undefined })
        ],
        borrar: eliminar(ctx)
      })
    }
  }
  if (o.tipo === 'etiqueta' || o.tipo === 'nota') {
    const e = o.tipo === 'etiqueta' ? ctx.doc.etiquetas[o.id] : undefined
    const formato = ctx.formato ? [item('formato', 'Formato', { icono: 'formato', flecha: true, submenu: entradasFormato(ctx.formato, t) })] : []
    return {
      titulo: varios ?? (o.tipo === 'nota' ? 'Nota de texto' : `Etiqueta de red ${e?.nombre ?? ''}`.trim()),
      mostrarTitulo: true,
      entradas: seccionesDeSeleccion(ctx, {
        girar: o.tipo === 'etiqueta',
        antes: [item('editar-texto', 'Editar', { atajo: 'doble clic', icono: o.tipo === 'nota' ? 'nota' : 'etiqueta' }), orden('panel-inspector')],
        propias: [...formato, ...(o.tipo === 'etiqueta' ? entradasMedir(ctx) : [])],
        borrar: eliminar(ctx)
      })
    }
  }
  return {
    titulo: 'En el lienzo',
    mostrarTitulo: true,
    entradas: [
      item('colocar-aqui', 'Colocar pieza aquí…', { atajo: 'doble clic', icono: 'pieza' }),
      item('pegar-aqui', textoMenu('pegar'), { icono: 'pegar', atajo: t('pegar'), deshabilitado: !ctx.puedePegar, pista: ctx.puedePegar ? undefined : razonSinPegar(t('copiar')) }),
      separador,
      orden('etiqueta', { atajo: t('etiqueta') }),
      orden('tierra', { atajo: t('tierra') }),
      orden('nota', { atajo: t('nota') }),
      // Las figuras también aquí (eligen la herramienta, como el botón Figura).
      orden('figura', { flecha: true, submenu: entradasFigura() }),
      separador,
      orden('encuadrar', { atajo: t('encuadrar') })
    ]
  }
}

/**
 * Submenú «Formato ▸» de notas y etiquetas: los controles de la barra flotante como lista, con el estado de la selección.
 */
export function entradasFormato(v: VistaFormato, teclas: (id: string) => string | undefined): EntradaMenu[] {
  const casilla = (id: 'negrita' | 'cursiva' | 'subrayado', texto: string) => item(`formato:${id}`, texto, { atajo: teclas(id), rol: 'casilla', marcado: v[id] })
  const paso = (id: 'tam-mayor' | 'tam-menor', texto: string, a: number | null) =>
    item(`formato:${id}`, a === null ? texto : `${texto} (${textoTam(a)})`, { atajo: teclas(id), deshabilitado: a === null && v.tam !== 'varios', pista: a === null && v.tam !== 'varios' ? 'Ya está en el extremo de la serie.' : undefined })
  const idAlinear: Record<Alineacion, string> = { izq: 'alinear-izq', centro: 'alinear-centro', der: 'alinear-der', just: 'justificar' }
  return [
    casilla('negrita', 'Negrita'),
    casilla('cursiva', 'Cursiva'),
    casilla('subrayado', 'Subrayado'),
    separador,
    ...FUENTES.map((f) => item(`formato:fuente:${f}`, NOMBRE_FUENTE[f], { rol: 'opcion', marcado: v.fuente === f })),
    separador,
    paso('tam-mayor', 'Letra más grande', v.tamMayor),
    paso('tam-menor', 'Letra más chica', v.tamMenor),
    ...(v.alinear === null
      ? []
      : [separador, ...ALINEACIONES.map((a) => item(`formato:alinear:${a}`, NOMBRE_ALINEACION[a], { atajo: teclas(idAlinear[a]), rol: 'opcion', marcado: v.alinear === a }))]),
    separador,
    ...TINTAS.map((t) => item(`formato:tinta:${t}`, NOMBRE_TINTA[t], { rol: 'opcion', marcado: v.tinta === t, muestra: `tinta-${t}` })),
    separador,
    ...CONTORNOS.map((c) => item(`formato:contorno:${c}`, textoContorno(c, v), { rol: 'opcion', marcado: v.contorno === c, ...(TINTAS.includes(c as Tinta) ? { muestra: `tinta-${c}` } : {}) }))
  ]
}

const TEXTO_TRAZO: Readonly<Record<Trazo, string>> = { continuo: 'Trazo continuo', guiones: 'Trazo con guiones', puntos: 'Trazo punteado' }
const TEXTO_PUNTA: Readonly<Record<Punta, string>> = { llena: 'Punta llena', abierta: 'Punta abierta', dos: 'Dos puntas' }

/**
 * Submenú «Formato ▸» de figuras. Sin marca si la selección difiere. Relleno solo con rectángulos o elipses, punta solo con flechas.
 */
export function entradasFormatoFigura(v: VistaFigura): EntradaMenu[] {
  const opcion = (clave: string, valor: string | number, texto: string, marcado: boolean, extra: Partial<ItemMenu> = {}) =>
    item(`figura-estilo:${clave}:${valor}`, texto, { rol: 'opcion', marcado, ...extra })
  return [
    ...TINTAS.map((t) => opcion('tinta', t, NOMBRE_TINTA[t], v.tinta === t, { muestra: `tinta-${t}` })),
    separador,
    ...GROSORES.map((g) => opcion('grosor', g, `Grosor ${g} mm`, v.grosor === g)),
    separador,
    ...TRAZOS_FIGURA.map((z) => opcion('trazo', z, TEXTO_TRAZO[z], v.trazo === z)),
    separador,
    ...OPACIDADES.map((o) => opcion('opacidad', o, `Opacidad ${o} %`, v.opacidad === o)),
    ...(v.relleno === null ? [] : [separador, item(`figura-estilo:relleno:${v.relleno === true ? 'no' : 'si'}`, 'Relleno suave', { rol: 'casilla', marcado: v.relleno === 'mixto' ? 'mixto' : v.relleno })]),
    ...(v.punta === null ? [] : [separador, ...PUNTAS.map((p) => opcion('punta', p, TEXTO_PUNTA[p], v.punta === p))])
  ]
}

/** El cambio de estilo de un ítem del submenú Formato de una figura; null si el id no es uno. */
export function estiloDeAccion(id: AccionMenu): Partial<EstiloFigura> | null {
  const [pre, que, valor] = id.split(':')
  if (pre !== 'figura-estilo' || valor === undefined) return null
  if (que === 'tinta' && TINTAS.includes(valor as Tinta)) return { tinta: valor as Tinta }
  if (que === 'grosor' && GROSORES.includes(Number(valor) as Grosor)) return { grosor: Number(valor) as Grosor }
  if (que === 'trazo' && TRAZOS_FIGURA.includes(valor as Trazo)) return { trazo: valor as Trazo }
  if (que === 'opacidad' && OPACIDADES.includes(Number(valor) as Opacidad)) return { opacidad: Number(valor) as Opacidad }
  if (que === 'relleno' && (valor === 'si' || valor === 'no')) return { relleno: valor === 'si' }
  if (que === 'punta' && PUNTAS.includes(valor as Punta)) return { punta: valor as Punta }
  return null
}

/** «Contorno rojo», «Sin contorno», «Contorno predeterminado (gris)»: el nombre de cada opción en la lista plana del submenú. */
const textoContorno = (c: Contorno, v: VistaFormato): string =>
  c === 'ninguno' ? NOMBRE_CONTORNO.ninguno : c === 'auto' ? `Contorno ${nombreContorno(c, v.notas, v.etiquetas).toLowerCase()}` : `Contorno ${NOMBRE_CONTORNO[c].toLowerCase()}`

/** La orden de formato de un ítem del submenú; null si el id no es de formato. */
export function ordenDeAccion(id: AccionMenu): OrdenFormato | null {
  const [pre, que, valor] = id.split(':')
  if (pre !== 'formato' || !que) return null
  if (que === 'negrita' || que === 'cursiva' || que === 'subrayado') return { tipo: 'alternar', prop: que }
  if (que === 'tam-mayor' || que === 'tam-menor') return { tipo: 'paso', dir: que === 'tam-mayor' ? 1 : -1 }
  if (que === 'fuente' && FUENTES.includes(valor as Fuente)) return { tipo: 'parche', parche: { fuente: valor as Fuente } }
  if (que === 'alinear' && ALINEACIONES.includes(valor as Alineacion)) return { tipo: 'parche', parche: { alinear: valor as Alineacion } }
  if (que === 'contorno' && CONTORNOS.includes(valor as Contorno)) return { tipo: 'parche', parche: { contorno: valor as Contorno } }
  if (que === 'tinta' && TINTAS.includes(valor as Tinta)) return { tipo: 'parche', parche: { tinta: valor as Tinta } }
  return null
}

export interface ContextoArchivo {
  teclas(id: string): string | undefined
  /** Rutas de Recientes, la más nueva primero. */
  recientes: readonly string[]
  /** El archivo abierto es de un formato más nuevo: no se guarda. */
  soloLectura: boolean
  /** No hay nada dibujado: no hay qué exportar. */
  vacio: boolean
}

export const PISTA_SOLO_LECTURA = 'Se abrió en solo lectura: es de una versión más nueva de Kirchi.'
export const PISTA_SIN_RECIENTES = 'Todavía no hay archivos recientes.'
export const PISTA_VACIO = 'El circuito está vacío: no hay nada que exportar.'
/** Pegar sin nada copiado, en el clic derecho y en la cinta; dice la tecla vigente de Copiar. */
export const razonSinPegar = (t: string | undefined): string => `Primero copia algo${t ? ` con ${t}` : ''}.`

/** Nombres para Recientes: el del archivo y, si dos coinciden, también su carpeta. */
export function nombresDeRecientes(rutas: readonly string[]): string[] {
  const nombres = rutas.map(nombreDeRuta)
  return nombres.map((n, i) => (nombres.filter((m) => m.toLowerCase() === n.toLowerCase()).length > 1 ? `${n} (${nombreDeRuta(carpetaDeRuta(rutas[i])) || carpetaDeRuta(rutas[i])})` : n))
}

/** Recientes, la más nueva primero, con «Borrar la lista» al final; vacía si no hay ninguno. */
export function entradasRecientes(recientes: readonly string[]): EntradaMenu[] {
  return recientes.length ? [...nombresDeRecientes(recientes).map((n, i) => item(`reciente:${i}`, n)), separador, item('olvidar-recientes', 'Borrar la lista')] : []
}

export const entradasExportar = (): EntradaMenu[] => [item('exportar:png', 'PNG…'), item('exportar:svg', 'SVG…'), item('exportar:pdf', 'PDF…')]

/** Menú del botón Recientes de Inicio › Archivo (sin recientes el botón queda deshabilitado con `PISTA_SIN_RECIENTES`). */
export const menuRecientes = (recientes: readonly string[]): ModeloMenu => ({ titulo: textoMenu('recientes'), mostrarTitulo: false, entradas: entradasRecientes(recientes) })

/** Menú del botón Exportar de Inicio › Archivo (con el circuito vacío el botón queda deshabilitado con `PISTA_VACIO`). */
export const menuExportar = (): ModeloMenu => ({ titulo: textoMenu('exportar'), mostrarTitulo: false, entradas: entradasExportar() })

/** El globo de «Sin límite de tiempo real»: qué hace, dicho sin jerga. */
export const AYUDA_SIN_LIMITE = 'Calcula tan rápido como puede el equipo, sin esperar al reloj.'

/**
 * Menú de Velocidad: las ocho velocidades fijas con lo que simulan por segundo y «Sin límite de tiempo real». Una guardada que ya no existe marca la más cercana.
 */
export function menuVelocidad(vigente: number): ModeloMenu {
  const cercana = vigente === LO_MAS_RAPIDO ? vigente : VELOCIDADES.reduce((a, b) => (Math.abs(Math.log(b / vigente)) < Math.abs(Math.log(a / vigente)) ? b : a))
  const opcion = (v: number) => item(`velocidad:${v}`, textoDelMenu(v), { rol: 'opcion', marcado: v === cercana })
  const entradas: EntradaMenu[] = VELOCIDADES.map(opcion)
  entradas.push(separador, { ...opcion(LO_MAS_RAPIDO), ayuda: AYUDA_SIN_LIMITE })
  return { titulo: textoMenu('velocidad'), mostrarTitulo: false, entradas }
}

/**
 * Menú de Avanzar en el tiempo: qué avanza cada vez (una división, un paso de cálculo o un tiempo fijo). «Avanzar hasta…» no es opción: corre hasta un instante.
 */
export function menuAvanzar(delta: DeltaAvance, velocidad: number, division: number | null, paso?: number): ModeloMenu {
  const escrito = typeof delta === 'number'
  return {
    titulo: textoMenu('avanzar-tiempo'),
    mostrarTitulo: false,
    entradas: [
      item('delta:automatico', textoDelta('automatico', velocidad, division), { icono: 'reloj', rol: 'opcion', marcado: delta === 'automatico' }),
      item('delta:paso', textoDelta('paso', velocidad, division, paso), { icono: 'paso', rol: 'opcion', marcado: delta === 'paso' }),
      item('delta:escrito', escrito ? `Tiempo fijo: ${textoDelta(delta, velocidad, division)}…` : 'Tiempo fijo…', { icono: 'tiempoAvanza', rol: 'opcion', marcado: escrito }),
      separador,
      item('avanzar-hasta', 'Avanzar hasta…', { icono: 'hastaT' })
    ]
  }
}

/** Menú del botón Figura de Inicio › Colocar: las cuatro figuras con su icono. */
/** Menús de Instrumentos y Analizar de Inicio: cada entrada es la orden de la cinta de su nombre (`esDeMenuDeCinta`). */
export function menuDeCinta(id: IdComando): ModeloMenu {
  const entradas = (ENTRADAS_MENU[id] ?? []).map((x): EntradaMenu => (typeof x === 'string' ? orden(x as IdDeMenuDeCinta) : { tipo: 'separador', rotulo: x.titulo }))
  return { titulo: COMANDOS[id].nombre ?? COMANDOS[id].texto, mostrarTitulo: false, entradas }
}

/** Menú de la flecha de Grabar mientras se graba: Pausar o Continuar, y Detener. */
export const menuGrabacion = (pausada: boolean): ModeloMenu => ({
  titulo: 'Grabación',
  mostrarTitulo: false,
  entradas: [
    pausada ? item('grabacion:continuar', 'Continuar', { icono: 'simular' }) : item('grabacion:pausar', 'Pausar', { icono: 'pausa' }),
    item('grabacion:detener', 'Detener la grabación', { icono: 'detener' })
  ]
})

export const menuFigura = (): ModeloMenu => ({ titulo: textoMenu('figura'), mostrarTitulo: false, entradas: entradasFigura() })

/**
 * Menú Archivo, sin botón en la cinta. Se conserva para la opción b, con las mismas entradas que Inicio › Archivo.
 */
export function menuArchivo(ctx: ContextoArchivo): ModeloMenu {
  const t = (id: string) => ctx.teclas(id)
  const lectura = ctx.soloLectura ? { deshabilitado: true, pista: PISTA_SOLO_LECTURA } : {}
  const recientes = entradasRecientes(ctx.recientes)
  const vacio = ctx.vacio ? { deshabilitado: true, pista: PISTA_VACIO } : {}
  return {
    titulo: 'Archivo',
    mostrarTitulo: false,
    entradas: [
      item('nuevo', textoMenu('nuevo'), { atajo: t('nuevo') }),
      item('abrir', textoMenu('abrir'), { atajo: t('abrir') }),
      item('recientes', textoMenu('recientes'), { flecha: true, submenu: recientes, ...(recientes.length ? {} : { deshabilitado: true, pista: PISTA_SIN_RECIENTES }) }),
      separador,
      item('guardar', textoMenu('guardar'), { atajo: t('guardar'), ...lectura }),
      item('guardar-como', textoMenu('guardar-como'), { atajo: t('guardar-como'), ...lectura }),
      separador,
      item('exportar', textoMenu('exportar'), { atajo: 'PNG · SVG · PDF', flecha: true, submenu: entradasExportar(), ...vacio }),
      separador,
      item('configuracion', textoMenu('configuracion'), { atajo: t('configuracion') })
    ]
  }
}

const TECLAS_ARIA: Record<string, string> = { Ctrl: 'Control', Supr: 'Delete', Retroceso: 'Backspace', Esc: 'Escape', Espacio: 'Space', Arriba: 'ArrowUp', Abajo: 'ArrowDown', Izquierda: 'ArrowLeft', Derecha: 'ArrowRight' }

/** `aria-keyshortcuts` de un ítem: un ítem deshabilitado muestra su atajo pero no lo anuncia (la tecla aún no hace nada). */
export const ariaAtajoDeItem = (e: ItemMenu): string | undefined => (e.deshabilitado ? undefined : atajoAria(e.atajo))

/**
 * Teclas de un atajo mostrado («Ctrl+Shift+S» → Ctrl, Shift, S). null si es un gesto o texto, que va en palabras.
 */
export function teclasDeAtajo(atajo: string): string[] | null {
  if (/clic|·|\s/.test(atajo)) return null
  return atajo === '+' ? ['+'] : atajo.split(/\+(?!$)/)
}

/** Valor de `aria-keyshortcuts` para un atajo mostrado; los gestos del ratón («doble clic») no tienen. */
export function atajoAria(atajo: string | undefined): string | undefined {
  if (!atajo || /clic|·/.test(atajo)) return undefined
  return atajo
    .split(/\+(?!$)/)
    .map((k) => TECLAS_ARIA[k] ?? k)
    .join('+')
}
