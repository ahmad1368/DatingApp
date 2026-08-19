import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GENDER_IDENTITIES, SEXUAL_ORIENTATIONS } from './gender-identity.constants';
import { SetGenderIdentityDto } from './dto/set-gender-identity.dto';
import { GenderIdentityService } from './gender-identity.service';

@Controller('profile/gender-identity')
export class GenderIdentityController {
  constructor(private readonly genderIdentityService: GenderIdentityService) {}

  @Get('catalog')
  getCatalog() {
    return { genderIdentities: GENDER_IDENTITIES, orientations: SEXUAL_ORIENTATIONS };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getGenderIdentity(@CurrentUser() user: AuthenticatedUser) {
    return this.genderIdentityService.getGenderIdentity(user.id);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setGenderIdentity(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetGenderIdentityDto) {
    return this.genderIdentityService.setGenderIdentity(user.id, dto);
  }
}
