import { createMemo, createSignal, For, Show, type JSX } from 'solid-js'
import type { Tema, TonoFigura } from '../../../../compartido/ajustes'
import type { AnalisisDoc } from '../../../../compartido/analisis/config'
import type { ResultadoMapeado } from '../../../../compartido/analisis/resultados'
import { anotacionesDeDoc, anotacionesParaDoc, type Anotaciones } from '../../../../compartido/grafica/anotaciones'
import { aspectoDeGrafica, graficaDeAspecto, trazasDeGrafica, type AspectoGrafica, type AspectoTraza, type GraficaDoc, type LadoEjeY, type PosicionEjeX } from '../../../../compartido/grafica/aspecto'
import { candidatosXY, modeloDeResultado, modeloXY } from '../../analisis/modeloGrafica'
import IconoCinta from '../cinta/IconoCinta'
import BarraInstrumento from '../instrumento/BarraInstrumento'
import { accionDeTecla } from '../instrumento/barra'
import type { TrazaVista } from './AspectoPanel'
import HojaAspecto from './HojaAspecto'
import { geometriaGrafica, lineasDeCursores, lineasDeCursoresCompactas } from './dibujo'
import type { EntradaFigura } from './figura'
import { cursoresInicialesXY } from './xy'
import { cursoresIniciales, desplazarBoton, puedeDesplazar, zoomBoton, type EjeZoom } from './gestos'
import GraficaCanvas from './GraficaCanvas'
import { trazasUnicas, VISTA_COMPLETA, type VistaGrafica } from './modelo'
import { resumenDeModelo, tablaDeModelo } from './tablaGrafica'

export interface DatosCorrida {
  nombre: string
  analisis: AnalisisDoc
  mapeado: ResultadoMapeado
}

interface Props {
  corrida: DatosCorrida
  tema: Tema
  /** Guarda el aspecto con el análisis; devuelve por qué no se pudo (o null). Sin esto el aspecto vale solo mientras la ventana está abierta. */
  onGrafica?(g: GraficaDoc | undefined): string | null
  /** Abre el diálogo de exportar con la gráfica tal como se ve. */
  onExportar?(e: EntradaFigura): void
  /** Abre esta gráfica en una ventana aparte; en la ventana aparte misma es «Acoplar» (la cierra y la vista vuelve a la franja). */
  onVentana?(): void
  /** El título y el estado a la izquierda de la barra (por omisión, el nombre de la corrida). */
  titulo?: JSX.Element
  /** «Quitar esta corrida»: un botón del grupo de la derecha, junto a «Ventana». */
  onQuitar?(): void
  /** Es la ventana aparte: el botón de ventana dice «Acoplar». */
  enVentana?: boolean
  /** La vista (zoom, cursores, trazas apagadas) que trae una ventana nueva. */
  vistaInicial?: VistaGrafica
  /** Avisa cada vez que cambia la vista (para pasarla a la ventana aparte o al diálogo). */
  onVista?(v: VistaGrafica): void
}

/** Los datos del eje vertical donde cabe una gráfica cualquiera: sirven para saber hacia dónde mueven los botones, no para dibujar. */
const GEO_BOTONES = { w: 900, h: 400, dpr: 1 }

/**
 * Gráfica de una corrida: lienzo interactivo, zoom, leyenda que enciende y apaga trazas, cursores y aspecto. El aspecto se guarda con el análisis.
 */
export default function GraficaCorrida(props: Props) {
  const inicial = () => props.corrida.analisis.grafica
  const [aspecto, setAspecto] = createSignal<AspectoGrafica>(aspectoDeGrafica(inicial()))
  const [elegidas, setElegidas] = createSignal<Record<string, AspectoTraza>>(trazasDeGrafica(inicial()))
  const [notas, setNotas] = createSignal<GraficaDoc['anotaciones']>(inicial()?.anotaciones)
  const [vista, setVista] = createSignal<VistaGrafica>(props.vistaInicial ?? VISTA_COMPLETA)
  const [aviso, setAviso] = createSignal<string | null>(null)
  const [ejeZoom, setEjeZoom] = createSignal<EjeZoom>('ambos')
  const [detalleCursores, setDetalleCursores] = createSignal(false)
  const modeloBase = createMemo(() => modeloDeResultado(props.corrida.mapeado, elegidas(), { dbAbsoluto: aspecto().dbAbsoluto === true, informe: aspecto().informe === true }))
  const candidatosX = createMemo(() => candidatosXY(modeloBase()))
  // X-Y: con una traza elegida como eje horizontal, las demás se dibujan contra ella; si ya no existe, vuelve el eje de siempre.
  const modelo = createMemo(() => {
    const base = modeloBase()
    const k = aspecto().ejeXTraza
    return base && k ? (modeloXY(base, k) ?? base) : base
  })
  const cambiarVista = (v: VistaGrafica) => {
    setVista(v)
    props.onVista?.(v)
  }
  const guardar = (a: AspectoGrafica, t: Record<string, AspectoTraza>) => {
    setAspecto(a)
    setElegidas(t)
    // Las anotaciones del editor de exportar viven en la misma configuración: cambiar el aspecto no las borra.
    const g = { ...graficaDeAspecto(a, t), ...(notas() ? { anotaciones: notas() } : {}) }
    setAviso(props.onGrafica?.(Object.keys(g).length > 0 ? g : undefined) ?? null)
  }
  const cambiarAspecto = (p: Partial<AspectoGrafica>) => guardar({ ...aspecto(), ...p }, elegidas())
  const cambiarTraza = (clave: string, p: Partial<AspectoTraza>) => {
    const lado = modelo()?.trazas.find((t) => t.clave === clave)?.lado ?? 'izquierda'
    const actual = elegidas()[clave] ?? { lado, color: null }
    guardar(aspecto(), { ...elegidas(), [clave]: { ...actual, ...p } })
  }
  /** Mover un eje vertical con el ratón: todas las trazas que lo comparten pasan al lado nuevo en un solo cambio. */
  const moverEjeY = (claves: readonly string[], lado: LadoEjeY) => {
    const m = modelo()
    const sig = { ...elegidas() }
    for (const k of claves) sig[k] = { ...(sig[k] ?? { lado: m?.trazas.find((t) => t.clave === k)?.lado ?? 'izquierda', color: null }), lado }
    guardar(aspecto(), sig)
  }
  const restablecer = () => guardar({ ...aspectoDeGrafica(undefined), ...(aspecto().dbAbsoluto ? { dbAbsoluto: true } : {}) }, {})
  const trazasVista = createMemo((): TrazaVista[] => {
    const m = modelo()
    if (!m) return []
    if (m.tipo === 'barras') return (m.barras?.series ?? []).map((s) => ({ clave: s.clave, etiqueta: s.etiqueta, tono: s.tono, lado: 'izquierda', tonoElegido: elegidas()[s.clave]?.color ?? null, grosor: null, prefijo: null, unidad: '' }))
    return trazasUnicas(m.trazas).map((t) => {
      const e = elegidas()[t.clave]
      return { clave: t.clave, etiqueta: t.etiqueta, tono: t.tono, lado: t.lado, tonoElegido: (e?.color ?? null) as TonoFigura | null, grosor: e?.grosor ?? null, prefijo: e?.prefijo ?? null, decimales: e?.decimales, rango: e?.rango, unidad: t.unidad }
    })
  })
  const alternar = (clave: string) => {
    const o = new Set(vista().ocultas)
    if (o.has(clave)) o.delete(clave)
    else o.add(clave)
    cambiarVista({ ...vista(), ocultas: o })
  }
  const geo = () => {
    const m = modelo()
    return m ? geometriaGrafica(m, vista(), aspecto(), GEO_BOTONES.w, GEO_BOTONES.h, GEO_BOTONES.dpr) : null
  }
  const cursoresEncendidos = () => vista().cursores !== null && (!modelo()?.xy || !!vista().cursoresY)
  const alternarCursores = () => {
    const m = modelo()
    const g = geo()
    if (!m || !g || m.tipo !== 'lineas') return
    if (cursoresEncendidos()) cambiarVista({ ...vista(), cursores: null, cursoresY: null })
    else cambiarVista({ ...vista(), ...(m.xy ? cursoresInicialesXY(m, vista()) : { cursores: cursoresIniciales(g) }) })
  }
  const vistaCambiada = () => vista().x !== null || vista().y.some((f) => f !== null)
  const ajustar = () => cambiarVista({ ...vista(), x: null, y: [] })
  const acercar = (dir: 1 | -1) => {
    const m = modelo()
    const g = geo()
    if (m && g) cambiarVista(zoomBoton(g, vista(), dir, ejeZoom(), m.ejeX.datos))
  }
  const mover = (dx: -1 | 0 | 1, dy: -1 | 0 | 1) => {
    const m = modelo()
    const g = geo()
    if (m && g) cambiarVista(desplazarBoton(g, vista(), dx, dy, m.ejeX.datos))
  }
  const ampliacion = () => {
    const m = modelo()
    const g = geo()
    if (!m || !g || m.tipo !== 'lineas') return 1
    const t = (v: number) => (g.escalaX === 'log' ? Math.log10(v) : v)
    const total = t(m.ejeX.datos.max) - t(m.ejeX.datos.min)
    const visto = t(g.x.max) - t(g.x.min)
    return visto > 0 ? total / visto : 1
  }
  const lectura = () => {
    const m = modelo()
    const g = geo()
    if (!m || !g || m.tipo !== 'lineas') return []
    return detalleCursores() ? lineasDeCursores(m, vista(), g) : lineasDeCursoresCompactas(m, vista(), g)
  }
  const descripcion = () => {
    const m = modelo()
    if (!m) return ''
    const ayuda = m.tipo === 'lineas' ? ' Teclado: + y − acercan, Ctrl y flechas desplazan, Inicio restablece.' : ''
    return `${resumenDeModelo(m, vista())}${m.paneles.length > 1 ? ' Con magnitud y fase.' : ''}${ayuda} Los valores están en «Ver como tabla».`
  }
  const [tablaAbierta, setTablaAbierta] = createSignal(false)
  const tabla = createMemo(() => {
    const m = modelo()
    return tablaAbierta() && m ? tablaDeModelo(m, vista()) : []
  })
  const entrada = (): EntradaFigura | null => {
    const m = modelo()
    return m
      ? {
          titulo: props.corrida.nombre,
          subtitulo: m.tipo === 'barras' ? 'Armónicos de la señal' : `Datos de ${props.corrida.analisis.nombre}`,
          modelo: m,
          vista: vista(),
          aspecto: m.xy ? { ...aspecto(), lectura: false } : aspecto(),
          anotaciones: anotacionesDeDoc(notas()),
          onGuardarNotas: (a: Anotaciones) => {
            const doc = anotacionesParaDoc(a) as GraficaDoc['anotaciones']
            setNotas(doc)
            const g = { ...graficaDeAspecto(aspecto(), elegidas()), ...(doc ? { anotaciones: doc } : {}) }
            return props.onGrafica?.(Object.keys(g).length > 0 ? g : undefined) ?? null
          }
        }
      : null
  }
  let raiz: HTMLDivElement | undefined
  /** Las teclas de la barra con el foco en la gráfica (el zoom con + y − ya las atiende el propio lienzo). */
  const teclaBarra = (e: KeyboardEvent) => {
    const a = accionDeTecla(e)
    if (a !== 'cursores' && a !== 'exportar' && a !== 'ventana' && a !== 'aspecto') return
    if ((e.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) return
    const botón = raiz?.querySelector<HTMLButtonElement>(`.barra-instrumento [data-accion="${a}"]`)
    if (!botón || botón.disabled) return
    e.preventDefault()
    botón.click()
  }
  const [aspectoAbierto, setAspectoAbierto] = createSignal(false)
  let botonAspecto: HTMLButtonElement | undefined
  const abrirAspecto = () => {
    setAspectoAbierto(true)
    queueMicrotask(() => raiz?.querySelector<HTMLElement>('#gr-aspecto .hoja-cerrar')?.focus())
  }
  const cerrarAspecto = (volverFoco: boolean) => {
    setAspectoAbierto(false)
    if (volverFoco) botonAspecto?.focus()
  }
  const sinEditar = () => !props.onGrafica
  const etiquetaEjeX = (nombre: string) => (nombre.toLowerCase().startsWith('frec') ? 'Eje de frecuencia' : nombre.toLowerCase().startsWith('tiempo') ? 'Eje del tiempo' : 'Eje horizontal')

  return (
    <Show when={modelo()} fallback={
        <>
          <Show when={props.titulo}>
            <div class="gr-cabeza">
              <h3>{props.titulo}</h3>
              <Show when={props.onQuitar}>
                <button type="button" class="boton" onClick={() => props.onQuitar!()}>
                  Quitar esta corrida
                </button>
              </Show>
            </div>
          </Show>
          <p class="secundario">Esta corrida no tiene curvas que dibujar.</p>
        </>
      }
    >
      {(m) => (
        <div class="gr-grafica" onKeyDown={teclaBarra} ref={(el) => (raiz = el)}>
          <BarraInstrumento
            etiqueta={`Barra del instrumento: ${props.corrida.nombre}`}
            enVentana={props.enVentana}
            inicio={props.titulo ?? <b class="gr-barra-nombre">{props.corrida.nombre}</b>}
            extraFin={
              props.onQuitar ? (
                <button type="button" class="bi-boton" data-tono="gris" data-accion="quitar" aria-label="Quitar esta corrida" onClick={() => props.onQuitar!()}>
                  <IconoCinta nombre="borrar" uso="grande" />
                  <span class="bi-corto">Quitar</span>
                  <span class="bi-globo" aria-hidden="true" data-nombre="Quitar esta corrida" data-atajo="" />
                </button>
              ) : undefined
            }
            botones={{
              ...(m().tipo === 'lineas'
                ? {
                    cursores: { onClick: alternarCursores, activo: cursoresEncendidos() },
                    acercar: { onClick: () => acercar(-1) },
                    alejar: { onClick: () => acercar(1), deshabilitado: !vistaCambiada() },
                    restablecer: { onClick: ajustar, deshabilitado: !vistaCambiada() }
                  }
                : {}),
              aspecto: { onClick: () => (aspectoAbierto() ? cerrarAspecto(false) : abrirAspecto()), expandido: aspectoAbierto(), controla: 'gr-aspecto', ref: (el: HTMLButtonElement) => (botonAspecto = el) },
              ...(props.onExportar ? { exportar: { onClick: () => entrada() && props.onExportar!(entrada()!) } } : {}),
              ...(props.onVentana ? { ventana: { onClick: () => props.onVentana!() } } : {})
            }}
          />
          <Show when={m().tipo === 'lineas'}>
            <div class="gr-barra gr-barra-mover" role="group" aria-label="Desplazamiento y zoom">
              <button type="button" class="boton gr-icono" aria-label="Mover la gráfica a la izquierda" title="Mover a la izquierda" disabled={!puedeDesplazar(vista()).x} onClick={() => mover(-1, 0)}>
                ←
              </button>
              <button type="button" class="boton gr-icono" aria-label="Mover la gráfica a la derecha" title="Mover a la derecha" disabled={!puedeDesplazar(vista()).x} onClick={() => mover(1, 0)}>
                →
              </button>
              <button type="button" class="boton gr-icono" aria-label="Mover la gráfica hacia arriba" title="Mover arriba" disabled={!puedeDesplazar(vista()).y} onClick={() => mover(0, 1)}>
                ↑
              </button>
              <button type="button" class="boton gr-icono" aria-label="Mover la gráfica hacia abajo" title="Mover abajo" disabled={!puedeDesplazar(vista()).y} onClick={() => mover(0, -1)}>
                ↓
              </button>
              <label class="gr-zoom-en">
                <span>Zoom en</span>
                <select class="campo" value={ejeZoom()} onChange={(e) => setEjeZoom(e.currentTarget.value as EjeZoom)}>
                  <option value="ambos">Ambos ejes</option>
                  <option value="x">Solo horizontal</option>
                  <option value="y">Solo vertical</option>
                </select>
              </label>
              <output class="gr-chip cifra" aria-label="Aumento">
                ×{ampliacion() >= 10 ? ampliacion().toFixed(0) : ampliacion().toFixed(1)}
              </output>
            </div>
          </Show>
          <Show when={aspectoAbierto()}>
            <HojaAspecto
              titulo="Aspecto de la gráfica"
              id="gr-aspecto"
              aspecto={aspecto()}
              onAspecto={cambiarAspecto}
              trazas={trazasVista()}
              onTraza={cambiarTraza}
              modo={m().tipo}
              conRango
              candidatosX={candidatosX()}
              nombreEjeBase={modeloBase()?.ejeX.nombre}
              ejeX={m().tipo === 'lineas' ? { etiqueta: m().xy ? 'Eje horizontal' : etiquetaEjeX(m().ejeX.nombre), unidad: m().ejeX.unidad, log: m().ejeX.escala === 'log' } : null}
              onRestablecer={restablecer}
              extra={
                props.corrida.mapeado.tipo === 'ac' ? (
                  <label class="asp-casilla">
                    <input type="checkbox" checked={aspecto().dbAbsoluto === true} onChange={(e) => cambiarAspecto({ dbAbsoluto: e.currentTarget.checked })} />
                    Magnitud absoluta en dBV (en lugar de la ganancia respecto a la fuente)
                  </label>
                ) : undefined
              }
              onCerrar={cerrarAspecto}
            />
          </Show>
          <div class="gr-cuerpo" data-lectura={lectura().length > 0 ? '' : undefined}>
            <div class="gr-principal">
              <div class="gr-marco" data-paneles={aspecto().informe ? m().paneles.length : 1}>
                <GraficaCanvas
                  modelo={m()}
                  vista={vista()}
                  aspecto={aspecto()}
                  tema={props.tema}
                  descripcion={descripcion()}
                  cursores={cursoresEncendidos()}
                  detalleCursores={detalleCursores()}
                  onVista={cambiarVista}
                  onEjeY={moverEjeY}
                  onEjeX={(pos: PosicionEjeX) => cambiarAspecto({ ejeX: pos })}
                />
              </div>
              <p class="gr-ayuda deriv">Rueda: acerca. Mayús + rueda: eje vertical. Arrastrar: caja de zoom. Arrastrar el asa de un eje: lo mueve.</p>
              <ul class="gr-leyenda" aria-label="Leyenda: clic para mostrar u ocultar una traza">
                <For each={trazasVista()}>
                  {(k) => (
                    <li>
                      <button type="button" class="gr-leyenda-item" data-tono-figura={k.tono} aria-pressed={!vista().ocultas.has(k.clave)} onClick={() => alternar(k.clave)}>
                        <span class="gr-muestra" aria-hidden="true" />
                        <span class="gr-leyenda-texto">{k.etiqueta}</span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </div>
            <Show when={lectura().length > 0}>
              <div class="gr-lectura-caja">
                <div class="gr-lectura cifra" role="status" aria-label="Valores bajo los cursores">
                  <For each={lectura()}>{(l) => <div>{l}</div>}</For>
                </div>
                <button type="button" class="boton" aria-expanded={detalleCursores()} onClick={() => setDetalleCursores((d) => !d)}>
                  {detalleCursores() ? 'Ocultar detalles' : 'Ver detalles'}
                </button>
              </div>
            </Show>
            <div class="gr-lado">
              <Show when={sinEditar()}>
                <p class="deriv">En esta ventana el aspecto vale mientras esté abierta; para guardarlo con el análisis, cámbialo en la ventana principal.</p>
              </Show>
              <Show when={aviso()}>
                <p class="fld-error" role="alert">
                  {aviso()}
                </p>
              </Show>
              <details class="mas-ajustes gr-tabla-datos" onToggle={(e) => setTablaAbierta(e.currentTarget.open)}>
                <summary>Ver como tabla</summary>
                <div class="gr-tabla-cuerpo">
                  <Show when={tabla().length === 0}>
                    <p class="deriv">No hay trazas visibles que mostrar.</p>
                  </Show>
                  <For each={tabla()}>
                    {(b) => (
                      <div class="gr-tabla-region" role="region" tabindex="0" aria-label={b.titulo || 'Valores de la gráfica'}>
                        <table class="gr-tabla">
                          <caption>{b.titulo || `Valores de ${props.corrida.nombre}`}</caption>
                          <thead>
                            <tr>
                              <For each={b.columnas}>{(c) => <th scope="col">{c}</th>}</For>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={b.filas}>
                              {(f) => (
                                <tr>
                                  <For each={f}>{(c, i) => (i() === 0 ? <th scope="row" class="cifra">{c}</th> : <td class="num cifra">{c}</td>)}</For>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    )}
                  </For>
                  <For each={tabla().filter((b) => b.nota)}>{(b) => <p class="deriv">{b.nota}</p>}</For>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
