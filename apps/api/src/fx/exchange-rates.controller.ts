import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  type ExchangeRateDto,
  type ExchangeRateLookupDto,
  exchangeRateDtoSchema,
  exchangeRateHistoryQuerySchema,
  exchangeRateLookupDtoSchema,
  exchangeRateQuerySchema,
  listOf,
} from '@cf/shared';
import type { z } from 'zod';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ApiErrors, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { FinanceContextService } from '../finance/finance-context.service.js';
import { ExchangeRatesService } from './exchange-rates.service.js';

@ApiTags('exchange-rates')
@ApiCookieAuth()
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(
    private readonly rates: ExchangeRatesService,
    private readonly finance: FinanceContextService,
  ) {}

  @Get('current')
  @ApiOperation({
    summary: 'Tasa vigente de un par (por defecto USD/COP, TRM oficial) con su variación.',
    description:
      'Solo devuelve tasas guardadas con su fuente y fecha. Sin datos: `status: missing` (nunca se inventa).',
  })
  @ApiQuery({ name: 'base', required: false, example: 'USD' })
  @ApiQuery({ name: 'quote', required: false, example: 'COP' })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-07' })
  @ApiZodResponse(200, exchangeRateLookupDtoSchema, 'Tasa vigente o ausencia de datos.')
  @ApiErrors(400, 401)
  async current(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodPipe(exchangeRateQuerySchema)) query: z.output<typeof exchangeRateQuerySchema>,
  ): Promise<ExchangeRateLookupDto> {
    const date = query.date ?? (await this.finance.load(auth.userId)).today;
    return this.rates.lookup(query.base, query.quote, date);
  }

  @Get()
  @ApiOperation({ summary: 'Histórico de tasas publicadas de un par en un rango de fechas.' })
  @ApiZodResponse(200, listOf(exchangeRateDtoSchema), 'Tasas ordenadas por fecha.')
  @ApiErrors(400, 401)
  async history(
    @Query(new ZodPipe(exchangeRateHistoryQuerySchema))
    query: z.output<typeof exchangeRateHistoryQuerySchema>,
  ): Promise<{ data: ExchangeRateDto[] }> {
    return { data: await this.rates.history(query.base, query.quote, query.from, query.to) };
  }
}
