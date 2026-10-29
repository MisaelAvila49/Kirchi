// Genera los CSV de ngspice de los circuitos de `importar/__fixtures__/referencias/*.cir`, que las pruebas de importación comparan
// contra la simulación del circuito importado. Necesita ngspice 47 (`herramientas/ngspice/`, ver referencias-ngspice.mjs).
// Uso: node scripts/referencias-importar.mjs [caso ...].

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const carpeta = join(raiz, 'src', 'renderer', 'src', 'importar', '__fixtures__', 'referencias')
const ng = process.platform === 'win32' ? join(raiz, 'herramientas', 'ngspice', 'Spice64', 'bin', 'ngspice_con.exe') : 'ngspice'
if (!existsSync(ng) && process.platform === 'win32') throw new Error('Falta ngspice: corre node scripts/referencias-ngspice.mjs una vez para bajarlo.')
const { leerSalida } = await import('./referencias-ngspice.mjs')

const pedidos = process.argv.slice(2)
for (const f of readdirSync(carpeta).filter((n) => n.endsWith('.cir')).sort()) {
  const caso = basename(f, '.cir')
  if (pedidos.length && !pedidos.includes(caso)) continue
  const tmp = mkdtempSync(join(tmpdir(), 'kirchi-imp-'))
  try {
    writeFileSync(join(tmp, f), readFileSync(join(carpeta, f)))
    const r = spawnSync(ng, ['-b', f], { cwd: tmp, encoding: 'utf8' })
    if (r.status !== 0 || !existsSync(join(tmp, 'salida.txt')) || /^Error/m.test(r.stdout + r.stderr)) throw new Error(`ngspice falló en ${caso}:\n${r.stdout}\n${r.stderr}`)
    const { columnas, filas } = leerSalida(readFileSync(join(tmp, 'salida.txt'), 'utf8'))
    writeFileSync(join(carpeta, `${caso}.csv`), [columnas.join(','), ...filas.map((x) => x.join(','))].join('\n') + '\n')
    console.log(`${caso}: ${filas.length} renglones, ${columnas.join(' ')}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}
