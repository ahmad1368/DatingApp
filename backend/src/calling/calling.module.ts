import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CallingController } from './calling.controller';
import { CallingService } from './calling.service';

@Module({
  imports: [AuthModule],
  controllers: [CallingController],
  providers: [CallingService],
})
export class CallingModule {}
