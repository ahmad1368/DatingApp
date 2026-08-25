import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EMAIL_PROVIDER } from './interfaces/email-provider.interface';
import { ConsoleEmailProvider } from './providers/console-email.provider';
import { WorkVerificationController } from './work-verification.controller';
import { WorkVerificationService } from './work-verification.service';

@Module({
  imports: [AuthModule],
  controllers: [WorkVerificationController],
  providers: [
    WorkVerificationService,
    {
      provide: EMAIL_PROVIDER,
      useClass: ConsoleEmailProvider,
    },
  ],
})
export class WorkVerificationModule {}
