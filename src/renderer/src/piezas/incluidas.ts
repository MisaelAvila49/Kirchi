import { cargarLibreria, type Libreria } from './libreria'

// Ruta relativa a este archivo: src/renderer/src/piezas → raíz del repositorio. Vite incluye el texto en el paquete.
const archivos = import.meta.glob('../../../../componentes/**/*.{json,svg}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export function libreriaIncluida(): Libreria {
  return cargarLibreria(archivos)
}
