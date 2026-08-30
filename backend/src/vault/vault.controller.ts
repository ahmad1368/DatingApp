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
import { AddVaultPhotoDto } from './dto/add-vault-photo.dto';
import { GrantVaultAccessDto } from './dto/grant-vault-access.dto';
import { VaultService } from './vault.service';

@Controller('vault')
@UseGuards(JwtAuthGuard)
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Get('photos')
  listMyPhotos(@CurrentUser() user: AuthenticatedUser) {
    return this.vaultService.listMyPhotos(user.id);
  }

  @Post('photos')
  @HttpCode(HttpStatus.CREATED)
  addPhoto(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddVaultPhotoDto) {
    return this.vaultService.addPhoto(user.id, dto.mediaUrl, dto.albumId);
  }

  @Delete('photos/:photoId')
  @HttpCode(HttpStatus.OK)
  deletePhoto(@CurrentUser() user: AuthenticatedUser, @Param('photoId') photoId: string) {
    return this.vaultService.deletePhoto(user.id, photoId);
  }

  @Post('photos/:photoId/grant')
  @HttpCode(HttpStatus.OK)
  grantAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
    @Body() dto: GrantVaultAccessDto,
  ) {
    return this.vaultService.grantAccess(user.id, photoId, dto.matchId);
  }

  @Post('photos/:photoId/revoke')
  @HttpCode(HttpStatus.OK)
  revokeAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
    @Body() dto: GrantVaultAccessDto,
  ) {
    return this.vaultService.revokeAccess(user.id, photoId, dto.matchId);
  }

  @Get('matches/:matchId')
  listGrantedPhotos(@CurrentUser() user: AuthenticatedUser, @Param('matchId') matchId: string) {
    return this.vaultService.listGrantedPhotos(user.id, matchId);
  }
}
