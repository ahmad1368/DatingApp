import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScreenSecurityController } from './screen-security.controller';
import { ScreenSecurityService } from './screen-security.service';

@Module({
  imports: [AuthModule],
  controllers: [ScreenSecurityController],
  providers: [ScreenSecurityService],
})
export class ScreenSecurityModule {}
