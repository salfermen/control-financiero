import { Module } from '@nestjs/common';
import { FinanceContextModule } from '../finance/finance-context.module.js';
import { ExchangeRatesController } from './exchange-rates.controller.js';
import { ExchangeRatesService } from './exchange-rates.service.js';

@Module({
  imports: [FinanceContextModule],
  controllers: [ExchangeRatesController],
  providers: [ExchangeRatesService],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
