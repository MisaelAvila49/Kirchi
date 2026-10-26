import { join } from 'node:path'

export interface OpcionesRecursos {
  /** `app.isPackaged`. */
  empaquetado: boolean
  /** `process.resourcesPath`: la carpeta `resources` junto al ejecutable instalado. */
  resourcesPath: string
  /** `app.getAppPath()`: la raíz del proyecto en desarrollo. */
  appPath: string
}

/** Carpeta de herramientas externas (ngspice): `resources/herramientas` fuera del asar al instalar, la del repositorio en desarrollo. Nada se descarga. */
export function carpetaHerramientas(o: OpcionesRecursos): string {
  return o.empaquetado ? join(o.resourcesPath, 'herramientas') : join(o.appPath, 'resources', 'herramientas')
}
