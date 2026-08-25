import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JoinCommunityGroupDto } from './dto/join-community-group.dto';
import { CommunityGroupsService } from './community-groups.service';

@Controller('community-groups')
export class CommunityGroupsController {
  constructor(private readonly communityGroupsService: CommunityGroupsService) {}

  @Get()
  getGroups() {
    return this.communityGroupsService.getGroups();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMyGroups(@CurrentUser() user: AuthenticatedUser) {
    return this.communityGroupsService.getMyGroups(user.id);
  }

  @Post('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  joinGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinCommunityGroupDto) {
    return this.communityGroupsService.joinGroup(user.id, dto.groupId);
  }

  @Delete('me/:groupId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  leaveGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.communityGroupsService.leaveGroup(user.id, groupId);
  }

  @Get(':groupId/members')
  @UseGuards(JwtAuthGuard)
  getGroupMembers(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.communityGroupsService.getGroupMembers(user.id, groupId);
  }
}
