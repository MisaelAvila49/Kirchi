import type { Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// axe-core (MPL-2.0) es solo una dependencia de desarrollo: se inyecta en la página durante las pruebas y no se empaqueta.
const AXE = readFileSync(join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8')

/** Fallas graves o críticas de axe en la página tal como está, como «regla: selector» para que el reporte diga dónde. */
export async function fallasGraves(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE)
  const r = await page.evaluate(() => (window as any).axe.run(document, { resultTypes: ['violations'] }))
  return (r.violations as { id: string; impact: string; nodes: { target: string[] }[] }[])
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
}
