import { createUniqueId, Show } from 'solid-js'
import CampoValor from './CampoValor'
import { textoPerilla } from './perilla'

interface Props {
  etiqueta: string
  valor: number
  unidad: string
  min: number
  max: number
  /** Cambia la propiedad con el texto nuevo («1.100k»); devuelve el error del editor, o null. */
  onCambiar(texto: string): string | null
  error?: string | null
  /** Enter ya aplicó lo escrito sin error: el doble clic cierra su editor con esto. */
  onEnter?(): void
  /** El campo que recibe el foco al abrir el doble clic. */
  alMontar?(campo: HTMLInputElement): void
}

/**
 * Campo de perilla con cursor de dígito: rueda y flechas mueven la cifra a la izquierda del cursor. Enter o salir aplican.
 */
export default function CampoPerilla(props: Props) {
  const id = `perilla-${createUniqueId()}`
  let texto = textoPerilla(props.valor)
  let error: string | null = null
  const aplicar = () => {
    if (texto === textoPerilla(props.valor)) {
      error = null
      return
    }
    error = props.onCambiar(texto.trim())
  }
  void error
  return (
    <div class="fld fld-perilla">
      <label for={id}>{props.etiqueta}</label>
      <span class="perilla">
        <CampoValor
          texto={textoPerilla(props.valor)}
          unidad={props.unidad}
          nombre={props.etiqueta}
          perilla={{ min: props.min, max: props.max }}
          invalido={!!props.error}
          atributos={{
            id,
            class: 'cifra',
            role: 'spinbutton',
            'aria-valuenow': props.valor,
            'aria-valuemin': props.min,
            'aria-valuemax': props.max,
            'aria-valuetext': `${textoPerilla(props.valor)} ${props.unidad}`,
            'aria-describedby': props.error ? `${id}-error` : undefined
          }}
          campo={(el) => props.alMontar?.(el)}
          onTexto={(t) => (texto = t)}
          onAplicar={aplicar}
          onTecla={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              aplicar()
              if (!error) props.onEnter?.()
            }
          }}
        />
      </span>
      <Show when={props.error}>
        {(t) => (
          <span id={`${id}-error`} class="fld-error" role="alert">
            {t()}
          </span>
        )}
      </Show>
    </div>
  )
}
