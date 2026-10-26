import { createSignal, type Accessor } from 'solid-js'
import { MotorTutorial, type EstadoMotor, type OyentesMotor } from './motor'
import type { CapituloDef, CtxTutorial } from './tipos'

export interface ControlTutorial {
  /** El capítulo y el paso en marcha, o null si no hay tutorial a la vista. */
  estado: Accessor<EstadoMotor | null>
  iniciar(c: CapituloDef, desde?: number): boolean
  evaluar(ctx: CtxTutorial): void
  /** Un hecho de la aplicación que algún paso espera (guardado, exportado…). */
  registrar(evento: string): void
  siguiente(): void
  saltar(): void
  atras(): void
  salir(): void
}

/** El motor con su estado en una señal de Solid: lo que se pinta se repinta solo con cada cambio de paso o de cumplido. */
export function crearControlTutorial(oyentes: Pick<OyentesMotor, 'alAvanzar' | 'alTerminar'>): ControlTutorial {
  const [estado, setEstado] = createSignal<EstadoMotor | null>(null, { equals: false })
  const motor = new MotorTutorial({ ...oyentes, alCambiar: () => setEstado(motor.estado()) })
  return {
    estado,
    iniciar: (c, desde) => motor.iniciar(c, desde),
    evaluar: (ctx) => motor.evaluar(ctx),
    registrar: (e) => motor.registrar(e),
    siguiente: () => motor.siguiente(),
    saltar: () => motor.saltar(),
    atras: () => motor.atras(),
    salir: () => motor.salir()
  }
}
