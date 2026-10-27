import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import solid from 'vite-plugin-solid'

const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}

/** Lo que el proceso principal empaqueta en lugar de dejarlo en `node_modules` (el paquete instalado no lo lleva). */
const EMPAQUETADAS = ['@modelcontextprotocol/sdk', 'zod', 'fflate', 'rbush', 'earcut']

/** El modo sin ventana lee los bytes del motor junto al código del proceso principal. */
function copiarMotor(): Plugin {
  return {
    name: 'kirchi-copiar-motor',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'kirchi_engine_bg.wasm', source: readFileSync(resolve(__dirname, 'src/renderer/src/sim/pkg/kirchi_engine_bg.wasm')) })
    }
  }
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: EMPAQUETADAS }), copiarMotor()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [solid()],
    worker: { format: 'es' },
    server: { headers: ISOLATION },
    build: { target: 'esnext' }
  }
})
