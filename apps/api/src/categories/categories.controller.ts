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
  type CategoryDto,
  categoryDtoSchema,
  createCategoryRequestSchema,
  deleteCategoryQuerySchema,
  listOf,
  updateCategoryRequestSchema,
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
import { CategoriesService } from './categories.service.js';

@ApiTags('categories')
@ApiCookieAuth()
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly categories: CategoriesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Categorías del sistema y del usuario, traducidas a su idioma.' })
  @ApiZodResponse(200, listOf(categoryDtoSchema), 'Categorías disponibles.')
  @ApiErrors(401)
  async list(@CurrentAuth() auth: AuthContext): Promise<{ data: CategoryDto[] }> {
    return { data: await this.categories.list(auth.userId) };
  }

  @Post()
  @ApiOperation({
    summary: 'Crea una categoría personalizada (o subcategoría de una principal).',
    description: 'Dos niveles como máximo. El nombre no puede repetir otro del mismo tipo.',
  })
  @ApiZodBody(createCategoryRequestSchema)
  @ApiZodResponse(201, categoryDtoSchema, 'Categoría creada.')
  @ApiErrors(400, 401, 403, 409)
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(createCategoryRequestSchema))
    body: z.output<typeof createCategoryRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<CategoryDto> {
    return this.categories.create(
      auth.userId,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Renombra o reubica una categoría propia.',
    description: 'Las categorías del sistema no se modifican (FORBIDDEN). El tipo no cambia.',
  })
  @ApiZodBody(updateCategoryRequestSchema)
  @ApiZodResponse(200, categoryDtoSchema, 'Categoría actualizada.')
  @ApiErrors(400, 401, 403, 404, 409, 422)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Body(new ZodPipe(updateCategoryRequestSchema))
    body: z.output<typeof updateCategoryRequestSchema>,
    @Req() request: FastifyRequest,
  ): Promise<CategoryDto> {
    return this.categories.update(
      auth.userId,
      id,
      body,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Elimina una categoría propia.',
    description:
      'Si tiene movimientos, `moveTo` indica a qué categoría del mismo tipo moverlos. Con subcategorías o presupuestos vigentes responde CATEGORY_IN_USE.',
  })
  @ApiQuery({ name: 'moveTo', required: false })
  @ApiErrors(400, 401, 403, 404, 409)
  async remove(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new UuidParamPipe()) id: string,
    @Query(new ZodPipe(deleteCategoryQuerySchema))
    query: z.output<typeof deleteCategoryQuerySchema>,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    await this.categories.remove(
      auth.userId,
      id,
      query.moveTo,
      requestContext(request, this.config.IP_HASH_SECRET),
    );
  }
}
