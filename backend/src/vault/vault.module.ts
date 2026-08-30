import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { VaultController } from './vault.controller';
import { VaultService } from './vault.service';
import { VaultAlbumController } from './vault-album.controller';
import { VaultAlbumService } from './vault-album.service';

@Module({
  imports: [AuthModule],
  controllers: [VaultController, VaultAlbumController],
  providers: [VaultService, VaultAlbumService],
})
export class VaultModule {}
