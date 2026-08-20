import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SendGiftDto } from './dto/send-gift.dto';
import { GiftingService } from './gifting.service';

@Controller('gifting')
@UseGuards(JwtAuthGuard)
export class GiftingController {
  constructor(private readonly giftingService: GiftingService) {}

  @Get('catalog')
  getCatalog() {
    return this.giftingService.getCatalog();
  }

  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.giftingService.getBalance(user.id);
  }

  @Post('send')
  @HttpCode(HttpStatus.CREATED)
  sendGift(@CurrentUser() user: AuthenticatedUser, @Body() dto: SendGiftDto) {
    return this.giftingService.sendGift(user.id, dto.recipientId, dto.giftId, dto.message);
  }

  @Get('received')
  listReceivedGifts(@CurrentUser() user: AuthenticatedUser) {
    return this.giftingService.listReceivedGifts(user.id);
  }

  @Get('sent')
  listSentGifts(@CurrentUser() user: AuthenticatedUser) {
    return this.giftingService.listSentGifts(user.id);
  }
}
