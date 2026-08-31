import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SetProfilePollDto } from './dto/set-profile-poll.dto';
import { VoteProfilePollDto } from './dto/vote-profile-poll.dto';
import { ProfilePollService } from './profile-poll.service';

@Controller('profile/poll')
@UseGuards(JwtAuthGuard)
export class ProfilePollController {
  constructor(private readonly profilePollService: ProfilePollService) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  setPoll(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetProfilePollDto) {
    return this.profilePollService.setPoll(user.id, dto.question, dto.options);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clearPoll(@CurrentUser() user: AuthenticatedUser) {
    return this.profilePollService.clearPoll(user.id);
  }

  @Get(':targetUserId')
  getPoll(@CurrentUser() user: AuthenticatedUser, @Param('targetUserId') targetUserId: string) {
    return this.profilePollService.getPoll(user.id, targetUserId);
  }

  @Post('vote')
  @HttpCode(HttpStatus.OK)
  vote(@CurrentUser() user: AuthenticatedUser, @Body() dto: VoteProfilePollDto) {
    return this.profilePollService.vote(user.id, dto.targetUserId, dto.optionIndex);
  }
}
