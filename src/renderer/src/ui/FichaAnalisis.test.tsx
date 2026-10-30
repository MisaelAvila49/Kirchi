// @vitest-environment happy-dom
import { render } from 'solid-js/web'
import { afterEach, describe, expect, it } from 'vitest'
import type { AnalisisDoc } from '../../../compartido/analisis/config'
import { analisisNuevo } from '../analisis/fichas'
import type { ContextoAnalisis } from '../analisis/contexto'
import FichaAnalisis from './FichaAnalisis'

const fuentes = [{ id: 'p_v1', ref: 'V1', clase: 'continua' as const }]

describe('la ficha del transitorio y las condiciones iniciales', () => {
  let quitar = () => {}
  afterEach(() => quitar())
  const montar = (condicionesIniciales: string[]) => {
    const r = analisisNuevo('tran', { fuentes, barribles: [] }, 'a_tran', [])
    if (!r.ok) throw new Error(r.error)
    const host = document.createElement('div')
    document.body.append(host)
    const ctx = { fuentes, barribles: [], condicionesIniciales, redes: [], corrientes: [] } as unknown as ContextoAnalisis
    quitar = render(
      () => (
        <FichaAnalisis
          tipo="tran"
          guardados={[r.analisis as AnalisisDoc]}
          elegido={r.analisis as AnalisisDoc}
          onElegir={() => {}}
          ctx={ctx}
          errorCtx={null}
          editable
          motivoNoEditable={null}
          onNuevo={() => null}
          onGuardar={() => null}
          onBorrar={() => {}}
          corriendo={false}
          motivoNoEjecutar={null}
          onEjecutar={() => {}}
          onDetener={() => {}}
          onDescartar={() => {}}
          errorCorrida={null}
        />
      ),
      host
    )
    const caja = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((i) => i.parentElement?.textContent?.includes('Partir de cero'))!
    return { host, caja }
  }

  it('sin condiciones iniciales la casilla es libre y no lleva nota', () => {
    const { host, caja } = montar([])
    expect(caja.checked).toBe(false)
    expect(caja.disabled).toBe(false)
    expect(host.querySelector('.an-nota')).toBeNull()
  })

  it('con condiciones iniciales queda marcada y deshabilitada, con la nota que nombra las piezas', () => {
    const { host, caja } = montar(['C1', 'L2'])
    expect(caja.checked).toBe(true)
    expect(caja.disabled).toBe(true)
    expect(host.querySelector('.an-nota')?.textContent).toBe('Hay condiciones iniciales en C1 y L2: el análisis parte de ellas y los demás capacitores parten descargados.')
  })
})
