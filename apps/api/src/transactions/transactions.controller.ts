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
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type TransactionDto,
  type TransactionListDto,
  createTransactionRequestSchema,
  listOf,
  transactionDtoSchema,
  transactionListDtoSchema,
  transactionListQuerySchema,
  updateTransactionRequestSchema,
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
import { TransactionsService } from './transactions.service.js';

@ApiTags('transactions')
@ApiCookieAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Movimientos del usuario, del más reciente al más antiguo, con filtros y paginación.',
  })
  @ApiZodResponse(200, transactionListDtoSchema, 'Página de movimientos y cursor siguiente.')
  @ApiErrors(400, 401)
  list(
    @CurrentAuth() auth: AuthContext,
    @Query(new ZodPipe(transactionListQuerySchema))
    query: z.output<typeof transactionListQuerySchema>,
  ): Promise<TransactionListDto> {
    return this.transactions.list(auth.userId, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Registra un gasto, ingreso, comisión, transferencia/pago o reembolso.',
    description:
      'Los montos y conversiones los calcula el Financial Engine. Con otra moneda: valor cobrado (`fx.accountAmount`), tasa (`fx.rate`) o, si no se envía, la TRM guardada; sin ella responde EXCHANGE_RATE_UNAVAILABLE. Una transferencia devuelve sus dos patas.',
  })
  @ApiZodBody(createTransactionRequestSchema)
  @ApiZodResponse(201, listOf(transactionDtoSchema), 'Movimiento(s) creado(s).')
  @ApiErrors(400, 401, 403, 409, 422)
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(createTransactionRequestSchema))
    body: z.output<typeof createTransactionRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<{ data: TransactionDto[] }> {
    return {
      data: await this.transactions.create(
        auth.userId,
        body,
        requestContext(request, this.config.IP_HASH_SECRET),
      ),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un movimiento.' })
  @ApiZodResponse(200, transactionDtoSchema, 'Movimiento.')
  @ApiErrors(401, 404)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
  ): Promise<TransactionDto> {
    return this.transactions.get(auth.userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Corrige un movimiento.',
    description:
      'En transferencias, pagos y reembolsos solo se editan descripción, notas y estado. El monto solo se edita en movimientos sin cambio de moneda.',
  })
  @ApiZodBody(updateTransactionRequestSchema)
  @ApiZodResponse(200, transactionDtoSchema, 'Movimiento actualizado.')
  @ApiErrors(400, 401, 403, 404, 409, 422)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Body(new ZodPipe(updateTransactionRequestSchema))
    body: z.output<typeof updateTransactionRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<TransactionDto> {
    return this.transactions.update(
      auth.userId,
      id,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Elimina un movimiento (una transferencia se elimina con sus dos patas).',
    description: 'Un gasto con reembolsos responde TRANSACTION_HAS_REFUNDS.',
  })
  @ApiErrors(401, 403, 404, 409)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.transactions.remove(
      auth.userId,
      id,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }
}
