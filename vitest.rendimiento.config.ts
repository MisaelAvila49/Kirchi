import { defineConfig } from 'vitest/config'

/**
 * Pruebas de tiempo: un archivo a la vez y cada uno en su propio proceso (`forks`, aislados) para que no compitan por el
 * procesador ni compartan el montón con el resto de la suite. `--expose-gc` deja a `prueba/medir.ts` forzar el recolector
 * antes de cada muestra.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.rendimiento.test.ts'],
    environment: 'node',
    fileParallelism: false,
    pool: 'forks',
    isolate: true,
    execArgv: ['--expose-gc']
  }
})
