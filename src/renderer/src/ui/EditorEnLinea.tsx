import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import type { CampoPedido, PedidoCampos, PedidoTexto, RevisionCampo } from '../editor/Editor'
import { AJUSTES_POR_OMISION, ajustesDeTextos } from '../instrumentos/generadorEdicion'
import { formatearValor, leerValor } from '../valores/valores'
import { acotar } from './buscadorUtil'
import CampoValor from './CampoValor'
import FichaCatalogo from './FichaCatalogo'
import FichaComunes from './FichaComunes'
import FichaPersonalizado from './FichaPersonalizado'
import FichaGenerador from './FichaGenerador'
import FichaSerie from './FichaSerie'
import OpcionConMuestra, { BotonDeLista } from './OpcionConMuestra'
import TablaDeModelos from './TablaModelos'
import { repartirCampos } from './vistaInspector'

const TITULOS: Record<PedidoTexto['tipo'], string> = {
  etiqueta: 'Nombre de la red',
  nota: 'Texto de la nota'
}

// Medidas aproximadas del campo (min-width 220 px más relleno; cada campo suma su rótulo y su renglón de mensaje) para no
// salirse de la ventana. La ficha de una pieza (referencia arriba a la derecha) mide el alto real y lo corrige al abrir.
const ANCHO = 240
const ANCHO_FICHA = 330
const ALTO_CAMPO = 70
const ALTO_NOTA = 130
const ALTO_FICHA = 150

interface Props {
  pedido: PedidoTexto | PedidoCampos
  /** Coordenadas de ventana del elemento que se edita. */
  x: number
  y: number
  onCerrar(): void
}

interface Campo {
  id: string
  titulo: string
  inicial: string
  multilinea: boolean
  /** Lista cerrada (el color de un LED): una lista desplegable compacta. */
  opciones?: string[]
  muestras?: Record<string, string>
  unidad?: string
  serie?: CampoPedido['serie']
  catalogo?: string[]
  comunes?: string[]
  tabla?: CampoPedido['tabla']
  personalizado?: CampoPedido['personalizado']
}

/**
 * Campos sobre el lienzo. Enter acepta (Ctrl+Enter en notas), Esc y clic derecho cancelan, y el clic que cierra no actúa además sobre el esquema. Los campos de una pieza se aceptan juntos en un paso de deshacer.
 */
export default function EditorEnLinea(props: Props) {
  const p = props.pedido
  const campos: Campo[] =
    p.tipo === 'pieza'
      ? p.campos.map((c) => ({ id: c.id, titulo: c.titulo, inicial: c.inicial, multilinea: false, opciones: c.opciones, muestras: c.muestras, unidad: c.unidad, serie: c.serie, catalogo: c.catalogo, comunes: c.comunes, tabla: c.tabla, personalizado: c.personalizado }))
      : [{ id: 'texto', titulo: TITULOS[p.tipo], inicial: p.inicial, multilinea: p.multilinea }]
  // La ficha compacta es la de toda pieza: el terminal de alimentación (nombre y voltaje) también, sin recuadro de
  // referencia porque su nombre es la red.
  const ficha = p.tipo === 'pieza'
  const conReferencia = ficha && campos[0]?.id === 'ref'
  const esGenerador = conReferencia && campos.some((c) => c.id === 'num:minimo')
  const [valores, setValores] = createSignal(campos.map((c) => c.inicial))
  const [tocados, setTocados] = createSignal(campos.map(() => false))
  const [errores, setErrores] = createSignal<(string | null)[]>(campos.map(() => null))
  const [masAbierto, setMasAbierto] = createSignal(false)
  const [altoReal, setAltoReal] = createSignal(0)
  const revision = createMemo((): RevisionCampo[] => {
    if (p.tipo === 'pieza') return p.revisar(valores())
    const nota = p.revisar?.(valores()[0])
    return [nota ? { nota } : {}]
  })
  /** Lo que muestra el campo `i`: lo fijo, lo que sigue a otro campo mientras no se toca, o lo escrito. */
  const mostrado = (i: number): string => {
    const r = revision()[i] ?? {}
    if (r.fijo) return r.fijo.texto
    if (!tocados()[i] && r.sigue !== undefined) return r.sigue
    return valores()[i]
  }
  const elementos: (HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined)[] = []
  let caja!: HTMLDivElement
  let cerrado = false
  // La ficha del generador vuelve a montar su campo al cambiar de Frecuencia a Periodo: el foco inicial se da una sola vez.
  let focoDado = false
  onMount(() => {
    const i = p.tipo === 'pieza' ? p.foco : 0
    const c = elementos[i] ?? elementos[0]
    c?.focus()
    if (c && !(c instanceof HTMLSelectElement)) c.select()
    setAltoReal(caja.offsetHeight)
    const medidor = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => setAltoReal(caja.offsetHeight))
    medidor?.observe(caja)
    // En captura, antes de que el clic cambie el foco o llegue al lienzo.
    const pulsar = (e: PointerEvent) => {
      const dentro = caja.contains(e.target as Node)
      if (e.button === 2) cancelar()
      else if (dentro) return
      else aceptar()
      if ((e.target as Element | null)?.classList?.contains('lienzo-gl')) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    // Sin menú del navegador sobre los campos: el clic derecho ya canceló.
    const menu = (e: MouseEvent) => {
      if (caja.contains(e.target as Node)) e.preventDefault()
    }
    document.addEventListener('pointerdown', pulsar, true)
    document.addEventListener('contextmenu', menu, true)
    onCleanup(() => {
      medidor?.disconnect()
      document.removeEventListener('pointerdown', pulsar, true)
      document.removeEventListener('contextmenu', menu, true)
    })
  })
  const cerrar = () => {
    cerrado = true
    props.onCerrar()
  }
  const aceptar = () => {
    if (cerrado) return
    const vals = campos.map((_, i) => mostrado(i))
    let campo = 0, error: string | null = null
    if (p.tipo === 'pieza') {
      const r = p.aceptar(vals)
      if (r) ({ campo, error } = r)
    } else error = p.aceptar(vals[0])
    if (!error) return cerrar()
    setErrores(campos.map((_, i) => (i === campo ? error : null)))
    // Un error en lo que esconde «Más ajustes» lo abre; los campos de la ficha del generador no están en `elementos`.
    if (partes.mas.some((x) => x.i === campo)) setMasAbierto(true)
    queueMicrotask(() => (elementos[campo] ?? caja.querySelector<HTMLElement>('[aria-invalid="true"]'))?.focus())
  }
  const cancelar = () => {
    if (cerrado) return
    p.cancelar()
    cerrar()
  }
  // Salir del editor acepta lo escrito, también al cambiar de ventana (Alt+Tab). Pasar de un campo al otro no.
  const alSalir = (e: FocusEvent) => {
    const a = e.relatedTarget as Node | null
    if (a && caja.contains(a)) return
    aceptar()
  }
  // Un clic en un espacio vacío de la ventana no es salir: el navegador quitaría el foco al campo y `alSalir`
  // aceptaría y cerraría. Sin cambiar el foco, lo escrito y la ventana se quedan; los controles y rótulos siguen como siempre.
  const alPulsarDentro = (e: MouseEvent) => {
    if (e.button !== 0) return
    const t = e.target as Element | null
    if (!t?.closest || t.closest('input, textarea, select, button, a, label, summary, [tabindex], [contenteditable]')) return
    e.preventDefault()
  }
  // El editor se centra en x (translateX(-50%)): se acota para que no se salga de la ventana.
  const encabezado = p.tipo === 'pieza' ? (p.encabezado ?? p.nombre) : undefined
  const ancho = ficha ? ANCHO_FICHA : ANCHO
  const alto = () => altoReal() || (campos.some((c) => c.multilinea) ? ALTO_NOTA : ficha ? ALTO_FICHA + ALTO_CAMPO * (campos.length - 1) : ALTO_CAMPO * campos.length + 20 + (encabezado ? 22 : 0))
  const pos = () => ({
    left: acotar(props.x, ancho / 2 + 8, window.innerWidth - ancho / 2 - 8),
    top: acotar(props.y + 16, 8, window.innerHeight - alto() - 8)
  })
  const tecla = (e: KeyboardEvent, c: Campo) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    } else if (e.key === 'Enter' && (!c.multilinea || e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      aceptar()
    }
  }
  // Lo que no es un campo de texto (la ficha del generador, una casilla, una lista) también acepta con Enter y cierra con Esc.
  const teclaDeLaCaja = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelar()
    } else if (e.key === 'Enter' && e.target instanceof HTMLButtonElement && e.target.hasAttribute('data-eleccion')) {
      // Un valor de la serie, del catálogo o de la tabla de modelos: Enter lo elige y aplica (la barra espaciadora solo lo elige).
      e.preventDefault()
      e.target.click()
      aceptar()
    } else if (e.key === 'Enter' && (e.target instanceof HTMLSelectElement || (e.target instanceof HTMLInputElement && e.target.type !== 'text'))) {
      e.preventDefault()
      aceptar()
    }
  }
  const escribir = (i: number, t: string) => {
    setValores((v) => v.map((x, k) => (k === i ? t : x)))
    setTocados((v) => v.map((x, k) => x || k === i))
    setErrores((v) => v.map((x, k) => (k === i ? null : x)))
  }
  // El primer campo conserva el id de siempre (las pruebas y los guiones lo buscan); los demás llevan su número.
  const id = (i: number) => (i === 0 ? 'en-linea-campo' : `en-linea-campo-${i}`)

  /** Un renglón de campo: rótulo, control, error y nota. */
  const fila = (c: Campo, i: number) => {
    const r = () => revision()[i] ?? {}
    const error = () => errores()[i] ?? r().error ?? null
    const comun = {
      id: id(i),
      class: 'en-linea-campo',
      'aria-invalid': error() ? true : undefined,
      'aria-describedby': `en-linea-error-${i} en-linea-nota-${i}`
    }
    /** El campo de texto del valor; en un catálogo vive dentro de «Más ajustes». */
    const entrada = () =>
      c.unidad ? (
        <CampoValor
          texto={mostrado(i)}
          unidad={c.unidad}
          nombre={c.titulo}
          soloLectura={!!r().fijo}
          invalido={!!error()}
          atributos={{ id: comun.id, 'aria-label': c.catalogo ? c.titulo : undefined, 'aria-describedby': comun['aria-describedby'], 'aria-readonly': r().fijo ? true : undefined, class: r().fijo ? 'fijo' : '' }}
          campo={(el) => (elementos[i] = el)}
          onTexto={(t) => escribir(i, t)}
          onTecla={(e) => tecla(e, c)}
        />
      ) : (
      <input
        {...comun}
        aria-label={c.catalogo ? c.titulo : undefined}
        ref={(el) => (elementos[i] = el)}
        type="text"
        value={mostrado(i)}
        readOnly={!!r().fijo}
        aria-readonly={r().fijo ? true : undefined}
        classList={{ fijo: !!r().fijo }}
        aria-invalid={error() ? true : undefined}
        onInput={(e) => escribir(i, e.currentTarget.value)}
        onKeyDown={(e) => tecla(e, c)}
      />
      )
    const ancha = !!c.tabla || !!c.catalogo
    // Modelo «Personalizado»: casilla y parámetros de SPICE; lo escrito se acepta con los demás campos.
    if (c.personalizado)
      return (
        <div class="en-linea-fila fila-ancha">
          <span class="en-linea-titulo">{c.titulo}</span>
          <FichaPersonalizado
            id={id(i)}
            texto={mostrado(i)}
            base={c.personalizado.base}
            desactivado={!!r().fijo}
            error={error()}
            campo={(el) => (elementos[i] = el)}
            onEscribir={(t) => escribir(i, t)}
            onAlternar={(activo) => escribir(i, activo ? c.personalizado!.base : '')}
          />
          <p id={`en-linea-nota-${i}`} class="en-linea-nota" aria-live="polite" hidden={!r().fijo}>
            {r().fijo?.motivo ?? ''}
          </p>
        </div>
      )
    return (
      <div class="en-linea-fila" classList={{ 'fila-ancha': ancha }}>
        <Show when={ancha} fallback={<label class="en-linea-titulo" for={id(i)}>{c.titulo}</label>}>
          {/* Como el renglón de una resistencia: el rótulo a la izquierda y lo elegido a la derecha; la lista va debajo. */}
          <div class="fld-cabeza">
            <span class="en-linea-titulo">{c.titulo}</span>
            <span class="entrada-valor entrada-solo cifra">{c.tabla ? mostrado(i) : (() => { const x = leerValor(mostrado(i)); return x ? formatearValor(x.valor, c.unidad ?? x.unidad) : mostrado(i) })()}</span>
          </div>
        </Show>
        <Show
          when={c.multilinea}
          fallback={
            c.tabla ? (
              <TablaDeModelos tabla={c.tabla} valor={mostrado(i)} nombre={c.titulo} desactivado={!!r().fijo} onElegir={(m) => escribir(i, m)} />
            ) : c.catalogo ? (
              <FichaCatalogo texto={mostrado(i)} unidad={c.unidad ?? ''} comunes={c.catalogo} desactivado={!!r().fijo} onUsar={(t) => escribir(i, t)}>
                {entrada()}
              </FichaCatalogo>
            ) : c.opciones ? (
              <div class="en-linea-lista">
                <select {...comun} classList={{ 'con-muestras': !!c.muestras }} ref={(el) => (elementos[i] = el)} value={mostrado(i)} disabled={!!r().fijo} onChange={(e) => escribir(i, e.currentTarget.value)} onKeyDown={(e) => tecla(e, c)}>
                  <Show when={c.muestras}>
                    <BotonDeLista />
                  </Show>
                  <For each={c.opciones}>{(o) => <OpcionConMuestra valor={o} muestra={c.muestras?.[o]} seleccionada={o === mostrado(i)} />}</For>
                </select>
              </div>
            ) : (
              <>
                {entrada()}
                <Show when={c.comunes && !c.serie}>
                  <FichaComunes texto={mostrado(i)} unidad={c.unidad ?? ''} comunes={c.comunes!} desactivado={!!r().fijo} onUsar={(t) => escribir(i, t)} />
                </Show>
              </>
            )
          }
        >
          <textarea {...comun} ref={(el) => (elementos[i] = el)} rows={3} value={mostrado(i)} aria-invalid={error() ? true : undefined} onInput={(e) => escribir(i, e.currentTarget.value)} onKeyDown={(e) => tecla(e, c)} />
        </Show>
        <Show when={c.serie}>{(s) => <FichaSerie texto={mostrado(i)} unidad={c.unidad ?? ''} serie={s()} desactivado={!!r().fijo} onUsar={(t, volver) => (volver && elementos[i]?.focus(), escribir(i, t))} />}</Show>
        <p id={`en-linea-error-${i}`} class="en-linea-error" role="alert">
          {error() ?? ''}
        </p>
        <p id={`en-linea-nota-${i}`} class="en-linea-nota" aria-live="polite" hidden={!r().nota && !r().fijo}>
          {r().fijo?.motivo ?? r().nota ?? ''}
        </p>
      </div>
    )
  }

  /** La referencia arriba a la derecha, en un recuadro que se nota editable. */
  const cajaReferencia = () => {
    const r = () => revision()[0] ?? {}
    const error = () => errores()[0] ?? r().error ?? null
    return (
      <div class="caja-referencia-envoltura">
        <label class="caja-referencia" classList={{ invalida: !!error() }} title={r().fijo?.motivo}>
          <span class="solo-lectores">Referencia</span>
          <input
            id={id(0)}
            class="cifra"
            ref={(el) => (elementos[0] = el)}
            type="text"
            value={mostrado(0)}
            readOnly={!!r().fijo}
            aria-readonly={r().fijo ? true : undefined}
            spellcheck={false}
            autocomplete="off"
            aria-invalid={error() ? true : undefined}
            aria-describedby={`en-linea-error-0 en-linea-nota-0`}
            onInput={(e) => escribir(0, e.currentTarget.value)}
            onKeyDown={(e) => tecla(e, campos[0])}
          />
          <svg class="caja-referencia-lapiz" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 13l.6-2.8L11 2.8a1.4 1.4 0 0 1 2 2l-7.4 7.4z" />
            <path d="M9.8 4l2.2 2.2" />
          </svg>
        </label>
        <p id="en-linea-error-0" class="campo-error caja-referencia-error" role="alert">
          {error() ?? ''}
        </p>
        <p id="en-linea-nota-0" class="en-linea-nota" hidden={!r().fijo}>
          {r().fijo?.motivo ?? ''}
        </p>
      </div>
    )
  }

  // ---- El generador: la ficha del inspector sobre los mismos campos ----
  /** El campo de cada propiedad del generador: la frecuencia es «Valor»; `num:` y `prop:` llevan el id de la propiedad. */
  const indice: Record<string, number> = {}
  campos.forEach((c, i) => {
    if (c.id === 'valor') indice.frecuencia = i
    else if (c.id.startsWith('num:') || c.id.startsWith('prop:')) indice[c.id.slice(c.id.indexOf(':') + 1)] = i
  })
  let ultimo = AJUSTES_POR_OMISION
  const ajustesGen = createMemo(() => {
    const t: Record<string, string> = {}
    for (const k of ['forma', 'frecuencia', 'amplitud', 'desplazamiento', 'simetria', 'ciclo', 'desfase', 'retardo', 'pasos', 'salida', 'ideal']) if (k in indice) t[k] = mostrado(indice[k])
    return (ultimo = ajustesDeTextos(t, ultimo))
  })
  const validar = (prop: string, texto: string): string | null => {
    if (['forma', 'simetria', 'ciclo', 'salida', 'ideal'].includes(prop)) return null
    return leerValor(texto) ? null : `«${texto}» no es un valor válido.`
  }
  const fichaGen = () => (
    <FichaGenerador
      a={ajustesGen()}
      contexto="linea"
      ajuste={(prop, texto) => {
        if (prop in indice) escribir(indice[prop], texto)
        return validar(prop, texto)
      }}
      ajustes={(cambios) => {
        for (const [prop, texto] of Object.entries(cambios)) if (prop in indice) escribir(indice[prop], texto)
        return null
      }}
      errorDe={(prop) => (prop in indice ? (errores()[indice[prop]] ?? revision()[indice[prop]]?.error) : null)}
      fijo={(prop) => prop in indice && !!revision()[indice[prop]]?.fijo}
      onEnter={aceptar}
      alMontarFoco={(c) => {
        // La ficha se monta después del efecto de arriba, que ya dio el foco a la referencia: el campo de la ficha lo recoge.
        if (p.tipo === 'pieza' && p.foco !== 0 && !focoDado) {
          focoDado = true
          elementos[p.foco] = c
          c.focus()
          c.select()
        }
      }}
    />
  )

  // ---- La ficha de una pieza: renglones de rótulo y valor, y «Más ajustes» ----
  const resto = campos.map((c, i) => ({ c, i })).filter((x) => x.c.id !== 'ref')
  const partes = repartirCampos(resto, (x) => !!x.c.personalizado)

  return (
    <div
      ref={caja}
      class="en-linea"
      classList={{ varios: campos.length > 1, 'en-linea-ficha': ficha }}
      role={ficha ? 'group' : undefined}
      aria-label={ficha ? `Editar ${encabezado ?? 'la pieza'}` : undefined}
      style={{ left: `${pos().left}px`, top: `${pos().top}px` }}
      onFocusOut={alSalir}
      onMouseDown={alPulsarDentro}
      onKeyDown={teclaDeLaCaja}
    >
      <Show
        when={ficha}
        fallback={
          <>
            <Show when={encabezado}>
              <p class="en-linea-encabezado">{encabezado}</p>
            </Show>
            <For each={campos}>{(c, i) => fila(c, i())}</For>
            <Show when={p.tipo !== 'pieza'}>
              <div class="en-linea-botones">
                <button type="button" class="boton principal" onClick={aceptar}>
                  Aplicar
                </button>
                <button type="button" class="boton" onClick={cancelar}>
                  Cancelar
                </button>
              </div>
              <p class="en-linea-pie">
                <kbd>{campos[0].multilinea ? 'Ctrl+Enter' : 'Enter'}</kbd> aplica <kbd>Esc</kbd> cancela
              </p>
            </Show>
          </>
        }
      >
        <div class="en-linea-cabeza">
          <p class="en-linea-encabezado">{encabezado}</p>
          <Show when={conReferencia}>{cajaReferencia()}</Show>
        </div>
        <Show
          when={esGenerador}
          fallback={
            <>
              <For each={partes.vistos}>{(x) => fila(x.c, x.i)}</For>
              <Show when={partes.mas.length > 0}>
                <details class="mas-ajustes" open={masAbierto()} onToggle={(e) => setMasAbierto(e.currentTarget.open)}>
                  <summary>Más ajustes ({partes.mas.length})</summary>
                  <For each={partes.mas}>{(x) => fila(x.c, x.i)}</For>
                </details>
              </Show>
            </>
          }
        >
          {fichaGen()}
        </Show>
        <p class="en-linea-pie">
          <kbd>Enter</kbd> aplica <kbd>Esc</kbd> cierra
        </p>
      </Show>
    </div>
  )
}
