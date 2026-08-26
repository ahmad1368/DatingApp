import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetCompatibilityWeightsDto } from './dto/set-compatibility-weights.dto';
import { SubmitPersonalityTestDto } from './dto/submit-personality-test.dto';
import { PersonalityTestService } from './personality-test.service';

@Controller('personality-test')
export class PersonalityTestController {
  constructor(private readonly personalityTestService: PersonalityTestService) {}

  @Get('items')
  getItems() {
    return this.personalityTestService.getItems();
  }

  @Post('responses')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  submitTest(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitPersonalityTestDto) {
    return this.personalityTestService.submitTest(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.personalityTestService.getMyProfile(user.id);
  }

  @Get('weights')
  @UseGuards(JwtAuthGuard)
  getCategoryWeights(@CurrentUser() user: AuthenticatedUser) {
    return this.personalityTestService.getCategoryWeights(user.id);
  }

  @Post('weights')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setCategoryWeights(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetCompatibilityWeightsDto) {
    return this.personalityTestService.setCategoryWeights(user.id, dto.weights);
  }

  @Get('compatibility/:otherUserId')
  @UseGuards(JwtAuthGuard)
  getCompatibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('otherUserId') otherUserId: string,
  ) {
    return this.personalityTestService.getCompatibility(user.id, otherUserId);
  }

  @Get('compatibility/:otherUserId/breakdown')
  @UseGuards(JwtAuthGuard)
  getCompatibilityBreakdown(
    @CurrentUser() user: AuthenticatedUser,
    @Param('otherUserId') otherUserId: string,
  ) {
    return this.personalityTestService.getCompatibilityBreakdown(user.id, otherUserId);
  }
}
