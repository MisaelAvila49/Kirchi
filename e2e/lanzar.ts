import { _electron as electron, type ElectronApplication } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Carpeta de datos nueva: cada corrida empieza con los ajustes por omisión y no toca los del usuario. */
const creadas: string[] = []
export const carpetaNueva = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'kirchi-e2e-'))
  creadas.push(d)
  return d
}
// Al terminar el proceso de Playwright se borran las carpetas de datos de la corrida.
process.on('exit', () => {
  for (const d of creadas) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      // Una carpeta temporal que no se puede borrar no debe fallar la corrida.
    }
  }
})

/** Abre Kirchi con `--pruebas` (la sonda `window.__kirchi`) y una carpeta de datos propia. Sin ELECTRON_RUN_AS_NODE, que VS Code define y haría correr Electron como Node. `args` se agregan al final. */
export async function lanzar(o: { datos?: string; pruebas?: boolean; args?: string[] } = {}): Promise<ElectronApplication> {
  const { ELECTRON_RUN_AS_NODE: _omit, ...env } = process.env
  const args = ['.', `--datos=${o.datos ?? carpetaNueva()}`]
  if (o.pruebas !== false) args.push('--pruebas')
  args.push(...(o.args ?? []))
  return electron.launch({ args, env: env as Record<string, string> })
}

/** Kirchi arranca con el panel lateral y el inspector plegados: las pruebas que los miran los abren primero con esto. */
export async function abrirPaneles(page: import('@playwright/test').Page): Promise<void> {
  if ((await page.locator('aside.lateral:not(.derecho)').count()) === 0) await page.locator('.riel-boton[data-panel="libreria"]').click()
  if ((await page.locator('aside.inspector').count()) === 0) await page.locator('.riel.der .riel-boton[data-panel="inspector"]').click()
  await page.locator('aside.lateral:not(.derecho)').waitFor()
  await page.locator('aside.inspector').waitFor()
}
