import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthResponseDto,
  authResponseDtoSchema,
  loginRequestSchema,
  registerRequestSchema,
  sessionInfoDtoSchema,
} from '@cf/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiErrors, ApiZodBody, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { requestContext } from '../common/request-context.js';
import { ZodPipe } from '../common/validation/zod.pipe.js';
import { APP_CONFIG, type AppConfig } from '../config/env.js';
import { UsersService } from '../users/users.service.js';
import {
  AuthService,
  type AuthResult,
  type LoginInput,
  type RegisterInput,
} from './auth.service.js';
import { CurrentAuth, Public } from './decorators.js';
import type { AuthContext } from './session.service.js';

const sessionInfoSchema = sessionInfoDtoSchema;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Crea una cuenta, registra el consentimiento y abre una sesión (cookie).',
  })
  @ApiZodBody(registerRequestSchema)
  @ApiZodResponse(201, sessionInfoSchema, 'Cuenta creada. La sesión viaja en una cookie httpOnly.')
  @ApiErrors(400, 403, 409, 429)
  async register(
    @Body(new ZodPipe(registerRequestSchema)) body: RegisterInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.register(
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
    return this.respond(result, reply);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Inicia sesión.',
    description:
      'Con `tokenTransport: cookie` (web) la sesión se guarda en una cookie httpOnly. Con `bearer` (móvil) el token se devuelve una sola vez en el cuerpo y debe enviarse en `Authorization: Bearer`.',
  })
  @ApiZodBody(loginRequestSchema)
  @ApiZodResponse(200, authResponseDtoSchema, 'Sesión iniciada.')
  @ApiErrors(400, 401, 403, 423, 429)
  async login(
    @Body(new ZodPipe(loginRequestSchema)) body: LoginInput,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthResponseDto> {
    const result = await this.auth.login(body, requestContext(request, this.config.IP_HASH_SECRET));
    return this.respond(result, reply);
  }

  @Get('session')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Devuelve el usuario y la vigencia de la sesión actual.' })
  @ApiZodResponse(200, sessionInfoSchema, 'Sesión vigente.')
  @ApiErrors(401)
  async session(@CurrentAuth() auth: AuthContext): Promise<z.infer<typeof sessionInfoSchema>> {
    return {
      user: await this.users.getUserDto(auth.userId),
      session: { expiresAt: auth.expiresAt.toISOString(), transport: auth.transport },
    };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cierra la sesión actual.' })
  @ApiErrors(401, 403)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(auth, requestContext(request, this.config.IP_HASH_SECRET));
    this.clearCookie(reply);
  }

  @Post('logout-all')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Cierra todas las sesiones del usuario en todos los dispositivos.' })
  @ApiErrors(401, 403)
  async logoutAll(
    @CurrentAuth() auth: AuthContext,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logoutAll(auth, requestContext(request, this.config.IP_HASH_SECRET));
    this.clearCookie(reply);
  }

  private respond(result: AuthResult, reply: FastifyReply): AuthResponseDto {
    void reply.header('cache-control', 'no-store');
    const session = { expiresAt: result.expiresAt.toISOString(), transport: result.transport };
    if (result.transport === 'bearer') {
      return { user: result.user, session, token: result.token };
    }
    void reply.setCookie(this.config.SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      secure: this.config.SESSION_COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      expires: result.expiresAt,
    });
    return { user: result.user, session };
  }

  private clearCookie(reply: FastifyReply): void {
    void reply.clearCookie(this.config.SESSION_COOKIE_NAME, {
      httpOnly: true,
      secure: this.config.SESSION_COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }
}
