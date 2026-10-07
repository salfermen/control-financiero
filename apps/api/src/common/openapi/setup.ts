import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { AppConfig } from '../../config/env.js';

export function buildOpenApiDocument(app: INestApplication, config: AppConfig): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle('Control Financiero — API')
    .setDescription(
      [
        'API de la plataforma financiera personal.',
        '',
        '- Todas las rutas exigen sesión salvo las marcadas como públicas.',
        '- Web: cookie httpOnly. Móvil: `Authorization: Bearer <token>`.',
        '- Las peticiones POST/PUT/PATCH/DELETE con cookie deben enviar `x-csrf-protection: 1`.',
        '- Los errores siempre tienen la forma `{ error: { code, message, requestId, issues? } }`.',
        '- Los montos viajan como texto decimal (nunca números de coma flotante).',
      ].join('\n'),
    )
    .setVersion(config.APP_VERSION)
    .addCookieAuth(config.SESSION_COOKIE_NAME)
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, builder);
}

/** Publica la documentación interactiva en /api/docs (desactivada en producción por defecto). */
export function setupOpenApi(app: INestApplication, config: AppConfig): void {
  const document = buildOpenApiDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs/openapi.json',
    customSiteTitle: 'Control Financiero — API',
  });
}
