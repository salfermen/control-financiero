import { describe, expect, it } from 'vitest';
import { dailyWindow } from './fx-sync.js';

describe('ventana diaria de la TRM', () => {
  it('cubre 10 días atrás y 5 adelante en la fecha local de Bogotá', () => {
    // 03:00 UTC del 8 de octubre todavía es 7 de octubre en Bogotá.
    expect(dailyWindow(new Date('2026-10-08T03:00:00Z'), 'America/Bogota')).toEqual({
      from: '2026-09-27',
      to: '2026-10-12',
    });
  });
});
