export interface EventoTecla {
  key: string
  /** Tecla física («Period», «Comma»): con Shift, `key` cambia según la distribución del teclado. */
  code?: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  repeat?: boolean
  /** Otro oyente ya atendió la tecla (un menú, una pestaña): no se despacha. */
  defaultPrevented?: boolean
  target?: EventTarget | null
  preventDefault?(): void
}

export interface DefComando {
  id: string
  nombre: string
  teclas: string[]
  ejecutar(): void
  /** Si es true, mantener la tecla repite la acción. */
  repetir?: boolean
  /** Si devuelve false el comando no existe para el despacho (la tecla queda libre para el control enfocado). */
  activo?(): boolean
}

const NOMBRES: Record<string, string> = {
  ' ': 'Espacio',
  Delete: 'Supr',
  Backspace: 'Retroceso',
  Escape: 'Esc',
  ArrowUp: 'Arriba',
  ArrowDown: 'Abajo',
  ArrowLeft: 'Izquierda',
  ArrowRight: 'Derecha'
}

/** Con Ctrl y Shift, punto y coma se nombran por su tecla física: Shift+. da «>» en teclado inglés y «:» en español, y
 * Ctrl+Shift+. debe ser el mismo atajo. */
const POR_TECLA: Record<string, string> = { Period: '.', Comma: ',' }

export function combinacion(e: EventoTecla): string {
  const fisica = (e.ctrlKey || e.metaKey) && e.shiftKey && e.code ? POR_TECLA[e.code] : undefined
  const base = fisica ?? NOMBRES[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)
  const conNombre = fisica !== undefined || /^[A-Z]$/.test(base) || e.key.length > 1 || e.key === ' '
  const partes: string[] = []
  if (e.ctrlKey || e.metaKey) partes.push('Ctrl')
  if (e.altKey) partes.push('Alt')
  if (e.shiftKey && conNombre) partes.push('Shift')
  partes.push(base)
  return partes.join('+')
}

export function esCampoDeTexto(t: EventTarget | null | undefined): boolean {
  const el = t as { tagName?: unknown; isContentEditable?: unknown } | null | undefined
  if (!el || typeof el.tagName !== 'string') return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName.toUpperCase()) || el.isContentEditable === true
}

/** Combinaciones no asignables: mueven el foco (Tab, Enter, Espacio), cancelan la captura (Esc) o las toma el menú de la
 * aplicación antes que la página (zoom, pantalla completa, herramientas). Las de fábrica que ya las usan las conservan. */
export const TECLAS_RESERVADAS: Readonly<Record<string, string>> = {
  Tab: 'Tab mueve el foco entre los controles.',
  'Shift+Tab': 'Shift+Tab mueve el foco entre los controles.',
  Esc: 'Esc cancela; no se puede asignar.',
  Enter: 'Enter activa el control enfocado.',
  Espacio: 'Espacio activa el control enfocado.',
  'Ctrl+=': 'Ctrl+= agranda la interfaz (Configuración › Tamaño de la interfaz).',
  'Ctrl++': 'Ctrl++ agranda la interfaz (Configuración › Tamaño de la interfaz).',
  'Alt+F4': 'Alt+F4 cierra la ventana (lo toma el sistema).',
  'Ctrl+-': 'Ctrl+- achica la interfaz (Configuración › Tamaño de la interfaz).',
  'Ctrl+0': 'Ctrl+0 deja la interfaz en 100 % (Configuración › Tamaño de la interfaz).',
  F11: 'F11 alterna la pantalla completa (menú Ver).',
  'Ctrl+Shift+I': 'Ctrl+Shift+I abre las herramientas de desarrollo.'
}

/** La combinación está reservada (sin contar los nombres heredados de Object: una tecla «constructor» no lo es). */
export const esReservada = (t: string): boolean => Object.hasOwn(TECLAS_RESERVADAS, t)

/** Teclas modificadoras solas: no son un atajo. */
const SOLO_MODIFICADORES = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified', 'Process'])

/** Combinación resultante de pulsar una tecla al capturar en Configuración › Atajos: la combinación, null si es solo un
 * modificador (se sigue esperando) o el motivo si está reservada. */
export function capturarCombinacion(e: EventoTecla): { combinacion: string } | { reservada: string } | null {
  if (SOLO_MODIFICADORES.has(e.key)) return null
  const t = combinacion(e)
  return esReservada(t) ? { reservada: TECLAS_RESERVADAS[t] } : { combinacion: t }
}

interface DestinoTeclas {
  addEventListener(tipo: 'keydown', f: (e: KeyboardEvent) => void): void
  removeEventListener(tipo: 'keydown', f: (e: KeyboardEvent) => void): void
}

export class Atajos {
  private comandos = new Map<string, DefComando>()
  private propias = new Map<string, string[]>()

  registrar(c: DefComando): void {
    if (this.comandos.has(c.id)) throw new Error(`comando repetido: ${c.id}`)
    this.comandos.set(c.id, c)
  }

  lista(): DefComando[] {
    return [...this.comandos.values()]
  }

  teclasDe(id: string): string[] {
    return this.propias.get(id) ?? this.comandos.get(id)?.teclas ?? []
  }

  ponerTeclas(id: string, teclas: string[]): void {
    this.propias.set(id, teclas)
  }

  restaurar(): void {
    this.propias.clear()
  }

  /** Vuelve a las teclas de fábrica de un comando. */
  restaurarUno(id: string): void {
    this.propias.delete(id)
  }

  /** El comando tiene teclas propias (distintas de las de fábrica). */
  esPropio(id: string): boolean {
    const p = this.propias.get(id)
    const c = this.comandos.get(id)
    return !!p && !!c && (p.length !== c.teclas.length || p.some((t, i) => t !== c.teclas[i]))
  }

  /** Teclas propias de los comandos que se apartan de las de fábrica (lo que se guarda en los ajustes). */
  propiasActuales(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const [id, teclas] of this.propias) if (this.esPropio(id)) out[id] = [...teclas]
    return out
  }

  /** Reemplaza las teclas propias por las guardadas, ignorando ids que ya no existen y combinaciones reservadas (un
   * settings.json alterado no puede quitar Tab o F11), salvo las de fábrica del propio comando: agregar una tecla a
   * «Cancelar» no puede dejarlo sin Esc. */
  cargarPropias(p: Readonly<Record<string, readonly string[]>>): string[] {
    this.propias.clear()
    for (const [id, teclas] of Object.entries(p)) {
      const c = this.comandos.get(id)
      if (!c) continue
      const validas = [...new Set(teclas.filter((t) => !esReservada(t) || c.teclas.includes(t)))]
      // Una elección guardada que hoy es solo de combinaciones reservadas (F11 era del lienzo limpio y volvió a la pantalla completa)
      // no deja al comando sin tecla: se queda con las de fábrica.
      if (validas.length > 0 || teclas.length === 0) this.propias.set(id, validas)
    }
    return this.resolverConflictos()
  }

  /** Teclas de fábrica de un comando. */
  teclasDeFabrica(id: string): readonly string[] {
    return this.comandos.get(id)?.teclas ?? []
  }

  /** Una tecla en dos comandos (settings.json editado a mano) se deja en uno: quien la tiene de fábrica o, si ninguno, el
   * primero registrado. Devuelve un aviso por cada tecla resuelta. */
  private resolverConflictos(): string[] {
    const avisos: string[] = []
    for (const [t, a, b] of this.conflictos()) {
      const [gana, pierde] = !this.teclasDeFabrica(a).includes(t) && this.teclasDeFabrica(b).includes(t) ? [b, a] : [a, b]
      this.propias.set(pierde, this.teclasDe(pierde).filter((x) => x !== t))
      avisos.push(`${t} estaba en ${this.nombreDe(a) ?? a} y en ${this.nombreDe(b) ?? b}: se queda en ${this.nombreDe(gana) ?? gana}.`)
    }
    return avisos
  }

  /** Comando que tiene asignada la combinación, sin contar `excepto`; undefined si está libre. */
  dueño(tecla: string, excepto?: string): string | undefined {
    for (const c of this.comandos.values()) if (c.id !== excepto && this.teclasDe(c.id).includes(tecla)) return c.id
    return undefined
  }

  nombreDe(id: string): string | undefined {
    return this.comandos.get(id)?.nombre
  }

  /** [tecla, id1, id2] por cada tecla asignada a dos comandos. */
  conflictos(): [string, string, string][] {
    const dueño = new Map<string, string>()
    const out: [string, string, string][] = []
    for (const c of this.comandos.values())
      for (const t of this.teclasDe(c.id)) {
        const otro = dueño.get(t)
        if (otro) out.push([t, otro, c.id])
        else dueño.set(t, c.id)
      }
    return out
  }

  despachar(e: EventoTecla): boolean {
    if (e.defaultPrevented || esCampoDeTexto(e.target)) return false
    const t = combinacion(e)
    const c = this.lista().find((x) => this.teclasDe(x.id).includes(t) && (x.activo?.() ?? true))
    if (!c) return false
    e.preventDefault?.()
    if (e.repeat && !c.repetir) return true
    c.ejecutar()
    return true
  }

  /** `permitir`: si devuelve false la tecla no se despacha (un menú o un diálogo abierto se queda con ella). */
  instalar(destino: DestinoTeclas, permitir: (e: KeyboardEvent) => boolean = () => true): () => void {
    const f = (e: KeyboardEvent) => {
      if (permitir(e)) this.despachar(e)
    }
    destino.addEventListener('keydown', f)
    return () => destino.removeEventListener('keydown', f)
  }
}
