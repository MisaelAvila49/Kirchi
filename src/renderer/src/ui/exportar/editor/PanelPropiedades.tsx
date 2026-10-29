import { createEffect, For, on, Show, type JSX } from 'solid-js'
import { GROSOR_FLECHA_RANGO, TAM_NOTA_RANGO, type TextoFijo } from '../../../../../compartido/grafica/anotaciones'
import {
  GROSOR_RANGO,
  LADOS_EJE_Y,
  NOMBRE_LADO,
  NOMBRE_PESO,
  NOMBRE_POSICION_X,
  PESOS_TEXTO,
  POSICIONES_EJE_X,
  PREFIJOS_EJE,
  TEXTO_TAM_BASE,
  TEXTO_TAM_RANGO,
  type LadoEjeY,
  type PesoTexto,
  type PosicionEjeX,
  type PrefijoEje
} from '../../../../../compartido/grafica/aspecto'
import { admitePrefijo, decimalesPorOmision, unidadConPrefijo } from '../../../../../compartido/grafica/ejes'
import { PastillasDecimales, type TrazaVista } from '../../grafica/AspectoPanel'
import CamposRango from '../../grafica/CamposRango'
import { Deslizador, Fila, Interruptor, Pastillas, Tonos } from './controles'
import { alternarTraza, cambiarAspecto, cambiarTraza, editarEtiqueta, editarFlecha, editarTexto, estiloEje, estiloTitulo, type EstadoEditor } from './edicion'
import { IconoBorrar } from './iconosEditor'
import { medirMono } from './etiquetas'
import type { GeometriaFigura } from './geometria'
import { resolverEtiqueta, type ItemObjeto, type Seleccion } from './objetos'

/** `forzar` nombra los campos de la traza que se igualan en todo el grupo aunque el principal ya los tuviera. */
export type Aplicar = (f: (e: EstadoEditor) => EstadoEditor, clave?: string, forzar?: readonly string[]) => void

interface Props {
  estado: EstadoEditor
  sel: Seleccion | null
  /** Los que se suman al principal con Mayús o Ctrl y clic: lo que se cambie aquí vale para todos. */
  extras?: readonly Seleccion[]
  onSel(s: Seleccion | null): void
  items: readonly ItemObjeto[]
  geo: GeometriaFigura | null
  trazas: readonly TrazaVista[]
  /** De la clave de un objeto de la figura a la de la traza que guarda su estilo (en un Bode, quita la unidad). */
  claveDeTraza(id: string): string
  ejeX: { etiqueta: string; unidad: string; log?: boolean; sinRango?: boolean } | null
  aplicar: Aplicar
  todas: readonly string[]
  /** Sube cada vez que hay que llevar el foco al texto (se acaba de poner uno nuevo o se hizo doble clic). */
  enfocarTexto: number
  /** El tamaño general de la letra de la figura: el de los ejes que no traen uno propio. */
  tamGeneral?: number
  /** Las gráficas de análisis dejan escribir el desde y el hasta de cada eje. */
  conRango?: boolean
  /** Lo que se muestra cuando no hay nada elegido: la figura entera. */
  figura: JSX.Element
  onBorrar(): void
}

const clave = (s: Seleccion) => `${s.tipo}:${s.id}`
const GROSORES = Array.from({ length: (GROSOR_RANGO[1] - GROSOR_RANGO[0]) * 2 + 1 }, (_, i) => GROSOR_RANGO[0] + i / 2)

function Titulo(props: { children: JSX.Element; borrar?: () => void }) {
  return (
    <div class="editor-seccion-cabeza">
      <h3 class="editor-seccion-titulo">{props.children}</h3>
      <Show when={props.borrar}>
        <button type="button" class="boton-icono" aria-label="Borrar" title="Borrar (Supr)" onClick={() => props.borrar!()}>
          <IconoBorrar />
        </button>
      </Show>
    </div>
  )
}

/**
 * Panel de la derecha: lista de lo elegible (la forma de elegir con teclado) y propiedades de lo elegido. Los cambios de un mismo arrastre se juntan en un paso.
 */
export default function PanelPropiedades(props: Props) {
  let textoEl: HTMLInputElement | undefined
  // El campo del texto aparece cuando se elige la nota: el foco se lleva un instante después de pintarlo.
  createEffect(
    on(
      () => props.enfocarTexto,
      (n) => {
        if (n > 0) setTimeout(() => (textoEl?.focus(), textoEl?.select()), 0)
      },
      { defer: true }
    )
  )
  const valorLista = () => (props.sel ? clave(props.sel) : '')
  const alElegir = (v: string) => {
    if (!v) return props.onSel(null)
    const it = props.items.find((i) => clave(i.sel) === v)
    props.onSel(it ? it.sel : null)
  }
  const a = props.aplicar
  const enGrupo = () => (props.extras?.length ?? 0) > 0

  // ----- Texto puesto a mano o título -----
  const textoDe = (s: Seleccion) => (s.tipo === 'texto' ? props.estado.anot.textos.find((t) => t.id === s.id) : undefined)
  const fijoDe = (id: string): TextoFijo => (id === 'subtitulo' ? 'subtitulo' : 'titulo')
  const baseFijo = (id: string) => (id === 'subtitulo' ? 12 : 16)
  const seccionTexto = (s: Seleccion) => {
    const nota = () => textoDe(s)
    const est = () => (s.tipo === 'fijo' ? props.estado.anot.estilos[fijoDe(s.id)] : undefined)
    const tam = () => nota()?.tam ?? est()?.tam ?? baseFijo(s.id)
    const negrita = () => nota()?.negrita ?? est()?.negrita ?? s.id === 'titulo'
    const tono = () => nota()?.tono ?? est()?.tono
    const cambiar = (p: { texto?: string | null; tam?: number; negrita?: boolean; tono?: import('../../../../../compartido/ajustes').TonoFigura | null }, k: string) => {
      if (s.tipo === 'texto') a((e) => editarTexto(e, s.id, { ...p, texto: p.texto ?? undefined, tono: p.tono ?? undefined }), `${clave(s)}:${k}`)
      else a((e) => estiloTitulo(e, fijoDe(s.id), p), `${clave(s)}:${k}`)
    }
    return (
      <>
        <Titulo borrar={s.tipo === 'texto' ? props.onBorrar : undefined}>{s.tipo === 'texto' ? 'Texto' : s.id === 'subtitulo' ? 'Subtítulo' : 'Título'}</Titulo>
        <Show when={!enGrupo()}>
        <label class="editor-campo">
          <span class="editor-rotulo">Texto</span>
          <input
            ref={textoEl}
            type="text"
            class="campo"
            maxLength={120}
            value={nota()?.texto ?? est()?.texto ?? ''}
            placeholder={s.tipo === 'fijo' ? 'Automático' : undefined}
            onInput={(e) => {
              const v = e.currentTarget.value
              if (s.tipo === 'texto' && v.trim() === '') return
              cambiar({ texto: v }, 'texto')
            }}
          />
        </label>
        </Show>
        <Show when={s.tipo === 'fijo'}>
          <p class="editor-nota">{est()?.texto === '' ? 'En blanco: no se dibuja.' : 'Vacío lo quita de la figura.'}</p>
          <Show when={est()?.texto !== undefined}>
            <button type="button" class="boton editor-restablecer" onClick={() => cambiar({ texto: null }, 'texto')}>
              Volver al texto automático
            </button>
          </Show>
        </Show>
        <Deslizador rotulo="Tamaño" min={TAM_NOTA_RANGO[0]} max={TAM_NOTA_RANGO[1]} valor={tam()} texto={`${tam()} px`} onCambiar={(v) => cambiar({ tam: v }, 'tam')} />
        <Interruptor rotulo="Negrita" activo={negrita()} onCambiar={(v) => cambiar({ negrita: v }, 'negrita')} />
        <Fila rotulo="Color">
          <Tonos nombre="Color del texto" valor={tono()} auto={s.tipo === 'fijo' ? 'el de siempre' : undefined} onElegir={(t) => cambiar({ tono: t }, 'tono')} />
        </Fila>
      </>
    )
  }

  // ----- Flecha -----
  const seccionFlecha = (s: Seleccion) => {
    const f = () => props.estado.anot.flechas.find((q) => q.id === s.id)
    return (
      <Show when={f()}>
        {(fl) => (
          <>
            <Titulo borrar={props.onBorrar}>Flecha</Titulo>
            <Deslizador rotulo="Grosor" min={GROSOR_FLECHA_RANGO[0]} max={GROSOR_FLECHA_RANGO[1]} valor={fl().grosor} texto={`${fl().grosor} px`} onCambiar={(v) => a((e) => editarFlecha(e, s.id, { grosor: v }), `flecha:${s.id}:grosor`)} />
            <Fila rotulo="Color">
              <Tonos nombre="Color de la flecha" valor={fl().tono} onElegir={(t) => t && a((e) => editarFlecha(e, s.id, { tono: t }))} />
            </Fila>
            <p class="editor-nota">Arrastra sus extremos para apuntar.</p>
          </>
        )}
      </Show>
    )
  }

  // ----- Etiqueta de valor -----
  const seccionEtiqueta = (s: Seleccion) => {
    const r = () => {
      const n = props.estado.anot.etiquetas.find((q) => q.id === s.id)
      return n && props.geo ? resolverEtiqueta(n, props.geo, medirMono) : null
    }
    return (
      <Show when={props.estado.anot.etiquetas.find((q) => q.id === s.id)}>
        {(n) => (
          <>
            <Titulo borrar={props.onBorrar}>Etiqueta de valor</Titulo>
            <Show when={r()}>
              {(q) => (
                <p class="editor-lectura cifra" role="status">
                  <span>{q().traza.etiqueta}</span>
                  <span>{q().renglones[0]}</span>
                  <span>{q().renglones[1]}</span>
                </p>
              )}
            </Show>
            <div class="editor-campo">
              <span class="editor-rotulo">Decimales de los valores</span>
              <PastillasDecimales nombre="Decimales de los valores de las etiquetas" valor={props.estado.aspecto.decimalesEtiquetas} omision={0} onCambiar={(d) => a((x) => cambiarAspecto(x, { decimalesEtiquetas: d }))} />
            </div>
            <Fila rotulo="Color">
              <Tonos nombre="Color de la etiqueta" valor={n().tono} auto="el de su traza" onElegir={(t) => a((e) => editarEtiqueta(e, s.id, { tono: t }))} />
            </Fila>
            <p class="editor-nota">Arrastra el globo para moverlo. Se pega al punto más cercano de su traza.</p>
          </>
        )}
      </Show>
    )
  }

  // ----- Traza -----
  const seccionTraza = (s: Seleccion) => {
    const k = () => props.claveDeTraza(s.id)
    const t = () => props.trazas.find((x) => x.clave === k())
    return (
      <Show when={t()}>
        {(tv) => (
          <>
            <Titulo>
              <span class="asp-muestra" data-tono-figura={tv().tono} aria-hidden="true" /> {tv().etiqueta}
            </Titulo>
            <Fila rotulo="Color">
              <Tonos nombre={`Color de ${tv().etiqueta}`} valor={tv().tonoElegido} auto="el tono predeterminado" onElegir={(c) => a((e) => cambiarTraza(e, k(), { color: c }), undefined, ['color'])} />
            </Fila>
            <Show when={tv().unidad !== ''}>
              <label class="editor-campo">
                <span class="editor-rotulo">Grosor</span>
                <select class="campo" value={tv().grosor === null ? '' : String(tv().grosor)} onChange={(e) => a((x) => cambiarTraza(x, k(), { grosor: e.currentTarget.value === '' ? null : Number(e.currentTarget.value) }), undefined, ['grosor'])}>
                  <option value="">Igual que la gráfica</option>
                  <For each={GROSORES}>{(g) => <option value={String(g)}>{g} px</option>}</For>
                </select>
              </label>
            </Show>
            <label class="editor-campo">
              <span class="editor-rotulo">Eje vertical</span>
              <select class="campo" value={tv().lado} onChange={(e) => a((x) => cambiarTraza(x, k(), { lado: e.currentTarget.value as LadoEjeY }), undefined, ['lado'])}>
                <For each={LADOS_EJE_Y}>{(l) => <option value={l}>{NOMBRE_LADO[l]}</option>}</For>
              </select>
            </label>
            <Show when={admitePrefijo(tv().unidad)}>
              <label class="editor-campo">
                <span class="editor-rotulo">Unidad del eje</span>
                <select class="campo" value={tv().prefijo ?? ''} onChange={(e) => a((x) => cambiarTraza(x, k(), { prefijo: (e.currentTarget.value || null) as PrefijoEje | null }))}>
                  <option value="">Automática</option>
                  <For each={PREFIJOS_EJE}>{(p) => <option value={p}>{unidadConPrefijo(tv().unidad, p)}</option>}</For>
                </select>
              </label>
            </Show>
            <div class="editor-campo">
              <span class="editor-rotulo">Decimales</span>
              <PastillasDecimales nombre="Decimales del eje" valor={tv().decimales} omision={decimalesPorOmision(tv().unidad)} onCambiar={(d) => a((x) => cambiarTraza(x, k(), { decimales: d }))} />
            </div>
            <Interruptor rotulo="Visible" activo={!props.estado.ocultas.includes(k())} deshabilitado={!props.estado.ocultas.includes(k()) && props.todas.filter((c) => !props.estado.ocultas.includes(c)).length <= 1} onCambiar={() => a((e) => alternarTraza(e, k(), props.todas))} />
          </>
        )}
      </Show>
    )
  }

  // ----- Eje -----
  const seccionEje = (s: Seleccion) => {
    const llave = () => s.id.slice(4)
    const esX = () => llave() === 'x'
    const traza = () => props.trazas.find((x) => x.clave === props.claveDeTraza(llave().split('#')[0]) || x.clave === llave().split('#')[0])
    const est = () => props.estado.anot.ejes[llave()]
    const asp = () => props.estado.aspecto
    const tam = () => est()?.tam ?? asp().textoTam ?? props.tamGeneral ?? TEXTO_TAM_BASE
    const grosorGeneral = () => asp().grosorEjes ?? 1
    const peso = () => est()?.peso ?? asp().textoPeso
    const claveT = () => traza()?.clave ?? ''
    const nombre = () => (esX() ? (props.ejeX?.etiqueta ?? 'Eje horizontal') : `Eje de ${traza()?.etiqueta ?? llave()}`)
    return (
      <>
        <Titulo>{nombre()}</Titulo>
        <label class="editor-campo">
          <span class="editor-rotulo">Título</span>
          <input type="text" class="campo" maxLength={40} value={est()?.titulo ?? ''} placeholder="Automático" onInput={(e) => a((x) => estiloEje(x, llave(), { titulo: e.currentTarget.value }), `eje:${llave()}:titulo`)} />
        </label>
        <Fila rotulo="Color">
          <Tonos nombre="Color de los números" valor={est()?.tono} auto={esX() ? 'el del texto de los ejes' : 'el de su traza'} onElegir={(t) => a((x) => estiloEje(x, llave(), { tono: t }))} />
        </Fila>
        <div class="editor-campo">
          <span class="editor-rotulo">Grosor del texto</span>
          <Pastillas<PesoTexto> nombre="Grosor del texto" valor={peso()} opciones={PESOS_TEXTO.map((p) => [p, NOMBRE_PESO[p]] as const)} onCambiar={(p) => a((x) => estiloEje(x, llave(), { peso: p === asp().textoPeso ? null : p }))} />
        </div>
        <Deslizador rotulo="Tamaño" min={TEXTO_TAM_RANGO[0]} max={TEXTO_TAM_RANGO[1]} valor={tam()} texto={`${tam()} px`} onCambiar={(v) => a((x) => estiloEje(x, llave(), { tam: v === (asp().textoTam ?? props.tamGeneral ?? TEXTO_TAM_BASE) ? null : v }), `eje:${llave()}:tam`)} />
        <Deslizador rotulo="Línea" min={0.5} max={4} paso={0.5} valor={est()?.grosor ?? grosorGeneral()} texto={`${est()?.grosor ?? grosorGeneral()} px`} onCambiar={(v) => a((x) => estiloEje(x, llave(), { grosor: v === grosorGeneral() ? null : v }), `eje:${llave()}:grosor`)} />
        <Show
          when={esX()}
          fallback={
            <Show when={traza()}>
              {(tv) => (
                <>
                  <label class="editor-campo">
                    <span class="editor-rotulo">Posición</span>
                    <select class="campo" value={tv().lado} onChange={(e) => a((x) => cambiarTraza(x, claveT(), { lado: e.currentTarget.value as LadoEjeY }))}>
                      <For each={LADOS_EJE_Y}>{(l) => <option value={l}>{NOMBRE_LADO[l]}</option>}</For>
                    </select>
                  </label>
                  <Show when={admitePrefijo(tv().unidad)}>
                    <label class="editor-campo">
                      <span class="editor-rotulo">Unidad</span>
                      <select class="campo" value={tv().prefijo ?? ''} onChange={(e) => a((x) => cambiarTraza(x, claveT(), { prefijo: (e.currentTarget.value || null) as PrefijoEje | null }))}>
                        <option value="">Automática</option>
                        <For each={PREFIJOS_EJE}>{(p) => <option value={p}>{unidadConPrefijo(tv().unidad, p)}</option>}</For>
                      </select>
                    </label>
                  </Show>
                </>
              )}
            </Show>
          }
        >
          <label class="editor-campo">
            <span class="editor-rotulo">Posición</span>
            <select class="campo" value={asp().ejeX} onChange={(e) => a((x) => cambiarAspecto(x, { ejeX: e.currentTarget.value as PosicionEjeX }))}>
              <For each={POSICIONES_EJE_X}>{(p) => <option value={p}>{NOMBRE_POSICION_X[p]}</option>}</For>
            </select>
          </label>
          <Show when={props.ejeX && admitePrefijo(props.ejeX.unidad)}>
            <label class="editor-campo">
              <span class="editor-rotulo">Unidad</span>
              <select class="campo" value={asp().prefijoX ?? ''} onChange={(e) => a((x) => cambiarAspecto(x, { prefijoX: (e.currentTarget.value || null) as PrefijoEje | null }))}>
                <option value="">Automática</option>
                <For each={PREFIJOS_EJE}>{(p) => <option value={p}>{unidadConPrefijo(props.ejeX!.unidad, p)}</option>}</For>
              </select>
            </label>
          </Show>
        </Show>
        <Show when={esX() ? props.ejeX : null} fallback={<Show when={traza()}>{(tv) => <PastillasDecimales nombre="Decimales del eje" valor={tv().decimales} omision={decimalesPorOmision(tv().unidad)} onCambiar={(d) => a((x) => cambiarTraza(x, claveT(), { decimales: d }))} />}</Show>}>
          {(ex) => <PastillasDecimales nombre="Decimales del eje" valor={asp().decimalesX} omision={decimalesPorOmision(ex().unidad)} onCambiar={(d) => a((x) => cambiarAspecto(x, { decimalesX: d }))} />}
        </Show>
        <Show when={props.conRango && (esX() ? props.ejeX && !props.ejeX.log && !props.ejeX.sinRango : traza())}>
          <CamposRango
            clase={{ fila: 'editor-campo', rotulo: 'editor-rotulo' }}
            nombre={nombre()}
            unidad={esX() ? props.ejeX!.unidad : (traza()?.unidad ?? '')}
            rango={esX() ? asp().rangoX : traza()?.rango}
            onRango={(r) => a((x) => (esX() ? cambiarAspecto(x, { rangoX: r }) : cambiarTraza(x, claveT(), { rango: r })))}
          />
        </Show>
        <Show when={est()}>
          <button type="button" class="boton editor-restablecer" onClick={() => a((x) => estiloEje(x, llave(), { titulo: null, tono: null, peso: null, tam: null, grosor: null }))}>
            Quitar el estilo propio de este eje
          </button>
        </Show>
      </>
    )
  }

  return (
    <aside class="editor-panel" aria-label="Propiedades">
      <label class="editor-campo editor-objeto">
        <span class="editor-rotulo">Objeto</span>
        <select class="campo" value={valorLista()} onChange={(e) => alElegir(e.currentTarget.value)} aria-label="Objeto de la figura que se edita">
          <option value="" selected={valorLista() === ''}>
            Toda la figura
          </option>
          <For each={props.items}>
            {(i) => (
              <option value={clave(i.sel)} selected={valorLista() === clave(i.sel)}>
                {i.etiqueta}
              </option>
            )}
          </For>
        </select>
      </label>
      <div class="editor-propiedades">
        <Show when={props.sel} fallback={props.figura}>
          {(s) => (
            <Show when={s().tipo} keyed>
              {(tipo) => (
                <>
                  <Show when={enGrupo()}>
                    <p class="editor-nota editor-grupo" role="status">
                      {`${1 + (props.extras?.length ?? 0)} elegidos del mismo tipo: lo que cambies se aplica a todos.`}
                    </p>
                  </Show>
                  {tipo === 'texto' || tipo === 'fijo' ? seccionTexto(s()) : null}
                  {tipo === 'flecha' ? seccionFlecha(s()) : null}
                  {tipo === 'etiqueta' ? seccionEtiqueta(s()) : null}
                  {tipo === 'traza' ? seccionTraza(s()) : null}
                  {tipo === 'eje' ? seccionEje(s()) : null}
                </>
              )}
            </Show>
          )}
        </Show>
      </div>
    </aside>
  )
}

