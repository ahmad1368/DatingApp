import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  BOUNDARY_TAGS,
  KINK_TAGS,
  RELATIONSHIP_DESIRES,
  RELATIONSHIP_STRUCTURES,
} from './relationship-profile.constants';
import { SetRelationshipProfileDto } from './dto/set-relationship-profile.dto';
import { RelationshipProfileService } from './relationship-profile.service';

@Controller('profile/relationship')
export class RelationshipProfileController {
  constructor(private readonly relationshipProfileService: RelationshipProfileService) {}

  @Get('catalog')
  getCatalog() {
    return {
      relationshipStructures: RELATIONSHIP_STRUCTURES,
      kinkTags: KINK_TAGS,
      relationshipDesires: RELATIONSHIP_DESIRES,
      boundaryTags: BOUNDARY_TAGS,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getRelationshipProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.relationshipProfileService.getRelationshipProfile(user.id);
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  setRelationshipProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SetRelationshipProfileDto,
  ) {
    return this.relationshipProfileService.setRelationshipProfile(user.id, dto);
  }
}
