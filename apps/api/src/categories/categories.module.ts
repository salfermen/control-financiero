import { Module } from '@nestjs/common';
import { FinanceContextModule } from '../finance/finance-context.module.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';

@Module({
  imports: [FinanceContextModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
