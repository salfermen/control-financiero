import { Controller, Get, HttpCode, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { DatabaseHandle } from '@cf/db';
import { type HealthDto, healthDtoSchema } from '@cf/shared';
import { sql } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators.js';
import { ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { DATABASE } from '../database/database.module.js';

const DB_CHECK_TIMEOUT_MS = 2_000;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly database: DatabaseHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('live')
  @HttpCode(200)
  @ApiOperation({ summary: 'El proceso está vivo (no consulta dependencias).' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Listo para recibir tráfico: verifica PostgreSQL.' })
  @ApiZodResponse(200, healthDtoSchema, 'Todas las dependencias responden.')
  @ApiZodResponse(503, healthDtoSchema, 'Alguna dependencia no responde.')
  async ready(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthDto> {
    const database = await this.checkDatabase();
    const status = database === 'up' ? 'ok' : 'degraded';
    void reply.status(status === 'ok' ? 200 : 503).header('cache-control', 'no-store');
    return {
      status,
      checks: { database },
      version: this.config.APP_VERSION,
      time: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.database.db.execute(sql`SELECT 1`),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), DB_CHECK_TIMEOUT_MS);
        }),
      ]);
      return 'up';
    } catch {
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
