import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, consents, userSettings, users } from '@cf/db';
import {
  CURRENT_TERMS_VERSION,
  type UserDto,
  type loginRequestSchema,
  type registerRequestSchema,
} from '@cf/shared';
import { eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { AppError } from '../common/errors/app-error.js';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';
import { UsersService } from '../users/users.service.js';
import { PasswordService } from './password.service.js';
import { type AuthContext, SessionService, type SessionTransport } from './session.service.js';

export type RegisterInput = z.output<typeof registerRequestSchema>;
export type LoginInput = z.output<typeof loginRequestSchema>;

export interface AuthResult {
  user: UserDto;
  token: string;
  expiresAt: Date;
  transport: SessionTransport;
}

/** Bloqueo progresivo: a partir de 5 fallos, 15 min que se duplican cada 5 fallos más (máx. 24 h). */
export const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_BASE_MS = 15 * 60 * 1000;
const LOCKOUT_MAX_MS = 24 * 60 * 60 * 1000;

export function lockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < LOCKOUT_THRESHOLD) return 0;
  const step = Math.floor((failedAttempts - LOCKOUT_THRESHOLD) / LOCKOUT_THRESHOLD);
  return Math.min(LOCKOUT_BASE_MS * 2 ** step, LOCKOUT_MAX_MS);
}

/** La contraseña no debe contener la parte local del correo (contexto obvio, NIST 800-63B). */
export function passwordContainsEmail(password: string, email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return local.length >= 4 && password.toLowerCase().includes(local.toLowerCase());
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const cause = (error as { cause?: unknown }).cause ?? error;
  return (
    (cause as { code?: unknown }).code === '23505' &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly usersService: UsersService,
    private readonly audit: AuditService,
  ) {}

  async register(input: RegisterInput, context: RequestContext): Promise<AuthResult> {
    if (passwordContainsEmail(input.password, input.email)) {
      throw new AppError('VALIDATION_ERROR', [
        { path: 'password', message: 'La contraseña no debe contener tu correo.' },
      ]);
    }
    const passwordHash = await this.passwords.hash(input.password);

    let userId: string;
    try {
      userId = await this.database.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, passwordHash, displayName: input.displayName })
          .returning({ id: users.id });
        if (!user) throw new Error('No se pudo crear el usuario');

        await tx.insert(userSettings).values({ userId: user.id, locale: input.locale });
        await tx.insert(consents).values([
          {
            userId: user.id,
            type: 'terms_of_service',
            version: CURRENT_TERMS_VERSION,
            ipHash: context.ipHash,
          },
          {
            userId: user.id,
            type: 'privacy_policy',
            version: CURRENT_TERMS_VERSION,
            ipHash: context.ipHash,
          },
        ]);
        await this.audit.record(
          {
            action: 'user_registered',
            userId: user.id,
            entityType: 'user',
            entityId: user.id,
            context,
          },
          tx,
        );
        return user.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_uq')) throw new AppError('EMAIL_TAKEN');
      throw error;
    }

    const session = await this.sessions.create(userId, 'cookie', context);
    return {
      user: await this.usersService.getUserDto(userId),
      token: session.token,
      expiresAt: session.expiresAt,
      transport: 'cookie',
    };
  }

  async login(
    input: LoginInput,
    context: RequestContext,
    now: Date = new Date(),
  ): Promise<AuthResult> {
    const [user] = await this.database.db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!user) {
      await this.passwords.verifyAgainstDummy(input.password);
      await this.audit.record({
        action: 'login_failed',
        metadata: { reason: 'unknown_email' },
        context,
      });
      throw new AppError('INVALID_CREDENTIALS');
    }

    if (user.lockedUntil && user.lockedUntil > now) {
      await this.audit.record({
        action: 'login_failed',
        userId: user.id,
        metadata: { reason: 'locked' },
        context,
      });
      throw new AppError('ACCOUNT_LOCKED');
    }

    const passwordOk = await this.passwords.verify(user.passwordHash, input.password);
    if (!passwordOk || user.status !== 'active') {
      await this.registerFailure(
        user.id,
        now,
        context,
        passwordOk ? 'inactive_user' : 'bad_password',
      );
      throw new AppError('INVALID_CREDENTIALS');
    }

    const rehash = this.passwords.needsRehash(user.passwordHash)
      ? await this.passwords.hash(input.password)
      : undefined;
    await this.database.db
      .update(users)
      .set({
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: now,
        ...(rehash ? { passwordHash: rehash } : {}),
      })
      .where(eq(users.id, user.id));

    const session = await this.sessions.create(user.id, input.tokenTransport, context, now);
    await this.audit.record({
      action: 'login_succeeded',
      userId: user.id,
      entityType: 'session',
      entityId: session.sessionId,
      metadata: { transport: input.tokenTransport },
      context,
    });

    return {
      user: await this.usersService.getUserDto(user.id),
      token: session.token,
      expiresAt: session.expiresAt,
      transport: input.tokenTransport,
    };
  }

  async logout(auth: AuthContext, context: RequestContext): Promise<void> {
    await this.sessions.revoke(auth.sessionId);
    await this.audit.record({
      action: 'logout',
      userId: auth.userId,
      entityType: 'session',
      entityId: auth.sessionId,
      context,
    });
  }

  async logoutAll(auth: AuthContext, context: RequestContext): Promise<void> {
    const count = await this.sessions.revokeAllForUser(auth.userId);
    await this.audit.record({
      action: 'logout_all',
      userId: auth.userId,
      metadata: { sessions: count },
      context,
    });
  }

  /** Incrementa el contador de forma atómica (seguro ante intentos concurrentes). */
  private async registerFailure(
    userId: string,
    now: Date,
    context: RequestContext,
    reason: string,
  ): Promise<void> {
    const [updated] = await this.database.db
      .update(users)
      .set({ failedLoginCount: sql`${users.failedLoginCount} + 1` })
      .where(eq(users.id, userId))
      .returning({ failedLoginCount: users.failedLoginCount });
    const attempts = updated?.failedLoginCount ?? 0;
    await this.audit.record({
      action: 'login_failed',
      userId,
      metadata: { reason, attempts },
      context,
    });

    const lockMs = lockoutDurationMs(attempts);
    if (lockMs > 0) {
      const lockedUntil = new Date(now.getTime() + lockMs);
      await this.database.db.update(users).set({ lockedUntil }).where(eq(users.id, userId));
      await this.audit.record({
        action: 'account_locked',
        userId,
        metadata: { attempts, minutes: lockMs / 60_000 },
        context,
      });
    }
  }
}
