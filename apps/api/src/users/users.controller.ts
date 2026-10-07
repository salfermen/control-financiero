import { Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type UserDto, updateSettingsRequestSchema, userDtoSchema } from '@cf/shared';
import type { FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ApiErrors, ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { requestContext } from '../common/request-context.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiCookieAuth()
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Perfil y ajustes del usuario autenticado.' })
  @ApiZodResponse(200, userDtoSchema, 'Usuario actual.')
  @ApiErrors(401)
  me(@CurrentAuth() auth: AuthContext): Promise<UserDto> {
    return this.users.getUserDto(auth.userId);
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Actualiza moneda base, idioma, zona horaria o tema.',
    description:
      'La moneda base solo puede cambiarse mientras no existan movimientos (BASE_CURRENCY_LOCKED).',
  })
  @ApiZodBody(updateSettingsRequestSchema)
  @ApiZodResponse(200, userDtoSchema, 'Ajustes guardados.')
  @ApiErrors(400, 401, 403, 409)
  updateSettings(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(updateSettingsRequestSchema))
    body: z.output<typeof updateSettingsRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<UserDto> {
    return this.users.updateSettings(
      auth.userId,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }
}
