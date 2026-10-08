import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type SummaryDto, summaryDtoSchema } from '@cf/shared';
import { CurrentAuth } from '../auth/decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ApiErrors, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { SummaryService } from './summary.service.js';

@ApiTags('summary')
@ApiCookieAuth()
@Controller('summary')
export class SummaryController {
  constructor(private readonly summary: SummaryService) {}

  @Get()
  @ApiOperation({
    summary:
      'Tablero: disponible, deudas y patrimonio (hoy y a fin de mes), flujo del mes, presupuestos y próximos movimientos.',
    description:
      'Todo en la moneda base. Cuentas en otra moneda se convierten con la tasa de hoy; sin tasa confiable se listan en `unconverted` y no se suman.',
  })
  @ApiZodResponse(200, summaryDtoSchema, 'Resumen financiero.')
  @ApiErrors(401)
  get(@CurrentAuth() auth: AuthContext): Promise<SummaryDto> {
    return this.summary.get(auth.userId);
  }
}
