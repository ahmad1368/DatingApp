import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PurchasePowerUpDto } from './dto/purchase-power-up.dto';
import { PowerUpsService } from './power-ups.service';

@Controller('power-ups')
@UseGuards(JwtAuthGuard)
export class PowerUpsController {
  constructor(private readonly powerUpsService: PowerUpsService) {}

  @Get('catalog')
  getCatalog() {
    return this.powerUpsService.getCatalog();
  }

  @Post('purchase')
  @HttpCode(HttpStatus.CREATED)
  purchasePowerUp(@CurrentUser() user: AuthenticatedUser, @Body() dto: PurchasePowerUpDto) {
    return this.powerUpsService.purchasePowerUp(user.id, dto.powerUpId);
  }
}
