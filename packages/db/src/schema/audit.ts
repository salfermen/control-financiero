import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, primaryId, sha256Hex } from './columns.js';
import { actorTypeEnum } from './enums.js';

/**
 * Registro de auditoría de solo inserción.
 *
 * - `user_id` no tiene FK a propósito: el rastro debe sobrevivir a cambios en
 *   otras tablas. Al borrar una cuenta, el servicio de borrado elimina también
 *   sus eventos (derecho de supresión).
 * - Un trigger (migración 0001) impide cualquier UPDATE.
 * - `metadata` nunca debe contener secretos, tokens ni contraseñas.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: primaryId(),
    userId: uuid('user_id'),
    actorType: actorTypeEnum('actor_type').notNull(),
    action: varchar('action', { length: 64 }).notNull(),
    entityType: varchar('entity_type', { length: 64 }),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    requestId: varchar('request_id', { length: 64 }),
    ipHash: sha256Hex('ip_hash'),
    userAgent: varchar('user_agent', { length: 512 }),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_user_created_idx').on(t.userId, t.createdAt.desc()),
    index('audit_logs_action_created_idx').on(t.action, t.createdAt.desc()),
  ],
);
