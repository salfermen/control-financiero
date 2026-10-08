import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-support/**'],
      reporter: ['text-summary', 'text'],
      // El Financial Engine es la fuente de verdad de los cálculos: se exige
      // cobertura alta y la CI falla si baja (§40 de AGENTS.md).
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
