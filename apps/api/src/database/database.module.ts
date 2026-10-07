import {
  type DynamicModule,
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { createDatabase, type DatabaseHandle } from '@cf/db';
import type { AppConfig } from '../config/env.js';

/** Token de inyección del acceso a PostgreSQL (`DatabaseHandle`). */
export const DATABASE = Symbol('DATABASE');

@Global()
@Module({})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly handle: DatabaseHandle) {}

  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: DATABASE,
          useFactory: (): DatabaseHandle =>
            createDatabase(config.DATABASE_URL, {
              maxConnections: config.DATABASE_POOL_MAX,
              applicationName: 'cf-api',
              statementTimeoutMs: 15_000,
            }),
        },
      ],
      exports: [DATABASE],
    };
  }

  async onApplicationShutdown(): Promise<void> {
    await this.handle.close();
  }
}
