import { Injectable } from '@nestjs/common';
import { type Algorithm, hash, parseOptions, verify } from '@node-rs/argon2';

/**
 * Parámetros Argon2id: mínimo recomendado por OWASP (19 MiB, 2 pasadas,
 * paralelismo 1). Si se endurecen, los hashes antiguos se actualizan solos en
 * el siguiente login correcto (`needsRehash`).
 */
const ARGON2ID = 2 as Algorithm;
export const PASSWORD_HASH_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, PASSWORD_HASH_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      // Un hash corrupto nunca autentica.
      return false;
    }
  }

  /**
   * Verifica contra un hash ficticio para que un correo inexistente tarde lo
   * mismo que una contraseña incorrecta (evita enumerar usuarios por tiempo).
   */
  async verifyAgainstDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('cuenta-inexistente-para-igualar-tiempos');
    await this.verify(await this.dummyHash, password);
  }

  needsRehash(passwordHash: string): boolean {
    try {
      const current = parseOptions(passwordHash);
      return (
        current.algorithm !== PASSWORD_HASH_OPTIONS.algorithm ||
        current.memoryCost < PASSWORD_HASH_OPTIONS.memoryCost ||
        current.timeCost < PASSWORD_HASH_OPTIONS.timeCost
      );
    } catch {
      return true;
    }
  }
}
