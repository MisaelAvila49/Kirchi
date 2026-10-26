/**
 * Opciones de presentación de la cinta. Cada una se cambia aquí.
 */
export interface Decisiones {
  /** Pestañas en mayúsculas como MATLAB (a) o como se escriben (b). */
  pestañasMayusculas: boolean
  /** Detener siempre a la vista y deshabilitado si está detenida (a), o solo al simular (b). */
  detenerSiempre: boolean
  /** El zoom solo en Vista › Zoom (a), solo en la barra de estado (b) o en los dos (c). */
  zoomEn: 'vista' | 'estado' | 'ambos'
  /** Buscador de comandos con Ctrl+K en esta parte (a). */
  buscador: boolean
  /** Rótulos de grupo visibles (a) u ocultos, con la cinta de 82 px (b). */
  rotulosGrupo: boolean
  /**
   * Sin selección, Cortar, Copiar, Duplicar y Borrar se deshabilitan con «Selecciona algo primero.» (a), o quedan activos sin efecto (b).
   */
  segunSeleccion: boolean
  /**
   * Iconos de 14 px: planos de R1 sin detalles interiores ('plano') o trazos en el color de su orden ('linea'). Lo que se quita está en `SIMPLIFICAR` de `scripts/gen-planos.mjs`.
   */
  iconosChicos: 'plano' | 'linea'
}

export const DECISIONES: Readonly<Decisiones> = {
  pestañasMayusculas: false,
  detenerSiempre: true,
  zoomEn: 'ambos',
  buscador: true,
  rotulosGrupo: true,
  segunSeleccion: true,
  iconosChicos: 'plano'
}
