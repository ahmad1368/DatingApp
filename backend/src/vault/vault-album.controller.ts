import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateVaultAlbumDto } from './dto/create-vault-album.dto';
import { GrantVaultAccessDto } from './dto/grant-vault-access.dto';
import { VaultAlbumService } from './vault-album.service';

@Controller('vault/albums')
@UseGuards(JwtAuthGuard)
export class VaultAlbumController {
  constructor(private readonly vaultAlbumService: VaultAlbumService) {}

  @Get()
  listMyAlbums(@CurrentUser() user: AuthenticatedUser) {
    return this.vaultAlbumService.listMyAlbums(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createAlbum(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVaultAlbumDto) {
    return this.vaultAlbumService.createAlbum(user.id, dto.name);
  }

  @Delete(':albumId')
  @HttpCode(HttpStatus.OK)
  deleteAlbum(@CurrentUser() user: AuthenticatedUser, @Param('albumId') albumId: string) {
    return this.vaultAlbumService.deleteAlbum(user.id, albumId);
  }

  @Post(':albumId/grant')
  @HttpCode(HttpStatus.OK)
  grantAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('albumId') albumId: string,
    @Body() dto: GrantVaultAccessDto,
  ) {
    return this.vaultAlbumService.grantAccess(user.id, albumId, dto.matchId);
  }

  @Post(':albumId/revoke')
  @HttpCode(HttpStatus.OK)
  revokeAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('albumId') albumId: string,
    @Body() dto: GrantVaultAccessDto,
  ) {
    return this.vaultAlbumService.revokeAccess(user.id, albumId, dto.matchId);
  }

  @Get('matches/:matchId')
  listGrantedAlbums(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.vaultAlbumService.listGrantedAlbums(user.id, matchId);
  }
}
