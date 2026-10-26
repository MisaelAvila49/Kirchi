import { createEffect, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import { esItem, porLetra, posicionMenu, posicionSubmenu, primero, siguiente, ultimo } from './menuNav'
import IconoCinta from './cinta/IconoCinta'
import { ariaAtajoDeItem, teclasDeAtajo, type AccionMenu, type ItemMenu, type ModeloMenu } from './menus'

interface Props {
  modelo: ModeloMenu
  /** Punto de apertura en coordenadas de ventana (el clic o la esquina inferior izquierda del botón). */
  x: number
  y: number
  /** Separación entre el punto y el menú: 2 px del cursor, 0 bajo un botón. */
  hueco?: number
  onElegir(id: AccionMenu): void
  /** `teclado`: se cerró con Esc o Tab, y el foco vuelve a quien lo abrió. */
  onCerrar(teclado: boolean, todo?: boolean): void
  /** Es el submenú de un ítem: se abre junto a esa caja y Flecha izquierda lo cierra. */
  junto?: { left: number; top: number; right: number }
}

let siguienteId = 0

/** Menú accesible (WAI-ARIA menu). Los deshabilitados reciben el foco para leer su pista, pero no se eligen. */
/** Respiro antes de cerrar un submenú al pasar el puntero a otro ítem. */
export const RETRASO_CIERRE_MS = 300

export default function Menu(props: Props) {
  const id = `menu-${++siguienteId}`
  const [activo, setActivo] = createSignal(primero(props.modelo.entradas))
  const [pos, setPos] = createSignal<{ left: number; top: number } | null>(null)
  /** Índice del ítem cuyo submenú está abierto. */
  const [sub, setSub] = createSignal<number | null>(null)
  let caja!: HTMLDivElement
  const items: HTMLElement[] = []
  /** Pasar a otro ítem tarda en cerrar el submenú abierto: cruzar en diagonal hacia él no lo cierra. */
  let cierre: ReturnType<typeof setTimeout> | undefined
  const cancelarCierre = () => {
    clearTimeout(cierre)
    cierre = undefined
  }
  onCleanup(cancelarCierre)

  onMount(() => {
    const r = caja.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    setPos(props.junto ? posicionSubmenu(props.junto, r.width, r.height, vw, vh) : posicionMenu(props.x, props.y, r.width, r.height, vw, vh, 8, props.hueco ?? 2))
    // Un clic fuera lo cierra. El derecho sigue su camino: sobre el lienzo reabre el menú o, si es doble, borra.
    const fuera = (e: PointerEvent) => {
      // El botón que abrió el menú lo cierra con su propio clic; un clic en su submenú (u otro menú abierto encima) no.
      const en = e.target as Element | null
      if (caja.contains(e.target as Node) || en?.closest?.('[data-menu-boton]') || (!props.junto && en?.closest?.('.menu'))) return
      props.onCerrar(false)
      if (e.button === 0 && (e.target as HTMLElement | null)?.classList?.contains('lienzo-gl')) {
        // El clic izquierdo que cierra el menú no actúa además sobre el esquema.
        e.stopPropagation()
        e.preventDefault()
      }
    }
    const cerrar = () => props.onCerrar(false)
    document.addEventListener('pointerdown', fuera, true)
    window.addEventListener('resize', cerrar)
    window.addEventListener('blur', cerrar)
    onCleanup(() => {
      document.removeEventListener('pointerdown', fuera, true)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('blur', cerrar)
    })
  })
  createEffect(() => {
    const i = activo()
    // En una microtarea: el lienzo se enfoca a sí mismo al terminar de atender el clic derecho que abrió el menú.
    if (pos() && i >= 0) queueMicrotask(() => items[i]?.focus({ preventScroll: true }))
  })

  const actual = (): ItemMenu | null => {
    const e = props.modelo.entradas[activo()]
    return e && esItem(e) ? e : null
  }
  const elegir = (e: ItemMenu) => {
    if (e.deshabilitado) return
    if (e.submenu) setSub(activo())
    else props.onElegir(e.id)
  }
  const tecla = (e: KeyboardEvent) => {
    const ent = props.modelo.entradas
    if (e.key === 'ArrowDown') setActivo((i) => siguiente(ent, i, 1))
    else if (e.key === 'ArrowUp') setActivo((i) => siguiente(ent, i, -1))
    else if (e.key === 'Home') setActivo(primero(ent))
    else if (e.key === 'End') setActivo(ultimo(ent))
    else if (e.key === 'Enter' || e.key === ' ') {
      const a = actual()
      if (a) elegir(a)
    } else if (e.key === 'ArrowRight' && actual()?.submenu && !actual()?.deshabilitado) setSub(activo())
    else if (e.key === 'ArrowLeft' && props.junto) props.onCerrar(true)
    else if (e.key === 'Escape') props.onCerrar(true)
    // Tab sale del menú entero, también desde un submenú.
    else if (e.key === 'Tab') props.onCerrar(true, !!props.junto)
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const i = porLetra(ent, activo(), e.key)
      if (i >= 0) setActivo(i)
    } else return
    // El menú se queda con la tecla: ni el lienzo ni los atajos globales la ven.
    e.preventDefault()
    e.stopPropagation()
  }
  // Un menú con algún ítem con ayuda reserva el espacio de la pista desde que se abre: la posición se mide al montar, y una pista
  // que apareciera después empujaría el menú fuera de la ventana si abrió junto al borde de abajo (la barra de estado).
  const reservaDePista = () => props.modelo.entradas.some((e) => esItem(e) && !!e.ayuda)
  const pista = () => {
    const a = actual()
    return a?.deshabilitado ? a.pista : a?.ayuda
  }

  return (
    <div
      ref={caja}
      class="menu"
      classList={{ 'con-marcas': props.modelo.entradas.some((e) => esItem(e) && !!e.rol), 'con-iconos': props.modelo.entradas.some((e) => esItem(e) && (!!e.icono || !!e.muestra)) }}
      style={{ left: `${pos()?.left ?? props.x}px`, top: `${pos()?.top ?? props.y}px`, visibility: pos() ? 'visible' : 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
      // Llegar al submenú (o a cualquier ítem de este menú) cancela el cierre pendiente.
      onPointerOver={(e) => {
        if ((e.target as Element).closest('.menu') !== caja) cancelarCierre()
      }}
      // Un clic en un separador, el título o el relleno no roba el foco a los ítems.
      onPointerDown={(e) => e.preventDefault()}
    >
      <Show when={props.modelo.mostrarTitulo}>
        <div class="menu-titulo" aria-hidden="true">
          {props.modelo.titulo}
        </div>
      </Show>
      <div role="menu" aria-label={props.modelo.titulo} on:keydown={tecla}>
        <For each={props.modelo.entradas}>
          {(e, i) =>
            esItem(e) ? (
              <div
                ref={(el) => (items[i()] = el)}
                role={e.rol === 'casilla' ? 'menuitemcheckbox' : e.rol === 'opcion' ? 'menuitemradio' : 'menuitem'}
                tabindex="-1"
                class="menu-item"
                classList={{ peligro: !!e.peligro, activo: activo() === i(), marcable: !!e.rol }}
                aria-disabled={e.deshabilitado ? 'true' : undefined}
                aria-checked={e.rol ? (e.marcado === 'mixto' ? 'mixed' : e.marcado ? 'true' : 'false') : undefined}
                aria-keyshortcuts={ariaAtajoDeItem(e)}
                aria-haspopup={e.flecha ? 'menu' : undefined}
                aria-expanded={e.submenu ? (sub() === i() ? 'true' : 'false') : undefined}
                aria-describedby={(e.deshabilitado && e.pista) || e.ayuda ? `${id}-pista` : undefined}
                onPointerEnter={() => {
                  setActivo(i())
                  cancelarCierre()
                  // Pasar por un ítem con submenú lo abre; pasar por otro cierra el que estuviera abierto, con un respiro.
                  if (e.submenu && !e.deshabilitado) setSub(i())
                  else if (sub() !== null) cierre = setTimeout(() => setSub(null), RETRASO_CIERRE_MS)
                }}
                onClick={() => elegir(e)}
              >
                <Show when={e.rol}>
                  <span class="menu-marca" aria-hidden="true">
                    {e.marcado === 'mixto' ? '–' : e.marcado ? (e.rol === 'opcion' ? '●' : '✓') : ''}
                  </span>
                </Show>
                <Show
                  when={e.icono}
                  fallback={
                    <span class="menu-icono" aria-hidden="true">
                      <Show when={e.muestra}>{(m) => <span class="muestra-color" data-color={m()} />}</Show>
                    </span>
                  }
                >
                  {(n) => <IconoCinta nombre={n()} uso="chico" class="menu-icono" />}
                </Show>
                <span class="menu-texto">{e.texto}</span>
                <Show when={e.detalle}>{(d) => <span class="menu-detalle">{d()}</span>}</Show>
                <Show when={e.atajo}>
                  {(a) => (
                    <span class="menu-atajo" aria-hidden="true">
                      <Show when={teclasDeAtajo(a())} fallback={<span class="menu-gesto">{a()}</span>}>
                        {(ks) => <For each={ks()}>{(k) => <kbd>{k}</kbd>}</For>}
                      </Show>
                    </span>
                  )}
                </Show>
                <Show when={e.flecha}>
                  <IconoCinta nombre="plegarDer" class="menu-sub" />
                </Show>
              </div>
            ) : (
              <div role="separator" class="menu-separador" classList={{ 'con-rotulo': !!e.rotulo }} aria-label={e.rotulo}>
                {e.rotulo}
              </div>
            )
          }
        </For>
      </div>
      <p id={`${id}-pista`} class="menu-pista" classList={{ reservada: reservaDePista(), vacia: !pista() }} hidden={!pista() && !reservaDePista()}>
        {pista() ?? ''}
      </p>
      <Show when={sub() !== null && props.modelo.entradas[sub()!]} keyed>
        {(e) => {
          const i = sub()!
          const r = items[i].getBoundingClientRect()
          return (
            <Menu
              modelo={{ titulo: esItem(e) ? e.texto : '', mostrarTitulo: false, entradas: esItem(e) ? (e.submenu ?? []) : [] }}
              x={r.right}
              y={r.top}
              junto={{ left: r.left, top: r.top, right: r.right }}
              onElegir={(idElegido) => props.onElegir(idElegido)}
              onCerrar={(teclado, todo) => {
                setSub(null)
                if (todo) return props.onCerrar(true)
                // Esc o Flecha izquierda en el submenú regresan al ítem que lo abrió.
                if (teclado) items[i]?.focus({ preventScroll: true })
              }}
            />
          )
        }}
      </Show>
    </div>
  )
}
