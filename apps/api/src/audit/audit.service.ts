import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseHandle, type Database, auditLogs } from '@cf/db';
import type { RequestContext } from '../common/request-context.js';
import { DATABASE } from '../database/database.module.js';

/** Eventos auditables. Se amplía módulo a módulo (account_created, budget_changed…). */
export type AuditAction =
  | 'user_registered'
  | 'login_succeeded'
  | 'login_failed'
  | 'account_locked'
  | 'logout'
  | 'logout_all'
  | 'settings_updated'
  | 'account_created'
  | 'account_updated'
  | 'account_deleted'
  | 'transaction_created'
  | 'transaction_updated'
  | 'transaction_deleted'
  | 'category_created'
  | 'category_updated'
  | 'category_deleted'
  | 'budget_created'
  | 'budget_changed'
  | 'budget_deleted';

export interface AuditEntry {
  action: AuditAction;
  userId?: string | null;
  actorType?: 'user' | 'system';
  entityType?: string;
  entityId?: string;
  /** Solo datos no sensibles: nunca contraseñas, tokens ni montos de terceros. */
  metadata?: Record<string, string | number | boolean | null>;
  context?: RequestContext;
}

/** Cualquier ejecutor capaz de insertar: la base o una transacción en curso. */
export type AuditExecutor = Pick<Database, 'insert'>;

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE) private readonly database: DatabaseHandle) {}

  /**
   * Registra un evento. Si falla, el error se propaga (falla cerrado): una
   * acción de seguridad sin rastro de auditoría no debe darse por buena.
   */
  async record(entry: AuditEntry, executor: AuditExecutor = this.database.db): Promise<void> {
    await executor.insert(auditLogs).values({
      action: entry.action,
      userId: entry.userId ?? null,
      actorType: entry.actorType ?? (entry.userId ? 'user' : 'system'),
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? {},
      requestId: entry.context?.requestId ?? null,
      ipHash: entry.context?.ipHash ?? null,
      userAgent: entry.context?.userAgent ?? null,
    });
  }
}
