import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashIp,
  sha256Hex,
  SESSION_TOKEN_PATTERN,
} from '../common/security/crypto.js';
import { LOCKOUT_THRESHOLD, lockoutDurationMs, passwordContainsEmail } from './auth.service.js';
import { PASSWORD_HASH_OPTIONS, PasswordService } from './password.service.js';

const MIN = 60_000;

describe('bloqueo progresivo', () => {
  it.each([
    [0, 0],
    [LOCKOUT_THRESHOLD - 1, 0],
    [5, 15 * MIN],
    [9, 15 * MIN],
    [10, 30 * MIN],
    [15, 60 * MIN],
    [100, 24 * 60 * MIN],
  ])('%i intentos → %i ms', (attempts, expected) => {
    expect(lockoutDurationMs(attempts)).toBe(expected);
  });
});

describe('contraseña con datos del correo', () => {
  it('detecta la parte local del correo sin importar mayúsculas', () => {
    expect(passwordContainsEmail('MiClave-CAROLINA-2026', 'carolina@prueba.co')).toBe(true);
    expect(passwordContainsEmail('frase-muy-larga-y-ajena', 'carolina@prueba.co')).toBe(false);
  });

  it('ignora partes locales muy cortas', () => {
    expect(passwordContainsEmail('una-frase-con-ana-dentro', 'ana@prueba.co')).toBe(false);
  });
});

describe('criptografía de sesiones', () => {
  it('sha256Hex coincide con el vector conocido', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('los tokens son únicos y con formato fijo', () => {
    const tokens = new Set(Array.from({ length: 1000 }, generateSessionToken));
    expect(tokens.size).toBe(1000);
    for (const token of tokens) expect(token).toMatch(SESSION_TOKEN_PATTERN);
  });

  it('hashIp seudonimiza de forma estable y depende del secreto', () => {
    expect(hashIp(undefined, 's')).toBeNull();
    expect(hashIp('10.0.0.1', 'a')).toBe(hashIp('10.0.0.1', 'a'));
    expect(hashIp('10.0.0.1', 'a')).not.toBe(hashIp('10.0.0.1', 'b'));
    expect(hashIp('10.0.0.1', 'a')).not.toContain('10.0.0.1');
  });
});

describe('PasswordService', () => {
  const service = new PasswordService();

  it('usa Argon2id con los parámetros de la política y verifica', async () => {
    const hash = await service.hash('una-frase-de-prueba-segura');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain(
      `m=${PASSWORD_HASH_OPTIONS.memoryCost},t=${PASSWORD_HASH_OPTIONS.timeCost},p=1`,
    );
    expect(await service.verify(hash, 'una-frase-de-prueba-segura')).toBe(true);
    expect(await service.verify(hash, 'otra-frase')).toBe(false);
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('dos hashes de la misma clave son distintos (sal aleatoria)', async () => {
    const [a, b] = await Promise.all([
      service.hash('misma-clave-123456'),
      service.hash('misma-clave-123456'),
    ]);
    expect(a).not.toBe(b);
  });

  it('un hash corrupto nunca autentica y pide rehash', async () => {
    expect(await service.verify('no-es-un-hash', 'x')).toBe(false);
    expect(service.needsRehash('no-es-un-hash')).toBe(true);
  });

  it('pide rehash si el hash es más débil que la política', () => {
    const weak =
      '$argon2id$v=19$m=4096,t=1,p=1$c2FsdHNhbHRzYWx0c2FsdA$GlZ3o8h2oZpSi0F2yqWm8rZ4mJ7bJ9tqfK8f1vO6m3I';
    expect(service.needsRehash(weak)).toBe(true);
  });
});
