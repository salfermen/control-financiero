import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type CurrencyDto, currencyDtoSchema, listOf } from '@cf/shared';
import { Public } from '../auth/decorators.js';
import { ApiZodResponse } from '../common/openapi/zod-openapi.js';
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
}
