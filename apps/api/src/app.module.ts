import { type DynamicModule, Module } from '@nestjs/common';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { ReferenceModule } from './reference/reference.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Módulo raíz. Cada dominio financiero (accounts, transactions, budgets…) se
 * añadirá como un módulo propio en su fase, sin tocar los existentes.
 */
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        DatabaseModule.forRoot(config),
        AuditModule,
        AuthModule,
        UsersModule,
        ReferenceModule,
      ],
      controllers: [HealthController],
    };
  }
}
