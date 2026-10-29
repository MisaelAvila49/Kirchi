import { parentPort } from 'node:worker_threads'
import { importarBytes } from '../../renderer/src/importar/importar'
import type { PiezaDef } from '../../renderer/src/piezas/tipos'

// Corre en un trabajador aparte: recibe el archivo y la librería, y devuelve el resultado de `importarBytes`.
parentPort?.on('message', (m: { nombre: string; bytes: Uint8Array; lib: [string, PiezaDef][] }) => {
  parentPort!.postMessage(importarBytes(m.nombre, m.bytes, new Map(m.lib)))
})
