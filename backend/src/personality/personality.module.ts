import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PersonalityTestController } from './personality-test.controller';
import { PersonalityTestService } from './personality-test.service';

@Module({
  imports: [AuthModule],
  controllers: [PersonalityTestController],
  providers: [PersonalityTestService],
})
export class PersonalityModule {}
