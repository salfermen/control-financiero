import { Module } from '@nestjs/common';
import { CategoriesModule } from '../categories/categories.module.js';
import { FinanceContextModule } from '../finance/finance-context.module.js';
import { BudgetsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [FinanceContextModule, CategoriesModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
