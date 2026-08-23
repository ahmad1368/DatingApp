import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscribeDto } from './dto/subscribe.dto';
import { GiftSubscriptionDto } from './dto/gift-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('catalog')
  getCatalog() {
    return this.subscriptionsService.getCatalog();
  }

  @Get('status')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getStatus(user.id);
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  subscribe(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubscribeDto) {
    return this.subscriptionsService.subscribe(user.id, dto.tier);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.cancel(user.id);
  }

  @Post('gift')
  @HttpCode(HttpStatus.OK)
  giftSubscription(@CurrentUser() user: AuthenticatedUser, @Body() dto: GiftSubscriptionDto) {
    return this.subscriptionsService.giftSubscription(user.id, dto.recipientId, dto.tier);
  }

  @Get('gifts/received')
  listReceivedGifts(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.listReceivedSubscriptionGifts(user.id);
  }
}
