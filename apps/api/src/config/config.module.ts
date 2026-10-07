import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './env.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: Object.freeze({ ...config }) }],
      exports: [APP_CONFIG],
    };
  }
}
