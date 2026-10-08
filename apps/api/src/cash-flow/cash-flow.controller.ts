import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { type CashFlowDto, cashFlowDtoSchema, cashFlowQuerySchema } from '@cf/shared';
import type { z } from 'zod';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ApiErrors, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { CashFlowService } from './cash-flow.service.js';

@ApiTags('cash-flow')
@ApiCookieAuth()
@Controller('cash-flow')
export class CashFlowController {
  constructor(private readonly cashFlow: CashFlowService) {}

  @Get()
  @ApiOperation({
    summary: 'Ingresos, gastos, reembolsos y neto de un mes en la moneda base.',
    description:
      'Transferencias, pagos de tarjeta e inversiones no cuentan como gasto ni ingreso; se informan en `excluded`.',
  })
  @ApiQuery({ name: 'month', required: false, example: '2026-10' })
  @ApiQuery({ name: 'includePending', required: false, example: 'true' })
  @ApiZodResponse(200, cashFlowDtoSchema, 'Flujo de caja del mes.')
  @ApiErrors(400, 401)
  month(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodPipe(cashFlowQuerySchema)) query: z.output<typeof cashFlowQuerySchema>,
  ): Promise<CashFlowDto> {
    return this.cashFlow.month(auth.userId, query.month, query.includePending);
  }
}
