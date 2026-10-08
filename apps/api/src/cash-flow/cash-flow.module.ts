import { Module } from '@nestjs/common';
import { FinanceContextModule } from '../finance/finance-context.module.js';
import { CashFlowController } from './cash-flow.controller.js';
import { CashFlowService } from './cash-flow.service.js';

@Module({
  imports: [FinanceContextModule],
  controllers: [CashFlowController],
  providers: [CashFlowService],
})
export class CashFlowModule {}
