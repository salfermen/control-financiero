import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { uuidv7 } from '@cf/db';
import { LogController, type FastifyRequest } from 'fastify';
import type { Logger as PinoLogger } from 'pino';
import { AppModule } from './app.module.js';
import { AppError } from './common/errors/app-error.js';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter.js';
import { PinoLoggerService, createLogger } from './common/logging/logger.js';
import { setupOpenApi } from './common/openapi/setup.js';
import type { AppConfig } from './config/env.js';

export const API_PREFIX = 'api/v1';
export const CSRF_HEADER = 'x-csrf-protection';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_LIMIT_BYTES = 1024 * 1024;

export interface CreateAppOptions {
  logger?: PinoLogger;
}

const CREDENTIAL_ROUTES = new Set([`/${API_PREFIX}/auth/login`, `/${API_PREFIX}/auth/register`]);

/** Rutas que reciben credenciales: límite estricto propio contra fuerza bruta. */
function isCredentialRoute(request: FastifyRequest): boolean {
  return request.method === 'POST' && CREDENTIAL_ROUTES.has(request.url.split('?')[0] ?? '');
}

/**
 * Construye la aplicación con todas las capas transversales. La usan `main.ts`
 * y las pruebas de integración, así que lo probado es lo que se despliega.
 */
export async function createApp(
  config: AppConfig,
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const logger = options.logger ?? createLogger(config.LOG_LEVEL);

  const adapter = new FastifyAdapter({
    loggerInstance: logger,
    trustProxy: config.TRUST_PROXY,
    bodyLimit: BODY_LIMIT_BYTES,
    genReqId: () => uuidv7(),
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(config),
    adapter,
    {
      logger: new PinoLoggerService(logger),
    },
  );

  app.setGlobalPrefix(API_PREFIX, {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.register(fastifyCookie);
  const production = config.NODE_ENV === 'production';
  await app.register(fastifyHelmet, {
    // HSTS y upgrade-insecure-requests solo en producción (en local se usa http).
    hsts: production ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        upgradeInsecureRequests: production ? [] : null,
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  });
  await app.register(fastifyRateLimit, {
    global: true,
    timeWindow: '1 minute',
    // Contadores separados: las rutas de autenticación tienen un límite mucho menor.
    max: (request) =>
      isCredentialRoute(request) ? config.AUTH_RATE_LIMIT_MAX : config.RATE_LIMIT_MAX,
    keyGenerator: (request) => (isCredentialRoute(request) ? `auth:${request.ip}` : request.ip),
    errorResponseBuilder: () => new AppError('RATE_LIMITED'),
  });

  app.enableCors({
    origin: config.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'accept-language', CSRF_HEADER],
    exposedHeaders: ['x-request-id', 'retry-after'],
    maxAge: 600,
  });

  const fastify = app.getHttpAdapter().getInstance();

  // CSRF: las peticiones que modifican datos con sesión de cookie deben traer una
  // cabecera propia. Un sitio ajeno no puede añadirla sin pasar el preflight de
  // CORS, que solo autoriza los orígenes configurados. Bearer (móvil) no usa cookies.
  fastify.addHook('onRequest', (request, _reply, done) => {
    const exempt =
      !UNSAFE_METHODS.has(request.method) ||
      request.headers.authorization?.toLowerCase().startsWith('bearer ') === true ||
      request.headers[CSRF_HEADER] === '1';
    done(exempt ? undefined : new AppError('CSRF_REJECTED'));
  });

  fastify.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', String(request.id));
  });

  if (config.API_DOCS_ENABLED) {
    setupOpenApi(app, config);
  }

  app.enableShutdownHooks();
  await app.init();
  return app;
}
