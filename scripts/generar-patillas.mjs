// Regenera componentes/patillas.json: los ids de patilla de cada pieza, que las órdenes de edición usan como nombre estable.
// Agregar piezas o patillas pide correrlo de nuevo; quitar o renombrar una patilla rompe el contrato y la prueba lo avisa.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', 'componentes')
const tipos = {}

function recorrer(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) recorrer(ruta)
    else if (e.name === 'pieza.json') {
      const def = JSON.parse(readFileSync(ruta, 'utf8'))
      tipos[def.id] = def.pines.map((p) => p.id)
    }
  }
}

recorrer(raiz)
const ordenado = Object.fromEntries(Object.keys(tipos).sort().map((k) => [k, tipos[k]]))
const lineas = Object.entries(ordenado).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
writeFileSync(join(raiz, 'patillas.json'), `{\n${lineas.join(',\n')}\n}\n`)
console.log(`${Object.keys(ordenado).length} piezas en componentes/patillas.json`)
