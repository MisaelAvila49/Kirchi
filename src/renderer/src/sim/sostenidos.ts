import type { Id } from '../doc/tipos'

export interface Sostenido {
  id: Id
  /** La opción a la que vuelve el botón al soltarlo. */
  suelto: string
  /** Con qué se apretó: «puntero», «Enter», «Espacio» o «enclavado» («Mantener pulsado» del inspector). */
  via: string
}

/** Botones que la vista previa mantiene apretados, varios a la vez, uno por pieza. Los de «puntero», «Enter» y «Espacio»
 * se sueltan al levantar el botón o la tecla; los «enclavados» solo al volver a pulsarlos, apretarlos en el lienzo o
 * detener. */
export class Sostenidos {
  private readonly por = new Map<Id, Sostenido>()

  /** Aprieta `id`. «nuevo»: quedó sostenido y hay que cerrar su contacto. «del-enclavado»: estaba enclavado y un clic en
   * el lienzo lo pasa al puntero. «ya»: ya estaba sostenido, sin cambio. */
  apretar(id: Id, via: string, suelto: string): 'nuevo' | 'del-enclavado' | 'ya' {
    const s = this.por.get(id)
    if (!s) {
      this.por.set(id, { id, suelto, via })
      return 'nuevo'
    }
    if (s.via === 'enclavado' && via === 'puntero') {
      s.via = 'puntero'
      return 'del-enclavado'
    }
    return 'ya'
  }

  ids(): Id[] {
    return [...this.por.keys()]
  }

  estaEnclavado(id: Id): boolean {
    return this.por.get(id)?.via === 'enclavado'
  }

  enclavados(): Id[] {
    return [...this.por.values()].filter((s) => s.via === 'enclavado').map((s) => s.id)
  }

  private sacar(pred: (s: Sostenido) => boolean): Sostenido[] {
    const fuera = [...this.por.values()].filter(pred)
    for (const s of fuera) this.por.delete(s.id)
    return fuera
  }

  soltarId(id: Id): Sostenido | undefined {
    return this.sacar((s) => s.id === id)[0]
  }

  soltarVia(via: string): Sostenido[] {
    return this.sacar((s) => s.via === via)
  }

  /** Perder el foco o la captura del puntero: se sueltan todos menos los enclavados. */
  soltarTransitorios(): Sostenido[] {
    return this.sacar((s) => s.via !== 'enclavado')
  }

  soltarTodos(): Sostenido[] {
    return this.sacar(() => true)
  }
}
