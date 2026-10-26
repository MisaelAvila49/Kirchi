import { createMemo, createSignal, For, Show } from 'solid-js'
import { filtrarPlantillas, type ItemPlantilla } from '../plantillas/almacen'
import { acelerador, aceleradorCategoria, alternarPlegada, filasDelArbol, teclaArbol, type FilaArbol } from '../plantillas/arbol'
import { crearGestoArrastre, type FaseArrastre } from './gestoArrastre'
import { MiniaturaPlantilla } from './MiniaturaPlantilla'
import { plural } from './proyecto'

interface Props {
  items: readonly ItemPlantilla[]
  /** Carpetas de las propias, también las vacías. */
  categoriasVacias: readonly string[]
  /** Categorías plegadas por el usuario (se recuerdan en los ajustes). */
  plegadas: readonly string[]
  onPlegar(plegadas: string[]): void
  /** Lo que no se pudo leer o por qué no hay carpeta (una línea para el lector). */
  aviso?: string | null
  /** Hay algo seleccionado en el lienzo que se pueda guardar. */
  puedeGuardar: boolean
  onGuardarSeleccion(): void
  /** Clic o Enter: la plantilla queda pegada al puntero para colocarla. */
  onTomar(item: ItemPlantilla): void
  /** Arrastre hacia el lienzo, en coordenadas de ventana. */
  onArrastrar(item: ItemPlantilla, e: PointerEvent, fase: FaseArrastre): void
  /** Clic derecho, la tecla de menú o Shift+F10 (x, y de ventana); `ancla` es la fila, a la que vuelve el foco. */
  onMenu(item: ItemPlantilla, x: number, y: number, ancla: HTMLElement): void
  /** F2 y Supr sobre una propia. */
  onAccion(accion: 'renombrar' | 'borrar', item: ItemPlantilla): void
  /** Clic derecho o tecla de menú sobre una categoría propia: su menú con «Borrar categoría…». */
  onMenuCategoria?(nombre: string, total: number, x: number, y: number, ancla: HTMLElement): void
  /** Supr sobre una categoría propia. */
  onBorrarCategoria?(nombre: string, total: number): void
  onMostrarCarpeta?(): void
}

/**
 * Panel Plantillas del riel. Árbol de ARIA con una sola parada de Tab: flechas, derecha e izquierda abren y pliegan, Enter coloca, F2 renombra, Supr borra, Shift+F10 abre el menú.
 */
export default function PanelPlantillas(props: Props) {
  const [consulta, setConsulta] = createSignal('')
  const [foco, setFoco] = createSignal<string | null>(null)
  const gesto = crearGestoArrastre()
  const buscando = () => consulta().trim() !== ''
  const hallados = createMemo(() => filtrarPlantillas(props.items, consulta()))
  const plegadasSet = createMemo(() => new Set(props.plegadas))
  const filas = createMemo(() => filasDelArbol(hallados(), props.categoriasVacias, plegadasSet(), buscando()))
  // Las filas que se dibujan conservan su objeto mientras no cambien (plegar una categoría no rehace las demás ni la propia: el
  // foco no se pierde). Quién está abierta se lee de las señales, no del objeto.
  const cache = new Map<string, FilaArbol>()
  const filasVista = createMemo(() =>
    filas().map((f) => {
      const v = cache.get(f.id)
      const igual = v && v.tipo === f.tipo && (f.tipo === 'categoria' ? v.tipo === 'categoria' && v.total === f.total && v.incluida === f.incluida : v.tipo === 'plantilla' && v.item === f.item && v.padre === f.padre)
      if (igual) return v
      cache.set(f.id, f)
      return f
    })
  )
  const abiertaDe = (nombre: string) => buscando() || !plegadasSet().has(nombre)
  // Solo una fila es parada de Tab: la que tuvo el foco por última vez, o la primera si esa ya no está.
  const activa = () => {
    const f = filas()
    return f.some((x) => x.id === foco()) ? foco() : (f[0]?.id ?? null)
  }
  const hayPropias = () => props.items.some((i) => !i.incluida)
  let arbol!: HTMLDivElement
  const filaEl = (id: string) => [...arbol.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((e) => e.dataset.id === id)
  const llevarFoco = (id: string) => {
    setFoco(id)
    queueMicrotask(() => filaEl(id)?.focus())
  }
  const alternar = (nombre: string) => props.onPlegar(alternarPlegada(props.plegadas, nombre))

  const teclado = (e: KeyboardEvent, fila: FilaArbol) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const el = e.currentTarget as HTMLElement
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      const r = el.getBoundingClientRect()
      if (fila.tipo === 'categoria') {
        if (fila.incluida || !props.onMenuCategoria) return
        e.preventDefault()
        props.onMenuCategoria(fila.nombre, fila.total, r.left + 12, r.bottom, el)
        return
      }
      e.preventDefault()
      props.onMenu(fila.item, r.left + 12, r.bottom, el)
      return
    }
    if (fila.tipo === 'categoria' && aceleradorCategoria(fila, e.key) && props.onBorrarCategoria) {
      e.preventDefault()
      props.onBorrarCategoria(fila.nombre, fila.total)
      return
    }
    const ac = acelerador(fila, e.key)
    if (ac && fila.tipo === 'plantilla') {
      e.preventDefault()
      props.onAccion(ac, fila.item)
      return
    }
    const lista = filas()
    const m = teclaArbol(lista, lista.findIndex((x) => x.id === fila.id), e.key)
    if (!m) return
    e.preventDefault()
    if (m.alternar) alternar(m.alternar)
    if (m.colocar && fila.tipo === 'plantilla') return props.onTomar(fila.item)
    const destino = lista[m.indice]
    if (destino) llevarFoco(destino.id)
  }

  const campoTeclas = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' && filas().length > 0) {
      e.preventDefault()
      llevarFoco(activa() ?? filas()[0].id)
    }
  }

  const menu = (e: MouseEvent, fila: FilaArbol) => {
    if (fila.tipo === 'categoria') {
      if (fila.incluida || !props.onMenuCategoria) return
      e.preventDefault()
      props.onMenuCategoria(fila.nombre, fila.total, e.clientX, e.clientY, e.currentTarget as HTMLElement)
      return
    }
    e.preventDefault()
    props.onMenu(fila.item, e.clientX, e.clientY, e.currentTarget as HTMLElement)
  }

  return (
    <div class="panel-plantillas">
      <button type="button" class="boton principal pl-guardar" aria-disabled={props.puedeGuardar ? undefined : 'true'} aria-describedby={props.puedeGuardar ? undefined : 'pl-guardar-ayuda'} title="Guardar la selección como plantilla" onClick={() => props.onGuardarSeleccion()}>
        Guardar selección
      </button>
      <Show when={!props.puedeGuardar}>
        <p class="pista-panel pl-guardar-ayuda" id="pl-guardar-ayuda">
          Selecciona piezas o cables en el lienzo para guardarlos.
        </p>
      </Show>
      <input
        class="campo pl-buscar"
        type="search"
        placeholder="Buscar plantillas…"
        aria-label="Buscar plantillas por nombre o descripción"
        value={consulta()}
        onInput={(e) => setConsulta(e.currentTarget.value)}
        onKeyDown={campoTeclas}
      />
      <Show when={props.aviso}>
        <p class="secundario plantillas-aviso" role="status">
          {props.aviso}
        </p>
      </Show>
      <Show when={!hayPropias() && !buscando()}>
        <p class="pl-vacio">Aún no hay plantillas tuyas. Arma un circuito, selecciona la parte que quieras reutilizar y pulsa Guardar selección.</p>
      </Show>
      <div class="pl-arbol" role="tree" aria-label="Plantillas por categoría" ref={arbol}>
        <For each={filasVista()}>
          {(fila, i) => {
            const tabindex = () => (activa() === fila.id ? 0 : -1)
            if (fila.tipo === 'categoria') {
              return (
                <div
                  class="pl-cat"
                  role="treeitem"
                  aria-level={1}
                  aria-expanded={abiertaDe(fila.nombre)}
                  data-id={fila.id}
                  data-incluida={fila.incluida ? '' : undefined}
                  tabindex={tabindex()}
                  onFocus={() => setFoco(fila.id)}
                  onClick={() => {
                    if (!buscando()) alternar(fila.nombre)
                    setFoco(fila.id)
                  }}
                  onContextMenu={(e) => menu(e, fila)}
                  onKeyDown={(e) => teclado(e, fila)}
                >
                  <span class="pl-flecha" aria-hidden="true" />
                  <span class="pl-cat-nombre">{fila.nombre}</span>
                  <span class="cifra pl-cat-cifra">{fila.total}</span>
                  <span class="solo-lectores">{fila.total === 1 ? 'plantilla' : 'plantillas'}</span>
                </div>
              )
            }
            const item = fila.item
            // Posición dentro de su categoría para los lectores de pantalla.
            const hermanas = () => filas().filter((x) => x.tipo === 'plantilla' && x.padre === fila.padre)
            return (
              <div
                class="pl-fila"
                role="treeitem"
                aria-level={2}
                aria-posinset={hermanas().findIndex((x) => x.id === fila.id) + 1}
                aria-setsize={hermanas().length}
                title={item.descripcion ? `${item.nombre}\n${item.descripcion}` : item.nombre}
                data-id={fila.id}
                data-plantilla={item.clave}
                data-orden={i()}
                tabindex={tabindex()}
                onFocus={() => setFoco(fila.id)}
                onPointerDown={(ev) => gesto.iniciar(ev, (m, fase) => props.onArrastrar(item, m, fase))}
                onClick={() => {
                  setFoco(fila.id)
                  gesto.clicCon(() => props.onTomar(item))
                }}
                onContextMenu={(e) => menu(e, fila)}
                onKeyDown={(e) => teclado(e, fila)}
              >
                <span class="ficha-plantilla" aria-hidden="true">
                  <MiniaturaPlantilla vista={item.vista} />
                </span>
                <span class="pl-nombre">{item.nombre}</span>
                <Show when={item.descripcion}>
                  <span class="pl-descripcion">{item.descripcion}</span>
                </Show>
              </div>
            )
          }}
        </For>
      </div>
      <Show when={buscando() && hallados().length === 0}>
        <p class="secundario" role="status">
          Ninguna plantilla coincide con «{consulta()}».
        </p>
      </Show>
      <Show when={buscando() && hallados().length > 0}>
        <p class="solo-lectores" role="status">
          {plural(hallados().length, 'plantilla encontrada', 'plantillas encontradas')}
        </p>
      </Show>
      <p class="pista-panel">Haz clic o arrastra una plantilla al lienzo. El clic derecho abre sus acciones.</p>
      <Show when={props.onMostrarCarpeta}>
        <button type="button" class="boton plantillas-carpeta" onClick={() => props.onMostrarCarpeta?.()}>
          Mostrar la carpeta de plantillas
        </button>
      </Show>
    </div>
  )
}
