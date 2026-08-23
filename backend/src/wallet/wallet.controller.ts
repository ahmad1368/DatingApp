import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PurchaseCoinsDto } from './dto/purchase-coins.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('catalog')
  getCatalog() {
    return this.walletService.getCatalog();
  }

  @Get('balance')
  getBalance(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.getBalance(user.id);
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  purchaseCoins(@CurrentUser() user: AuthenticatedUser, @Body() dto: PurchaseCoinsDto) {
    return this.walletService.purchaseCoins(user.id, dto.packageId);
  }

  @Get('purchases')
  listPurchases(@CurrentUser() user: AuthenticatedUser) {
    return this.walletService.listPurchases(user.id);
  }
}
