import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module.js';
import { FinanceContextModule } from '../finance/finance-context.module.js';
import { ExchangeRatesModule } from '../fx/exchange-rates.module.js';
import { SummaryController } from './summary.controller.js';
import { SummaryService } from './summary.service.js';

@Module({
  imports: [FinanceContextModule, ExchangeRatesModule, BudgetsModule],
  controllers: [SummaryController],
  providers: [SummaryService],
})
export class SummaryModule {}
