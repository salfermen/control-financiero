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
  Req,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AccountDto,
  accountDtoSchema,
  createAccountRequestSchema,
  listOf,
  updateAccountRequestSchema,
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
import { AccountsService } from './accounts.service.js';

@ApiTags('accounts')
@ApiCookieAuth()
@Controller('accounts')
export class AccountsController {
  constructor(
    private readonly accounts: AccountsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Cuentas del usuario con su saldo a hoy.',
    description:
      'El saldo se calcula con el Financial Engine (saldo inicial + movimientos), separando asentado y pendiente.',
  })
  @ApiZodResponse(200, listOf(accountDtoSchema), 'Cuentas, abiertas primero.')
  @ApiErrors(401)
  async list(@CurrentAuth() auth: AuthContext): Promise<{ data: AccountDto[] }> {
    return { data: await this.accounts.list(auth.userId) };
  }

  @Post()
  @ApiOperation({ summary: 'Crea una cuenta (banco, efectivo, billetera, tarjeta, préstamo…).' })
  @ApiZodBody(createAccountRequestSchema)
  @ApiZodResponse(201, accountDtoSchema, 'Cuenta creada.')
  @ApiErrors(400, 401, 403)
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(createAccountRequestSchema))
    body: z.output<typeof createAccountRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<AccountDto> {
    return this.accounts.create(
      auth.userId,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una cuenta con su saldo a hoy.' })
  @ApiZodResponse(200, accountDtoSchema, 'Cuenta.')
  @ApiErrors(401, 404)
  get(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
  ): Promise<AccountDto> {
    return this.accounts.get(auth.userId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita nombre, entidad, saldo inicial, notas o estado (cerrar/reabrir).',
    description: 'La moneda y el tipo no se cambian: una cuenta distinta es otra cuenta.',
  })
  @ApiZodBody(updateAccountRequestSchema)
  @ApiZodResponse(200, accountDtoSchema, 'Cuenta actualizada.')
  @ApiErrors(400, 401, 403, 404, 422)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Body(new ZodPipe(updateAccountRequestSchema))
    body: z.output<typeof updateAccountRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<AccountDto> {
    return this.accounts.update(
      auth.userId,
      id,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Elimina una cuenta sin movimientos.',
    description:
      'Con movimientos responde ACCOUNT_HAS_TRANSACTIONS: ciérrala para conservar el historial.',
  })
  @ApiErrors(401, 403, 404, 409)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.accounts.remove(
      auth.userId,
      id,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }
}
