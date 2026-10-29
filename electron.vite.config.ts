import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transformWithEsbuild, type Plugin } from 'vite'
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

/** V8 y Chromium guardan el código fuente de cada bundle mientras corre, a dos bytes por carácter si trae uno solo fuera
 * de Latin-1 (Ω, −): escapados con `\u`, la interfaz ocupa unos 5 MB menos. */
function soloLatin1(): Plugin {
  return {
    name: 'kirchi-solo-latin1',
    // Al final: el transpilado de Vite para Node volvería a escribir los escapes como UTF-8.
    renderChunk: {
      order: 'post',
      async handler(code, chunk) {
        if (!/[^\x00-\xff]/.test(code)) return null
        // esbuild escapa cadenas, plantillas y nombres; deja tal cual las expresiones regulares y los comentarios.
        const r = await transformWithEsbuild(code, chunk.fileName, { loader: 'js', charset: 'ascii', sourcemap: true })
        return { code: escaparResto(r.code, this.parse(r.code)), map: JSON.stringify(r.map) }
      }
    }
  }
}

/** En una expresión regular o un comentario, `\uXXXX` vale lo mismo que el carácter (o que `\` y el carácter). Las
 * plantillas quedan como están: con etiqueta, su texto crudo cambiaría. */
function escaparResto(code: string, ast: unknown): string {
  const plantillas: [number, number][] = []
  const visitar = (n: unknown): void => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(visitar)
    const nodo = n as { type?: string; start: number; end: number }
    if (nodo.type === 'TemplateElement') plantillas.push([nodo.start, nodo.end])
    for (const v of Object.values(nodo)) if (v && typeof v === 'object') visitar(v)
  }
  visitar(ast)
  return code.replace(/(\\*)([^\x00-\xff])/g, (todo, barras: string, c: string, i: number) => {
    if (plantillas.some(([a, b]) => i >= a && i < b)) return todo
    const u = `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`
    return (barras.length % 2 ? barras.slice(1) : barras) + u
  })
}

export default defineConfig({
  main: { plugins: [externalizeDepsPlugin({ exclude: EMPAQUETADAS }), copiarMotor(), soloLatin1()] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [solid(), soloLatin1()],
    worker: { format: 'es' },
    server: { headers: ISOLATION },
    build: { target: 'esnext' }
  }
})
