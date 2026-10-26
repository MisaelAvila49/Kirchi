import solid from 'vite-plugin-solid'
import { defineConfig } from 'vitest/config'

// Pruebas de componentes (.test.tsx): Solid en su versión de navegador sobre happy-dom. Las demás pruebas corren con vitest.config.ts.
export default defineConfig({
  plugins: [solid({ hot: false })],
  resolve: { conditions: ['browser'] },
  test: { passWithNoTests: true, include: ['src/**/*.test.tsx'], environment: 'node' }
})
