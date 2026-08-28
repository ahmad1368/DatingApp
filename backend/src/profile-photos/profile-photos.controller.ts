import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddProfilePhotoDto } from './dto/add-profile-photo.dto';
import { SetBlurUntilMatchDto } from './dto/set-blur-until-match.dto';
import { SetPhotoCaptionDto } from './dto/set-photo-caption.dto';
import { ProfilePhotosService } from './profile-photos.service';

@Controller('profile-photos')
@UseGuards(JwtAuthGuard)
export class ProfilePhotosController {
  constructor(private readonly profilePhotosService: ProfilePhotosService) {}

  @Get()
  listMyPhotos(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePhotosService.listMyPhotos(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  addPhoto(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddProfilePhotoDto) {
    return this.profilePhotosService.addPhoto(user.id, dto.mediaUrl);
  }

  @Delete(':photoId')
  @HttpCode(HttpStatus.OK)
  deletePhoto(@CurrentUser() user: AuthenticatedUser, @Param('photoId') photoId: string) {
    return this.profilePhotosService.deletePhoto(user.id, photoId);
  }

  @Put(':photoId/caption')
  @HttpCode(HttpStatus.OK)
  setPhotoCaption(
    @CurrentUser() user: AuthenticatedUser,
    @Param('photoId') photoId: string,
    @Body() dto: SetPhotoCaptionDto,
  ) {
    return this.profilePhotosService.setPhotoCaption(user.id, photoId, dto.caption ?? null);
  }

  @Post('reorder-by-quality')
  @HttpCode(HttpStatus.OK)
  reorderByQuality(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePhotosService.reorderByQuality(user.id);
  }

  @Get('curation-suggestions')
  getCurationSuggestions(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePhotosService.getCurationSuggestions(user.id);
  }

  @Get('blur-until-match')
  getBlurUntilMatch(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePhotosService.getBlurUntilMatch(user.id);
  }

  @Put('blur-until-match')
  @HttpCode(HttpStatus.OK)
  setBlurUntilMatch(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetBlurUntilMatchDto) {
    return this.profilePhotosService.setBlurUntilMatch(user.id, dto.enabled);
  }
}
