import { type DynamicModule, Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CashFlowModule } from './cash-flow/cash-flow.module.js';
import { ConfigModule } from './config/config.module.js';
import type { AppConfig } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { ExchangeRatesModule } from './fx/exchange-rates.module.js';
import { HealthController } from './health/health.controller.js';
import { ReferenceModule } from './reference/reference.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * Módulo raíz. Cada dominio financiero es un módulo propio (F4: cuentas,
 * movimientos, tasas y flujo de caja; budgets… en fases siguientes).
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
        AccountsModule,
        TransactionsModule,
        ExchangeRatesModule,
        CashFlowModule,
      ],
      controllers: [HealthController],
    };
  }
}
