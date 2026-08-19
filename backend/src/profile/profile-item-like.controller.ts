import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LikeProfileItemDto } from './dto/like-profile-item.dto';
import { ProfileItemLikeService } from './profile-item-like.service';

@Controller('profile/item-likes')
@UseGuards(JwtAuthGuard)
export class ProfileItemLikeController {
  constructor(private readonly profileItemLikeService: ProfileItemLikeService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  likeItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: LikeProfileItemDto) {
    return this.profileItemLikeService.likeItem(user.id, dto);
  }

  @Get('received')
  listReceived(@CurrentUser() user: AuthenticatedUser) {
    return this.profileItemLikeService.listReceived(user.id);
  }
}
