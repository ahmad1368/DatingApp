import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfilePhotosController } from './profile-photos.controller';
import { ProfilePhotosService } from './profile-photos.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfilePhotosController],
  providers: [ProfilePhotosService],
})
export class ProfilePhotosModule {}
