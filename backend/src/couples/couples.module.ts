import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CouplePairingController } from './couple-pairing.controller';
import { CouplePairingService } from './couple-pairing.service';

@Module({
  imports: [AuthModule],
  controllers: [CouplePairingController],
  providers: [CouplePairingService],
})
export class CouplesModule {}
