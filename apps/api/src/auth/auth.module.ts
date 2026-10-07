import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    // Guard global: toda ruta exige sesión salvo las marcadas con @Public().
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionService],
})
export class AuthModule {}
