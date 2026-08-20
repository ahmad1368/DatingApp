import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BlockingController } from './blocking.controller';
import { BlockingService } from './blocking.service';

@Module({
  imports: [AuthModule],
  controllers: [BlockingController],
  providers: [BlockingService],
})
export class BlockingModule {}
