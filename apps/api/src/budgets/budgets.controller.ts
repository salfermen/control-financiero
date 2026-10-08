import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  type BudgetStatusDto,
  type BudgetsMonthDto,
  budgetStatusDtoSchema,
  budgetsMonthDtoSchema,
  budgetsQuerySchema,
  createBudgetRequestSchema,
  deleteBudgetQuerySchema,
  updateBudgetRequestSchema,
} from '@cf/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ApiErrors, ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { requestContext } from '../common/request-context.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { UuidParamPipe } from '../finance/uuid-param.pipe.js';
import { BudgetsService } from './budgets.service.js';

@ApiTags('budgets')
@ApiCookieAuth()
@Controller('budgets')
export class BudgetsController {
  constructor(
    private readonly budgets: BudgetsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Presupuestos vigentes en un mes con lo gastado, lo programado y su nivel de alerta.',
    description:
      'Calculado por el Financial Engine: gastos + comisiones − reembolsos en moneda base; una categoría incluye sus subcategorías. Alertas desde 75 %, 90 % y 100 % de lo comprometido.',
  })
  @ApiQuery({ name: 'month', required: false, example: '2026-10' })
  @ApiZodResponse(200, budgetsMonthDtoSchema, 'Presupuestos del mes.')
  @ApiErrors(400, 401)
  month(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodPipe(budgetsQuerySchema)) query: z.output<typeof budgetsQuerySchema>,
  ): Promise<BudgetsMonthDto> {
    return this.budgets.month(auth.userId, query.month);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea un presupuesto mensual (global o de una categoría de gasto).',
    description: 'Rige desde `startMonth` (por defecto el mes actual) en adelante.',
  })
  @ApiZodBody(createBudgetRequestSchema)
  @ApiZodResponse(201, budgetStatusDtoSchema, 'Presupuesto creado con su estado en el mes inicial.')
  @ApiErrors(400, 401, 403, 409, 422)
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(createBudgetRequestSchema)) body: z.output<typeof createBudgetRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<BudgetStatusDto> {
    return this.budgets.create(
      auth.userId,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cambia el límite desde un mes (por defecto el actual).',
    description:
      'Los meses anteriores conservan su límite: se crea una versión nueva si hace falta.',
  })
  @ApiZodBody(updateBudgetRequestSchema)
  @ApiZodResponse(200, budgetStatusDtoSchema, 'Estado del presupuesto en ese mes.')
  @ApiErrors(400, 401, 403, 404, 422)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Body(new ZodPipe(updateBudgetRequestSchema)) body: z.output<typeof updateBudgetRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<BudgetStatusDto> {
    return this.budgets.update(
      auth.userId,
      id,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Deja de presupuestar desde un mes (por defecto el actual).',
    description: 'Los meses anteriores conservan su presupuesto.',
  })
  @ApiQuery({ name: 'fromMonth', required: false, example: '2026-10' })
  @ApiErrors(400, 401, 403, 404, 422)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Query(new ZodPipe(deleteBudgetQuerySchema)) query: z.output<typeof deleteBudgetQuerySchema>,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.budgets.remove(
      auth.userId,
      id,
      query.fromMonth,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }
}
