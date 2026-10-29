import { recordarEstado, recuperarEstado } from './memoria'
import { createEffect, createMemo, createSignal, For, on, Show, type JSX } from 'solid-js'
import { ESCALAS_PNG, type FormatoFigura, type OpcionesFigura } from '../../../../../compartido/ajustes'
import { escribirAnotaciones, type Anotaciones } from '../../../../../compartido/grafica/anotaciones'
import type { AspectoGrafica, AspectoTraza } from '../../../../../compartido/grafica/aspecto'
import { formatearSI } from '../../../valores/valores'
import Dialogo from '../../Dialogo'
import { IconoDeshacer, IconoRehacer } from '../../iconos'
import { ControlRejilla, ControlTema, GrosorEjes, GrosorRejilla, GrosorTrazas, SeccionTextos, SubdivisionesEjes, type TrazaVista } from '../../grafica/AspectoPanel'
import { decimalesPorOmision } from '../../../../../compartido/grafica/ejes'
import { aPixel, deValor } from '../../grafica/vista'
import type { FiguraCaptura } from '../../osciloscopio/figura'
import Bloque from '../Bloque'
import { CamposDeAdornos, CamposDeArchivo, CamposDeFondo, CamposDeLetra, CampoFormato, ChipsDatos, type DatoExportable } from '../campos'
import { NOMBRE_FORMATO_FIGURA } from '../modelo'
import { aplicarPreajuste, preajusteDe, type TipoFigura } from '../preajustes'
import { rangoEfectivo, type RangoExportar } from '../rango'
import RangoDoble from '../RangoDoble'
import SelectorEstilo from '../SelectorEstilo'
import BarraFlotante from './BarraFlotante'
import {
  agregarEtiqueta,
  acomodarEje,
  agregarFlecha,
  agregarTexto,
  alternarTraza,
  borrarNota,
  cambiarAdornos,
  cambiarAspecto,
  ajustarDecimalesX,
  cambiarRango,
  pasoDeEjeX,
  cambiarTraza,
  editarFlecha,
  moverNota,
  TOPE_DE,
  estadoParaDibujar,
  type EstadoEditor
} from './edicion'
import { cerrarGesto, confirmar, crearHistorial, deshacer, puedeDeshacer, puedeRehacer, rehacer, type Historial } from './historial'
import { IconoEtiqueta, IconoFlecha, IconoRango, IconoSeleccionar, IconoTexto } from './iconosEditor'
import { listaDeObjetos, type Seleccion } from './objetos'
import { avisarFigura, propagar, sumarAlGrupo, todosLosElegidos } from './multiple'
import PanelPropiedades, { type Aplicar } from './PanelPropiedades'
import VistaEditor, { type Herramienta } from './VistaEditor'

export interface PropsEditor {
  titulo: string
  tipo: TipoFigura
  inicial: EstadoEditor
  opciones: OpcionesFigura
  onCambiar(parche: Partial<OpcionesFigura>): void
  formatos: readonly FormatoFigura[]
  /** La figura con lo que hay en el estado: es la misma que se escribe al exportar. */
  figura(e: EstadoEditor): FiguraCaptura
  /** Las trazas con lo que muestran el panel y la barra (tono, eje, grosor, unidad). */
  trazas(e: EstadoEditor): TrazaVista[]
  /** Todas las trazas o canales que existen (para no apagar la última) y su lista como datos exportables. */
  datos(e: EstadoEditor): DatoExportable[]
  /** Del objeto de la figura (`V(s)#°`) a la clave de la traza que guarda su estilo. */
  claveDeTraza(id: string): string
  ejeX: { etiqueta: string; unidad: string; log?: boolean; sinRango?: boolean } | null
  /** La tabla del CSV (formato CSV); sin ella, no hay CSV. */
  vistaCsv?(e: EstadoEditor): JSX.Element
  /** El tamaño que tendrá un CSV («120 puntos»). */
  pieCsv?(e: EstadoEditor): string
  /** Por qué no se puede exportar ahora; el botón queda deshabilitado y lo dice. */
  motivoNo?(e: EstadoEditor): string | undefined
  /** La unidad del eje horizontal en las cifras del tramo («s», «Hz»). */
  unidadTramo: string
  /** Lo que cuenta el tramo desde dónde (el tiempo del osciloscopio parte del principio de lo capturado). */
  onExportar(e: EstadoEditor): void
  /** Guarda las anotaciones con el aspecto; devuelve el motivo si no se pudo. */
  onGuardar?(a: Anotaciones): string | null
  onCerrar(): void
  ocupado?: boolean
  /** Identidad de los datos exportados: con la misma, al reabrir queda todo lo ajustado; con otra, parte de `inicial`. */
  identidad?: string
}

const HERRAMIENTAS: readonly { id: Herramienta; nombre: string; tecla: string; icono: () => JSX.Element; ayuda: string }[] = [
  { id: 'seleccionar', nombre: 'Seleccionar', tecla: 'V', icono: () => <IconoSeleccionar />, ayuda: 'Elige, mueve y edita lo que hay en la figura' },
  { id: 'texto', nombre: 'Texto', tecla: 'T', icono: () => <IconoTexto />, ayuda: 'Haz clic en la figura para escribir un texto' },
  { id: 'etiqueta', nombre: 'Etiqueta de valor', tecla: 'E', icono: () => <IconoEtiqueta />, ayuda: 'Haz clic cerca de una traza para anotar su valor' },
  { id: 'flecha', nombre: 'Flecha', tecla: 'F', icono: () => <IconoFlecha />, ayuda: 'Arrastra sobre la figura para dibujar una flecha' },
  { id: 'rango', nombre: 'Tramo a exportar', tecla: 'R', icono: () => <IconoRango />, ayuda: 'Arrastra sobre la retícula para elegir el tramo que se exporta' }
]

const mm = (v: number) => `${Math.round(v)} mm`
const esCampo = (t: EventTarget | null) => t instanceof HTMLInputElement ? t.type !== 'range' && t.type !== 'checkbox' && t.type !== 'radio' : t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement

/**
 * Editor de la figura que se exporta. Lo que se ve es lo que se escribe: el archivo sale de la misma función de dibujo.
 */
export default function EditorFigura(props: PropsEditor) {
  const [h, setH] = createSignal<Historial<EstadoEditor>>(crearHistorial(recuperarEstado(props.tipo, props.identidad) ?? props.inicial))
  const estado = () => h().presente
  // Cada cambio se recuerda con su fuente de datos: cerrar y reabrir no deshace lo ajustado.
  createEffect(() => recordarEstado(props.tipo, props.identidad, estado()))
  const [sel, setSel] = createSignal<Seleccion | null>(null)
  /** Los que se suman al principal con Mayús o Ctrl y clic (siempre de su mismo tipo): lo que se cambie vale para todos. */
  const [extras, setExtras] = createSignal<readonly Seleccion[]>([])
  const [ancla, setAncla] = createSignal<[number, number] | null>(null)
  const [herramienta, setHerramienta] = createSignal<Herramienta>('seleccionar')
  const [enfocarTexto, setEnfocarTexto] = createSignal(0)
  const [aviso, setAviso] = createSignal('')

  const aplicar: Aplicar = (f, clave) => setH((x) => confirmar(x, f(x.presente), clave ?? null))
  /** Como `aplicar`, y lo que la edición cambia en el objeto principal pasa también a los demás elegidos. */
  const aplicarGrupo: Aplicar = (f, clave, forzar) => {
    const antes = estado()
    const despues = f(antes)
    const r = propagar(antes, despues, sel(), extras(), props.claveDeTraza, forzar)
    if (r !== despues) avisarFigura('cambio-multiple')
    setH((x) => confirmar(x, r, clave ?? null))
  }
  const cerrar = () => setH((x) => cerrarGesto(x))
  // Con la herramienta de tramo se ve todo el eje, o el tramo recordado impediría elegir fuera de él.
  const figura = createMemo(() => props.figura(estadoParaDibujar(estado(), herramienta() === 'rango')))
  const geo = createMemo(() => figura().geometria?.() ?? null)
  const items = createMemo(() => (geo() ? listaDeObjetos(geo()!, estado().anot) : []))
  const trazas = createMemo(() => props.trazas(estado()))
  const datos = createMemo(() => props.datos(estado()))
  const todas = createMemo(() => datos().map((d) => d.id))
  const csv = () => props.opciones.formato === 'csv'
  const lineas = () => !!figura().eje || (geo()?.trazas.length ?? 0) > 0

  // Lo elegido que ya no existe (se borró, se apagó la traza, cambió el estilo) se suelta.
  createEffect(() => {
    const s = sel()
    if (s && !items().some((i) => i.sel.tipo === s.tipo && i.sel.id === s.id)) setSel(null)
    const e = extras()
    const quedan = e.filter((x) => items().some((i) => i.sel.tipo === x.tipo && i.sel.id === x.id))
    if (quedan.length !== e.length) setExtras(quedan)
  })
  createEffect(on(() => props.opciones.formato, () => setHerramienta('seleccionar'), { defer: true }))

  const elegir = (s: Seleccion | null, a?: [number, number]) => {
    setSel(s)
    setExtras([])
    setAncla(a ?? null)
  }
  /** Mayús o Ctrl y clic: suma (o quita) un objeto del mismo tipo que el principal. */
  const sumar = (s: Seleccion, a?: [number, number]) => {
    const g = sumarAlGrupo({ sel: sel(), extras: extras() }, s)
    setSel(g.sel)
    setExtras(g.extras)
    setAncla(a ?? null)
    if (g.extras.length > 0) avisarFigura('seleccion-multiple')
  }
  const puede = (t: 'texto' | 'flecha' | 'etiqueta'): boolean => {
    const ok = t === 'texto' ? estado().anot.textos.length < TOPE_DE.texto : t === 'flecha' ? estado().anot.flechas.length < TOPE_DE.flecha : estado().anot.etiquetas.length < TOPE_DE.etiqueta
    if (!ok) setAviso(`Ya hay ${TOPE_DE[t]} ${t === 'texto' ? 'textos' : t === 'flecha' ? 'flechas' : 'etiquetas de valor'}: borra alguno para poner otro.`)
    return ok
  }
  const alAgregar = (r: { estado: EstadoEditor; id: string } | null, tipo: 'texto' | 'flecha' | 'etiqueta') => {
    if (!r) return
    setH((x) => confirmar(cerrarGesto(x), r.estado, null))
    setHerramienta('seleccionar')
    setAviso('')
    elegir({ tipo, id: r.id })
    if (tipo === 'texto') setEnfocarTexto((n) => n + 1)
  }
  const borrar = () => {
    const todos = todosLosElegidos({ sel: sel(), extras: extras() })
    if (todos.length === 0) return
    aplicar((e) => todos.reduce(borrarNota, e))
    cerrar()
    setSel(null)
    setExtras([])
  }
  const deshacerTodo = () => {
    setH((x) => deshacer(x))
    setAviso('')
  }
  const rehacerTodo = () => setH((x) => rehacer(x))

  const tecla = (e: KeyboardEvent) => {
    const k = e.key
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && (k === 'z' || k === 'Z')) {
      if (esCampo(e.target)) return
      e.preventDefault()
      return e.shiftKey ? rehacerTodo() : deshacerTodo()
    }
    if (ctrl && (k === 'y' || k === 'Y')) {
      if (esCampo(e.target)) return
      e.preventDefault()
      return rehacerTodo()
    }
    if (k === 'Escape') {
      if (herramienta() !== 'seleccionar') {
        e.preventDefault()
        e.stopPropagation()
        return setHerramienta('seleccionar')
      }
      if (sel()) {
        e.preventDefault()
        e.stopPropagation()
        return elegir(null)
      }
      return
    }
    if (esCampo(e.target) || ctrl || e.altKey) return
    const s = sel()
    if ((k === 'Delete' || k === 'Backspace') && s && (s.tipo === 'texto' || s.tipo === 'flecha' || s.tipo === 'etiqueta')) {
      e.preventDefault()
      return borrar()
    }
    if (s && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') && (s.tipo === 'texto' || s.tipo === 'flecha' || s.tipo === 'etiqueta') && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault()
      const paso = e.shiftKey ? 10 : 1
      const dx = k === 'ArrowLeft' ? -paso : k === 'ArrowRight' ? paso : 0
      const dy = k === 'ArrowUp' ? -paso : k === 'ArrowDown' ? paso : 0
      const todos = todosLosElegidos({ sel: s, extras: extras() })
      return aplicar((x) => todos.reduce((e, o) => moverNota(e, o, dx, dy, figura()), x), `mover:${s.id}`)
    }
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLSelectElement) return
    const h = HERRAMIENTAS.find((t) => t.tecla.toLowerCase() === k.toLowerCase())
    if (h && !csv()) {
      e.preventDefault()
      setHerramienta(h.id)
    }
  }

  // ---------- Pie: tramo, formato, tamaño ----------
  const eje = () => figura().eje
  const vistaDelEje = () => {
    const e = eje()
    if (!e) return null
    return rangoEfectivo(estado().rango, e.total) ?? rangoEfectivo({ desde: e.mapa.dom.min, hasta: e.mapa.dom.max }, e.total) ?? e.total
  }
  /** Los decimales del eje horizontal para el tramo: los elegidos o los de omisión de su unidad; «auto» deja los necesarios. */
  const decimalesDelEje = (): number | 'auto' | undefined => {
    const d = estado().aspecto.decimalesX
    const e = eje()
    return d ?? (e ? decimalesPorOmision(e.unidad) : undefined)
  }
  /** Cambia el tramo y, en el mismo paso de deshacer, los decimales del eje a los que ese tramo pide. */
  const aplicarTramo = (x: EstadoEditor, r: RangoExportar | null): EstadoEditor => {
    const n = cambiarRango(x, r)
    const e = props.figura(n).eje
    if (!e || e.mapa.escala === 'log') return n
    return ajustarDecimalesX(n, pasoDeEjeX(props.tipo === 'pantalla' ? 'pantalla' : 'grafica', e.mapa.dom, e.unidad, e.prefijo), decimalesPorOmision(e.unidad))
  }
  /** Dónde cae el tramo ya elegido sobre la figura completa, para sombrearlo mientras se elige otro. */
  const tramoElegidoPx = (): [number, number] | null => {
    const e = eje()
    const r = e && herramienta() === 'rango' ? rangoEfectivo(estado().rango, e.total) : null
    if (!e || !r) return null
    return [aPixel(r.min, e.mapa.dom, e.mapa.escala, e.mapa.px0, e.mapa.px1), aPixel(r.max, e.mapa.dom, e.mapa.escala, e.mapa.px0, e.mapa.px1)]
  }
  const recortado = () => {
    const e = eje()
    return !!e && !!rangoEfectivo(estado().rango, e.total)
  }
  const rotuloTramo = () => {
    const e = eje()
    const r = e ? vistaDelEje() : null
    const o = e?.origen ?? 0
    return r ? `De ${formatearSI(r.min - o, props.unidadTramo)} a ${formatearSI(r.max - o, props.unidadTramo)}` : 'Todo el eje'
  }
  const pie = () => {
    const f = figura()
    const o = props.opciones
    if (o.formato === 'png') return `${f.ancho * o.escala} × ${f.alto * o.escala} px`
    if (o.formato === 'csv') return props.pieCsv?.(estado()) ?? ''
    return `${mm((f.ancho * 25.4) / 96)} × ${mm((f.alto * 25.4) / 96)}`
  }
  const motivoNo = () => props.motivoNo?.(estado())
  const alArrastrarEje = (id: string, fx: number, fy: number) => {
    const area = geo()?.area
    if (!area) return
    const llave = id.slice(4)
    const traza = id === 'eje:x' ? undefined : trazas().find((x) => x.clave === props.claveDeTraza(llave.split('#')[0]) || x.clave === llave.split('#')[0])
    aplicar((e) => acomodarEje(e, id, area, fx, fy, traza?.clave ?? null, traza?.lado ?? 'izquierda'), `acomodar:${id}`)
  }
  const alRango = (a: number, b: number) => {
    const e = eje()
    if (!e) return
    const m = e.mapa
    const v0 = deValor(a, m.dom, m.escala, m.px0, m.px1)
    const v1 = deValor(b, m.dom, m.escala, m.px0, m.px1)
    aplicar((x) => aplicarTramo(x, { desde: v0, hasta: v1 }))
    cerrar()
    setHerramienta('seleccionar')
  }
  const exportar = () => {
    const err = props.onGuardar?.(estado().anot)
    setAviso(err ?? '')
    props.onExportar(estado())
  }

  // ---------- Lo que ve el panel cuando no hay nada elegido ----------
  const panelAspecto = () => ({
    aspecto: estado().aspecto,
    onAspecto: (p: Partial<AspectoGrafica>) => {
      aplicar((e) => cambiarAspecto(e, p), `aspecto:${Object.keys(p).join(',')}`)
      if (p.tema) props.onCambiar({ tema: p.tema })
    },
    trazas: trazas(),
    onTraza: (clave: string, p: Partial<AspectoTraza>) => aplicar((e) => cambiarTraza(e, clave, p)),
    modo: 'lineas' as const,
    sinColor: true,
    sinLectura: true,
    temaExplicito: true,
    sinAsas: true,
    conGrosores: true,
    ejeX: props.ejeX,
    onRestablecer: () => {}
  })
  const opcionesArchivo = () => ({ op: props.opciones, formato: props.opciones.formato, onCambiar: props.onCambiar, series: [], sinRejilla: true })
  // El orden del panel sin nada elegido lo fijó el equipo revisor: restablecer, datos, tema, mostrar, letra, texto, rejilla, grosores, adornos.
  const seccionFigura = () => (
    <>
      <button type="button" class="boton editor-restablecer" data-zona="restablecer" onClick={() => aplicar(() => props.inicial)}>
        Restablecer figura
      </button>
      <Show when={datos().length > 1}>
        <div data-zona="datos">
          <Bloque titulo="Datos" resumen={`${datos().filter((d) => d.activo && !d.sinDato).length} de ${datos().length}`} abierto>
            <ChipsDatos rotulo="Qué se exporta" datos={datos()} onAlternar={(id) => aplicar((e) => alternarTraza(e, id, todas()))} />
          </Bloque>
        </div>
      </Show>
      <Show when={lineas() && !csv()}>
        {/* Cada zona lleva su marca para que el tutorial la enmarque. */}
        <div data-zona="tema">
          <ControlTema {...panelAspecto()} />
        </div>
        <div data-zona="mostrar">
          <CamposDeFondo {...opcionesArchivo()} />
        </div>
        <div data-zona="letra">
          <CamposDeLetra {...opcionesArchivo()} />
        </div>
        <div data-zona="texto">
          <SeccionTextos {...panelAspecto()} sinTamanoTexto />
        </div>
        <div data-zona="rejilla">
          <ControlRejilla {...panelAspecto()} />
          <GrosorRejilla {...panelAspecto()} />
          <SubdivisionesEjes {...panelAspecto()} />
        </div>
        <div data-zona="ejes">
          <GrosorEjes {...panelAspecto()} />
        </div>
        <div data-zona="adornos">
          <CamposDeAdornos adornos={estado().adornos} onCambiar={(p) => aplicar((e) => cambiarAdornos(e, p))} />
        </div>
        <GrosorTrazas {...panelAspecto()} />
      </Show>
      <Bloque titulo="Archivo" resumen={NOMBRE_FORMATO_FIGURA[props.opciones.formato]} abierto={csv()}>
        <CamposDeArchivo {...opcionesArchivo()} sinLetra={lineas() && !csv()} />
      </Bloque>
    </>
  )

  const cabeza = (
    <>
      <Show when={lineas() || props.tipo === 'pantalla'}>
        <SelectorEstilo
          elegido={preajusteDe(estado().adornos)}
          onElegir={(n) =>
            {
              aplicar((e) => {
                const r = aplicarPreajuste(props.tipo, n, e.aspecto)
                return { ...e, aspecto: r.aspecto, adornos: r.adornos }
              })
              if (n === 'informe') avisarFigura('informe')
            }
          }
        />
      </Show>
      <div class="editor-historial" role="group" aria-label="Deshacer y rehacer">
        <button type="button" class="boton-icono" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={!puedeDeshacer(h())} onClick={deshacerTodo}>
          <IconoDeshacer />
        </button>
        <button type="button" class="boton-icono" aria-label="Rehacer" title="Rehacer (Ctrl+Y)" disabled={!puedeRehacer(h())} onClick={rehacerTodo}>
          <IconoRehacer />
        </button>
      </div>
    </>
  )

  return (
    <Dialogo titulo={props.titulo} clase="exportar-editor" onCerrar={props.onCerrar} cabeza={cabeza}>
      <div class="editor" on:keydown={tecla} onChange={cerrar} onPointerUp={cerrar}>
        <div class="editor-cuerpo">
          <div class="editor-herramientas" role="toolbar" aria-orientation="vertical" aria-label="Herramientas de la figura">
            <For each={HERRAMIENTAS}>
              {(t) => (
                <button
                  type="button"
                  class="boton-icono editor-herramienta"
                  aria-pressed={herramienta() === t.id}
                  aria-label={`${t.nombre} (${t.tecla})`}
                  title={`${t.nombre} (${t.tecla}). ${t.ayuda}.`}
                  disabled={csv() || (t.id === 'rango' && !eje()) || ((t.id === 'etiqueta' || t.id === 'rango') && !lineas())}
                  onClick={() => {
                    if (t.id === 'texto' && !puede('texto')) return
                    if (t.id === 'flecha' && !puede('flecha')) return
                    if (t.id === 'etiqueta' && !puede('etiqueta')) return
                    setHerramienta(t.id)
                    if (t.id !== 'seleccionar') elegir(null)
                  }}
                >
                  {t.icono()}
                </button>
              )}
            </For>
          </div>
          <div class="editor-centro">
            <Show when={!csv()} fallback={props.vistaCsv?.(estado())}>
              <p class="editor-pista" role="status">
                {herramienta() === 'seleccionar' ? `Rueda para acercar. Arrastra el fondo para mover. Da clic para modificar algo específico.${sel() ? ' Con Mayús y clic sumas otro del mismo tipo.' : ''}` : HERRAMIENTAS.find((t) => t.id === herramienta())!.ayuda + '.'}
              </p>
              <VistaEditor
                figura={figura()}
                anot={estado().anot}
                sel={sel()}
                extras={extras()}
                herramienta={herramienta()}
                tramoPx={tramoElegidoPx()}
                ancla={ancla()}
                onSel={(s, a, aditivo) => (aditivo && s ? sumar(s, a) : elegir(s, a))}
                onAgregarTexto={(fx, fy) => puede('texto') && alAgregar(agregarTexto(estado(), fx, fy), 'texto')}
                onAgregarFlecha={(x1, y1, x2, y2) => puede('flecha') && alAgregar(agregarFlecha(estado(), x1, y1, x2, y2), 'flecha')}
                onAgregarEtiqueta={(t, x, dx, dy) => puede('etiqueta') && alAgregar(agregarEtiqueta(estado(), t, x, dx, dy), 'etiqueta')}
                onMover={(s, dx, dy) => aplicar((e) => moverNota(e, s, dx, dy, figura()), `mover:${s.id}`)}
                onMoverExtremo={(id, cual, fx, fy) => aplicar((e) => editarFlecha(e, id, cual === 1 ? { x1: fx, y1: fy } : { x2: fx, y2: fy }), `extremo:${id}:${cual}`)}
                onRango={alRango}
                onArrastrarEje={alArrastrarEje}
                onFinGesto={cerrar}
                onEditarTexto={(id) => {
                  elegir({ tipo: 'texto', id })
                  setEnfocarTexto((n) => n + 1)
                }}
                barra={() => (
                  <Show when={sel()}>
                    {(s) => <BarraFlotante estado={estado()} sel={s()} trazas={trazas()} claveDeTraza={props.claveDeTraza} aplicar={aplicarGrupo} onBorrar={borrar} />}
                  </Show>
                )}
              />
            </Show>
          </div>
          <PanelPropiedades
            estado={estado()}
            sel={sel()}
            extras={extras()}
            onSel={(s) => elegir(s)}
            items={items()}
            geo={geo()}
            trazas={trazas()}
            claveDeTraza={props.claveDeTraza}
            ejeX={props.ejeX}
            aplicar={aplicarGrupo}
            todas={todas()}
            enfocarTexto={enfocarTexto()}
            tamGeneral={props.opciones.tamañoLetra}
            conRango={props.tipo === 'grafica' || props.tipo === 'pantalla'}
            figura={seccionFigura()}
            onBorrar={borrar}
          />
        </div>
        <div class="editor-pie">
          <Show when={eje() && !csv()}>
            <div class="editor-pie-rango" title="Arrastra los extremos o escribe Desde y Hasta para elegir qué parte de la gráfica se exporta.">
              <span class="editor-pie-rotulo">Tramo a exportar</span>
              <RangoDoble compacto decimales={decimalesDelEje()} eje={eje()!} vista={vistaDelEje()!} recortado={recortado()} onCambiar={(r) => aplicar((e) => aplicarTramo(e, r))} />
              <output class="cifra editor-pie-tramo" aria-live="polite">
                {rotuloTramo()}
              </output>
            </div>
          </Show>
          <div class="editor-pie-formato">
            <CampoFormato formatos={props.formatos} formato={props.opciones.formato} onFormato={(formato) => props.onCambiar({ formato })} />
          </div>
          <div class="editor-pie-tamano">
            <span class="editor-pie-rotulo">Tamaño</span>
            <output class="cifra" aria-live="polite">
              {pie()}
            </output>
            <Show when={props.opciones.formato === 'png'}>
              <label class="editor-escala">
                <span class="solo-lectores">Resolución</span>
                <select class="campo" value={props.opciones.escala} onChange={(e) => props.onCambiar({ escala: Number(e.currentTarget.value) as OpcionesFigura['escala'] })}>
                  <For each={ESCALAS_PNG}>{(s) => <option value={s}>×{s}</option>}</For>
                </select>
              </label>
            </Show>
          </div>
          <div class="editor-pie-acciones">
            <Show when={motivoNo() || aviso()}>
              <p class="editor-aviso" role="status">
                {motivoNo() || aviso()}
              </p>
            </Show>
            <button type="button" class="boton" onClick={props.onCerrar}>
              Cancelar
            </button>
            <button type="button" class="boton principal" disabled={!!motivoNo() || props.ocupado} onClick={exportar}>
              {props.ocupado ? 'Exportando…' : 'Exportar'}
            </button>
          </div>
        </div>
      </div>
    </Dialogo>
  )
}

/** Guarda una figura anotada en una propiedad de texto: el texto o el motivo por el que no cabe. */
export const textoDeAnotaciones = escribirAnotaciones
