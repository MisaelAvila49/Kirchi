import { aplicar, fusionar, invertir, type Comando } from './comandos'
import type { Documento } from './tipos'

export type TipoAviso = 'ejecutar' | 'deshacer' | 'rehacer' | 'reemplazar'
export type Oyente = (doc: Documento, cmd: Comando, tipo: TipoAviso) => void

/** Marca imposible: un documento recuperado o sin guardar nunca coincide con lo guardado. */
const NUNCA: Comando = { nombre: 'nunca guardado', cambios: [] }

function congelar(valor: unknown): void {
  if (valor === null || typeof valor !== 'object' || Object.isFrozen(valor)) return
  Object.freeze(valor)
  for (const v of Object.values(valor)) congelar(v)
}

export class Historial {
  private hechos: Comando[] = []
  private deshechos: Comando[] = []
  private oyentes = new Set<Oyente>()
  private grupoAbierto: string | undefined
  /** Pila de rehacer que había al abrirse el grupo en curso, para restaurarla si el gesto se revierte. */
  private rehacerPrevio: Comando[] | null = null
  /** Último paso al guardar (null con historial vacío). Se compara por identidad: fusionar un paso crea otro objeto, así
   * que lo posterior se nota aunque caiga en el mismo gesto. */
  private guardado: Comando | null = null

  constructor(private actual: Documento) {
    congelar(actual)
  }

  get doc(): Documento {
    return this.actual
  }

  get puedeDeshacer(): boolean {
    return this.hechos.length > 0
  }

  get puedeRehacer(): boolean {
    return this.deshechos.length > 0
  }

  /** El documento difiere de lo último que se guardó (o se abrió). Deshacer hasta ahí lo limpia. */
  get sinGuardar(): boolean {
    return this.tope() !== this.guardado
  }

  /** Marca del estado actual para `marcarGuardado` tras una escritura asíncrona: lo editado mientras se guardaba queda sin
   * guardar. */
  marca(): unknown {
    return this.tope()
  }

  /** Lo guardado es lo que había al tomar `marca` (por omisión, lo de ahora). */
  marcarGuardado(marca: unknown = this.tope()): void {
    this.guardado = marca as Comando | null
  }

  /** El documento no está guardado en ninguna parte (recuperado): ningún deshacer lo deja limpio. */
  marcarSucio(): void {
    this.guardado = NUNCA
  }

  private tope(): Comando | null {
    return this.hechos[this.hechos.length - 1] ?? null
  }

  ejecutar(cmd: Comando): void {
    if (cmd.cambios.length === 0) return
    for (const c of cmd.cambios) {
      congelar(c.antes)
      congelar(c.despues)
    }
    this.actual = aplicar(this.actual, cmd)
    const abreGrupo = cmd.grupo !== undefined && cmd.grupo !== this.grupoAbierto
    if (abreGrupo) this.rehacerPrevio = this.deshechos
    const ultimo = this.hechos[this.hechos.length - 1]
    if (cmd.grupo !== undefined && cmd.grupo === this.grupoAbierto && ultimo) {
      const fusionado = fusionar(ultimo, cmd)
      if (fusionado.cambios.length === 0) this.hechos.pop()
      else this.hechos[this.hechos.length - 1] = fusionado
    } else this.hechos.push(cmd)
    this.grupoAbierto = cmd.grupo
    this.deshechos = []
    this.avisar(cmd, 'ejecutar')
  }

  /** Grupo del último comando si sigue abierto (el siguiente comando con ese grupo se une a él). */
  get grupoEnCurso(): string | undefined {
    return this.grupoAbierto
  }

  /** Termina el gesto en curso: el siguiente comando del mismo grupo será otro paso. */
  cerrarGrupo(): void {
    this.grupoAbierto = undefined
  }

  /** Anula el grupo abierto: deshace su efecto, no queda en rehacer y devuelve la pila de rehacer previa al gesto. Sin
   * grupo no hace nada. */
  revertirGrupo(): boolean {
    if (this.grupoAbierto === undefined) return false
    const cmd = this.hechos.pop()
    const previo = this.rehacerPrevio ?? []
    this.grupoAbierto = undefined
    this.rehacerPrevio = null
    if (!cmd) return false
    const inv = invertir(cmd)
    this.actual = aplicar(this.actual, inv)
    this.deshechos = previo
    this.avisar(inv, 'deshacer')
    return true
  }

  deshacer(): boolean {
    const cmd = this.hechos.pop()
    if (!cmd) return false
    const inv = invertir(cmd)
    this.actual = aplicar(this.actual, inv)
    this.deshechos.push(cmd)
    this.grupoAbierto = undefined
    this.avisar(inv, 'deshacer')
    return true
  }

  rehacer(): boolean {
    const cmd = this.deshechos.pop()
    if (!cmd) return false
    this.actual = aplicar(this.actual, cmd)
    this.hechos.push(cmd)
    this.grupoAbierto = undefined
    this.avisar(cmd, 'rehacer')
    return true
  }

  reemplazar(doc: Documento): void {
    congelar(doc)
    this.actual = doc
    this.hechos = []
    this.deshechos = []
    this.grupoAbierto = undefined
    this.guardado = null
    this.avisar({ nombre: 'reemplazar', cambios: [] }, 'reemplazar')
  }

  suscribir(fn: Oyente): () => void {
    this.oyentes.add(fn)
    return () => this.oyentes.delete(fn)
  }

  private avisar(cmd: Comando, tipo: TipoAviso): void {
    let fallo: unknown
    let hayFallo = false
    for (const fn of this.oyentes) {
      try {
        fn(this.actual, cmd, tipo)
      } catch (err) {
        if (!hayFallo) {
          hayFallo = true
          fallo = err
        }
      }
    }
    if (hayFallo) {
      queueMicrotask(() => {
        throw fallo
      })
    }
  }
}
