import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['src/**/*.int.test.ts'],
          // Las pruebas de integración comparten una base real: sin paralelismo.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
