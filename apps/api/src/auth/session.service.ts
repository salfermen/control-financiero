import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, sessions, users } from '@cf/db';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import type { RequestContext } from '../common/request-context.js';
import {
  SESSION_TOKEN_PATTERN,
  generateSessionToken,
  sha256Hex,
} from '../common/security/crypto.js';
import { DATABASE } from '../database/database.module.js';

export type SessionTransport = 'cookie' | 'bearer';

export interface AuthContext {
  userId: string;
  sessionId: string;
  expiresAt: Date;
  transport: SessionTransport;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Para no escribir en cada petición, `last_used_at` se actualiza como mucho cada 5 min. */
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    userId: string,
    transport: SessionTransport,
    context: RequestContext,
    now: Date = new Date(),
  ): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const expiresAt = new Date(now.getTime() + this.config.SESSION_TTL_DAYS * DAY_MS);
    const [row] = await this.database.db
      .insert(sessions)
      .values({
        userId,
        tokenHash: sha256Hex(token),
        transport,
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
        userAgent: context.userAgent,
        ipHash: context.ipHash,
      })
      .returning({ id: sessions.id });
    if (!row) throw new Error('No se pudo crear la sesión');
    return { token, sessionId: row.id, expiresAt };
  }

  /** Devuelve el contexto si el token es válido, vigente, no inactivo y el usuario está activo. */
  async validate(token: string, now: Date = new Date()): Promise<AuthContext | null> {
    if (!SESSION_TOKEN_PATTERN.test(token)) return null;
    const idleThreshold = new Date(now.getTime() - this.config.SESSION_IDLE_DAYS * DAY_MS);

    const [row] = await this.database.db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        lastUsedAt: sessions.lastUsedAt,
        transport: sessions.transport,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, sha256Hex(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
          gt(sessions.lastUsedAt, idleThreshold),
          eq(users.status, 'active'),
        ),
      )
      .limit(1);

    if (!row) return null;

    if (now.getTime() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.database.db
        .update(sessions)
        .set({ lastUsedAt: now })
        .where(eq(sessions.id, row.sessionId));
    }

    return {
      userId: row.userId,
      sessionId: row.sessionId,
      expiresAt: row.expiresAt,
      transport: row.transport,
    };
  }

  async revoke(sessionId: string, now: Date = new Date()): Promise<void> {
    await this.database.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
  }

  async revokeAllForUser(userId: string, now: Date = new Date()): Promise<number> {
    const revoked = await this.database.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    return revoked.length;
  }
}
