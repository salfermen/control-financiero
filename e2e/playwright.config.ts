import { defineConfig, devices } from '@playwright/test';
import { loadEnvFromWorkspace } from '@cf/db';

loadEnvFromWorkspace(import.meta.dirname);

/**
 * E2E contra los servicios reales compilados (`pnpm build` antes):
 * API en :4100 y web en :3100 sobre la base E2E_DATABASE_URL (debe contener "test").
 */
const databaseUrl = process.env.E2E_DATABASE_URL ?? '';
if (!/test/i.test(new URL(databaseUrl || 'postgresql://x/x').pathname)) {
  throw new Error('E2E_DATABASE_URL debe apuntar a una base cuyo nombre contenga "test".');
}
const apiPort = 4100;
const webPort = 3100;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Permite usar un Chromium ya instalado (p. ej. en contenedores sin descarga).
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        ...(process.env.PW_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'node reset-db.mjs && node ../apps/api/dist/main.js',
      url: `http://127.0.0.1:${apiPort}/health/ready`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: databaseUrl,
        API_PORT: String(apiPort),
        API_HOST: '127.0.0.1',
        CORS_ORIGINS: `http://127.0.0.1:${webPort}`,
        IP_HASH_SECRET: process.env.IP_HASH_SECRET ?? 'secreto-e2e-con-mas-de-32-caracteres!!',
        LOG_LEVEL: 'warn',
        // Toda la suite comparte IP (la del servidor web): los límites se suben solo aquí.
        AUTH_RATE_LIMIT_MAX: '1000',
        RATE_LIMIT_MAX: '100000',
        TRUST_PROXY: '127.0.0.1,::1',
      },
    },
    {
      command: `pnpm --filter @cf/web exec next start --port ${webPort} --hostname 127.0.0.1`,
      url: `http://127.0.0.1:${webPort}/ingresar`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'production',
        API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
