import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppleLoginDto } from './dto/apple-login.dto';

@Controller('auth/apple')
export class AppleAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AppleLoginDto) {
    return this.authService.loginWithApple(dto.identityToken, dto.fullName);
  }
}
