import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '../config.js';
import { JOBS } from './registry.js';

const CRON_5_FIELDS = /^(\S+\s+){4}\S+$/;

describe('registro de jobs', () => {
  it('cada job tiene nombre único con formato dominio.accion y cron de 5 campos', () => {
    const names = JOBS.map((job) => job.name);
    expect(new Set(names).size).toBe(names.length);
    for (const job of JOBS) {
      expect(job.name).toMatch(/^[a-z]+\.[a-z-]+$/);
      expect(job.cron).toMatch(CRON_5_FIELDS);
      expect(job.description.length).toBeGreaterThan(0);
    }
  });
});

describe('configuración del worker', () => {
  it('usa Bogotá y un esquema propio por defecto', () => {
    const config = loadWorkerConfig({ DATABASE_URL: 'postgresql://u:p@localhost/db' });
    expect(config.WORKER_TIMEZONE).toBe('America/Bogota');
    expect(config.WORKER_QUEUE_SCHEMA).toBe('pgboss');
  });

  it('rechaza esquemas con caracteres peligrosos', () => {
    expect(() =>
      loadWorkerConfig({
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        WORKER_QUEUE_SCHEMA: 'x;drop',
      }),
    ).toThrow(/WORKER_QUEUE_SCHEMA/);
  });
});
