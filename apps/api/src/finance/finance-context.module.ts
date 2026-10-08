import { Module } from '@nestjs/common';
import { FinanceContextService } from './finance-context.service.js';

@Module({
  providers: [FinanceContextService],
  exports: [FinanceContextService],
})
export class FinanceContextModule {}
