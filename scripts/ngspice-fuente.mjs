// De dónde sale ngspice 47 y con qué suma se acepta. Lo comparten `referencias-ngspice.mjs` (herramienta de desarrollo) y
// `preparar-ngspice.mjs` (lo que viaja en el instalador). Cambiar una suma es cambiar lo que se distribuye: se revisa a mano.

/** Versión con que se midieron las referencias del motor. */
export const VERSION = '47'

/** ngspice 47 portable para Windows de 64 bits (sourceforge.net/projects/ngspice, 11 de agosto de 2026). */
export const WINDOWS = {
  nombre: 'ngspice-47_64.7z',
  url: 'https://sourceforge.net/projects/ngspice/files/ng-spice-rework/47/ngspice-47_64.7z/download',
  sha256: '59225971bd68cdd1199443649aa4615a9e6d684933f205ab49006a3942518f5a'
}

/** Código fuente oficial de ngspice 47 (macOS y Linux lo compilan en la corrida; suma tomada del archivo oficial). */
export const FUENTES = {
  nombre: 'ngspice-47.tar.gz',
  url: 'https://sourceforge.net/projects/ngspice/files/ng-spice-rework/47/ngspice-47.tar.gz/download',
  sha256: '894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f'
}
