import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddProfilePhotoDto } from './dto/add-profile-photo.dto';
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
}
