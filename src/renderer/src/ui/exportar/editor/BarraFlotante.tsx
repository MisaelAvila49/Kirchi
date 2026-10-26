import { Show } from 'solid-js'
import { GROSOR_FLECHA_RANGO, TAM_NOTA_RANGO, type TextoFijo } from '../../../../../compartido/grafica/anotaciones'
import { GROSOR_RANGO, TEXTO_TAM_BASE, TEXTO_TAM_RANGO } from '../../../../../compartido/grafica/aspecto'
import type { TrazaVista } from '../../grafica/AspectoPanel'
import { Escalonador, Tonos } from './controles'
import { cambiarTraza, editarEtiqueta, editarFlecha, editarTexto, estiloEje, estiloTitulo, TONOS_RAPIDOS } from './edicion'
import { IconoBorrar, IconoNegrita } from './iconosEditor'
import type { Seleccion } from './objetos'
import type { Aplicar } from './PanelPropiedades'
import type { EstadoEditor } from './edicion'

interface Props {
  estado: EstadoEditor
  sel: Seleccion
  trazas: readonly TrazaVista[]
  claveDeTraza(id: string): string
  aplicar: Aplicar
  onBorrar(): void
}

/** Barra chica junto a lo elegido en la vista previa. Usa las mismas operaciones que el panel de la derecha. */
export default function BarraFlotante(props: Props) {
  const a = props.aplicar
  const s = () => props.sel
  const clave = (k: string) => `${s().tipo}:${s().id}:${k}`

  const texto = () => {
    const nota = props.estado.anot.textos.find((t) => t.id === s().id)
    const fijo: TextoFijo = s().id === 'subtitulo' ? 'subtitulo' : 'titulo'
    const est = props.estado.anot.estilos[fijo]
    const tam = nota?.tam ?? est?.tam ?? (fijo === 'subtitulo' ? 12 : 16)
    const negrita = nota?.negrita ?? est?.negrita ?? fijo === 'titulo'
    const tono = nota?.tono ?? est?.tono
    const poner = (p: { tam?: number; negrita?: boolean; tono?: import('../../../../../compartido/ajustes').TonoFigura | null }, k: string) => {
      if (nota) a((e) => editarTexto(e, nota.id, { ...p, tono: p.tono ?? undefined }), clave(k))
      else a((e) => estiloTitulo(e, fijo, p), clave(k))
    }
    return (
      <>
        <Escalonador nombre="Tamaño" texto={`${tam}`} menosOff={tam <= TAM_NOTA_RANGO[0]} masOff={tam >= TAM_NOTA_RANGO[1]} onMenos={() => poner({ tam: tam - 1 }, 'tam')} onMas={() => poner({ tam: tam + 1 }, 'tam')} />
        <button type="button" class="boton-icono" aria-pressed={negrita} aria-label="Negrita" title="Negrita" onClick={() => poner({ negrita: !negrita }, 'negrita')}>
          <IconoNegrita />
        </button>
        <Tonos nombre="Color" valor={tono} tonos={TONOS_RAPIDOS} onElegir={(t) => poner({ tono: t }, 'tono')} />
        <Show when={nota}>
          <button type="button" class="boton-icono" aria-label="Borrar" title="Borrar (Supr)" onClick={props.onBorrar}>
            <IconoBorrar />
          </button>
        </Show>
      </>
    )
  }

  const traza = () => {
    const k = props.claveDeTraza(s().id)
    const t = props.trazas.find((x) => x.clave === k)
    if (!t) return null
    const g = t.grosor ?? props.estado.aspecto.grosor
    return (
      <>
        <Escalonador
          nombre="Grosor"
          texto={`${g} px`}
          menosOff={g <= GROSOR_RANGO[0]}
          masOff={g >= GROSOR_RANGO[1]}
          onMenos={() => a((e) => cambiarTraza(e, k, { grosor: Math.max(GROSOR_RANGO[0], g - 0.5) }), clave('grosor'))}
          onMas={() => a((e) => cambiarTraza(e, k, { grosor: Math.min(GROSOR_RANGO[1], g + 0.5) }), clave('grosor'))}
        />
        <Tonos nombre={`Color de ${t.etiqueta}`} valor={t.tonoElegido} onElegir={(c) => a((e) => cambiarTraza(e, k, { color: c }))} />
      </>
    )
  }

  const eje = () => {
    const llave = s().id.slice(4)
    const est = props.estado.anot.ejes[llave]
    const asp = props.estado.aspecto
    const tam = est?.tam ?? asp.textoTam ?? TEXTO_TAM_BASE
    const negrita = (est?.peso ?? asp.textoPeso) === 'negrita'
    const poner = (p: Parameters<typeof estiloEje>[2], k: string) => a((e) => estiloEje(e, llave, p), clave(k))
    return (
      <>
        <Escalonador nombre="Tamaño" texto={`${tam}`} menosOff={tam <= TEXTO_TAM_RANGO[0]} masOff={tam >= TEXTO_TAM_RANGO[1]} onMenos={() => poner({ tam: tam - 1 }, 'tam')} onMas={() => poner({ tam: tam + 1 }, 'tam')} />
        <button type="button" class="boton-icono" aria-pressed={negrita} aria-label="Negrita" title="Negrita" onClick={() => poner({ peso: negrita ? 'normal' : 'negrita' }, 'peso')}>
          <IconoNegrita />
        </button>
        <Tonos nombre="Color de los números" valor={est?.tono} tonos={TONOS_RAPIDOS} onElegir={(t) => poner({ tono: t }, 'tono')} />
      </>
    )
  }

  const flecha = () => {
    const f = props.estado.anot.flechas.find((q) => q.id === s().id)
    if (!f) return null
    return (
      <>
        <Escalonador
          nombre="Grosor"
          texto={`${f.grosor} px`}
          menosOff={f.grosor <= GROSOR_FLECHA_RANGO[0]}
          masOff={f.grosor >= GROSOR_FLECHA_RANGO[1]}
          onMenos={() => a((e) => editarFlecha(e, f.id, { grosor: f.grosor - 1 }), clave('grosor'))}
          onMas={() => a((e) => editarFlecha(e, f.id, { grosor: f.grosor + 1 }), clave('grosor'))}
        />
        <Tonos nombre="Color de la flecha" valor={f.tono} tonos={TONOS_RAPIDOS} onElegir={(t) => t && a((e) => editarFlecha(e, f.id, { tono: t }))} />
        <button type="button" class="boton-icono" aria-label="Borrar" title="Borrar (Supr)" onClick={props.onBorrar}>
          <IconoBorrar />
        </button>
      </>
    )
  }

  const etiqueta = () => {
    const n = props.estado.anot.etiquetas.find((q) => q.id === s().id)
    if (!n) return null
    return (
      <>
        <Tonos nombre="Color de la etiqueta" valor={n.tono} auto="el de su traza" tonos={TONOS_RAPIDOS} onElegir={(t) => a((e) => editarEtiqueta(e, n.id, { tono: t }))} />
        <button type="button" class="boton-icono" aria-label="Borrar" title="Borrar (Supr)" onClick={props.onBorrar}>
          <IconoBorrar />
        </button>
      </>
    )
  }

  return (
    <div class="editor-barra" role="toolbar" aria-label="Lo más usado de lo elegido" data-tipo={s().tipo}>
      {s().tipo === 'texto' || s().tipo === 'fijo' ? texto() : s().tipo === 'traza' ? traza() : s().tipo === 'eje' ? eje() : s().tipo === 'flecha' ? flecha() : etiqueta()}
    </div>
  )
}
