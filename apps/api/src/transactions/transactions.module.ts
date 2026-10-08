import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { FinanceContextModule } from '../finance/finance-context.module.js';
import { ExchangeRatesModule } from '../fx/exchange-rates.module.js';
import { TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [FinanceContextModule, AccountsModule, ExchangeRatesModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
