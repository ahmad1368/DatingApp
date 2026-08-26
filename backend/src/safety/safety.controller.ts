import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportUserDto } from './dto/report-user.dto';
import { CreateCheckInDto } from './dto/create-check-in.dto';
import { AddEmergencyContactDto } from './dto/add-emergency-contact.dto';
import { TriggerSosDto } from './dto/trigger-sos.dto';
import { SafetyService } from './safety.service';

@Controller('safety')
@UseGuards(JwtAuthGuard)
export class SafetyController {
  constructor(private readonly safetyService: SafetyService) {}

  @Get('resources')
  getResources() {
    return this.safetyService.getResources();
  }

  @Post('reports')
  @HttpCode(HttpStatus.CREATED)
  reportUser(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReportUserDto) {
    return this.safetyService.reportUser(user.id, dto.reportedUserId, dto.reason, dto.details);
  }

  @Post('check-ins')
  @HttpCode(HttpStatus.CREATED)
  createCheckIn(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCheckInDto) {
    return this.safetyService.createCheckIn(user.id, dto);
  }

  @Get('check-ins')
  listCheckIns(@CurrentUser() user: AuthenticatedUser) {
    return this.safetyService.listCheckIns(user.id);
  }

  @Put('check-ins/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmCheckIn(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.safetyService.confirmCheckIn(user.id, id);
  }

  @Get('emergency-contacts')
  listEmergencyContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.safetyService.listEmergencyContacts(user.id);
  }

  @Post('emergency-contacts')
  @HttpCode(HttpStatus.CREATED)
  addEmergencyContact(@CurrentUser() user: AuthenticatedUser, @Body() dto: AddEmergencyContactDto) {
    return this.safetyService.addEmergencyContact(user.id, dto.name, dto.phone);
  }

  @Delete('emergency-contacts/:id')
  @HttpCode(HttpStatus.OK)
  deleteEmergencyContact(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.safetyService.deleteEmergencyContact(user.id, id);
  }

  @Post('sos')
  @HttpCode(HttpStatus.CREATED)
  triggerSos(@CurrentUser() user: AuthenticatedUser, @Body() dto: TriggerSosDto) {
    return this.safetyService.triggerSos(
      user.id,
      dto.latitude,
      dto.longitude,
      dto.matchId,
      dto.contactIds,
    );
  }
}
