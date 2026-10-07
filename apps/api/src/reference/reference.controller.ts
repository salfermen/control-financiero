import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type CategoryDto,
  type CurrencyDto,
  categoryDtoSchema,
  currencyDtoSchema,
  listOf,
} from '@cf/shared';
import { CurrentAuth, Public } from '../auth/decorators.js';
import type { AuthContext } from '../auth/session.service.js';
import { ApiErrors, ApiZodResponse } from '../common/openapi/zod-openapi.js';
import { ReferenceService } from './reference.service.js';

@ApiTags('reference')
@Controller()
export class ReferenceController {
  constructor(private readonly reference: ReferenceService) {}

  @Public()
  @Get('currencies')
  @ApiOperation({ summary: 'Monedas soportadas (ISO 4217) y sus decimales.' })
  @ApiZodResponse(200, listOf(currencyDtoSchema), 'Monedas activas.')
  async currencies(): Promise<{ data: CurrencyDto[] }> {
    return { data: await this.reference.listCurrencies() };
  }

  @Get('categories')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Categorías del sistema y del usuario, traducidas a su idioma.' })
  @ApiZodResponse(200, listOf(categoryDtoSchema), 'Categorías disponibles.')
  @ApiErrors(401)
  async categories(@CurrentAuth() auth: AuthContext): Promise<{ data: CategoryDto[] }> {
    return { data: await this.reference.listCategories(auth.userId) };
  }
}
