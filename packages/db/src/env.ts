import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Carga el `.env` más cercano subiendo desde `startDir` hasta la raíz del
 * monorepo (la carpeta que contiene `pnpm-workspace.yaml`). Usa el cargador
 * nativo de Node (`process.loadEnvFile`), sin dependencias.
 *
 * Las variables ya presentes en el entorno tienen prioridad: en CI y en
 * producción no existe `.env` y todo llega por variables de entorno.
 */
export function loadEnvFromWorkspace(
  startDir: string = process.cwd(),
  fileName = '.env',
): string | null {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, fileName);
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return candidate;
    }
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revisa .env.example.`);
  }
  return value;
}
