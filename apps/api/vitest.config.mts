import { defineConfig } from 'vitest/config';

// NestJS necesita los metadatos de decoradores (design:paramtypes) para la
// inyección de dependencias; Oxc los emite en modo de decoradores legacy.
const oxc = { decorator: { legacy: true, emitDecoratorMetadata: true } };

export default defineConfig({
  oxc,
  test: {
    projects: [
      {
        oxc,
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        oxc,
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
