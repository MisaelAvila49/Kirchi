import solid from 'vite-plugin-solid'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [solid({ hot: false })],
  test: {
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Las mediciones de tiempo corren aparte y en serie (vitest.rendimiento.config.ts): en paralelo se inflan al doble.
    exclude: [...configDefaults.exclude, 'src/**/*.rendimiento.test.ts'],
    environment: 'node'
  }
})
