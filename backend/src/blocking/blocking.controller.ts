import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SyncContactsDto } from './dto/sync-contacts.dto';
import { BlockingService } from './blocking.service';

@Controller('blocking')
@UseGuards(JwtAuthGuard)
export class BlockingController {
  constructor(private readonly blockingService: BlockingService) {}

  @Post('sync-contacts')
  @HttpCode(HttpStatus.OK)
  syncContacts(@CurrentUser() user: AuthenticatedUser, @Body() dto: SyncContactsDto) {
    return this.blockingService.syncContacts(user.id, dto.contacts);
  }

  @Get('blocked-contacts')
  listBlockedContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.blockingService.listBlockedContacts(user.id);
  }

  @Delete('blocked-contacts/:id')
  @HttpCode(HttpStatus.OK)
  unblockContact(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.blockingService.unblockContact(user.id, id);
  }
}
