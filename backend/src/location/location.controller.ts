import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateSearchRadiusDto } from './dto/update-search-radius.dto';
import { SetAutoExpandRadiusDto } from './dto/set-auto-expand-radius.dto';
import { SetPassportLocationDto } from './dto/set-passport-location.dto';
import { LocationService } from './location.service';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  updateLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateLocationDto) {
    return this.locationService.updateLocation(user.id, dto.latitude, dto.longitude);
  }

  @Put('radius')
  @HttpCode(HttpStatus.OK)
  updateSearchRadius(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSearchRadiusDto) {
    return this.locationService.updateSearchRadius(user.id, dto.radiusKm);
  }

  @Get('radius')
  getRadiusSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.getRadiusSettings(user.id);
  }

  @Put('radius/auto-expand')
  @HttpCode(HttpStatus.OK)
  setAutoExpandRadius(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetAutoExpandRadiusDto) {
    return this.locationService.setAutoExpandRadius(user.id, dto.enabled);
  }

  @Get('nearby')
  findNearby(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.findNearbyUsers(user.id);
  }

  @Get('crossed-paths')
  getCrossedPaths(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.getCrossedPaths(user.id);
  }

  @Put('passport')
  @HttpCode(HttpStatus.OK)
  setPassportLocation(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetPassportLocationDto) {
    return this.locationService.setPassportLocation(user.id, dto.latitude, dto.longitude);
  }

  @Delete('passport')
  @HttpCode(HttpStatus.OK)
  clearPassportLocation(@CurrentUser() user: AuthenticatedUser) {
    return this.locationService.clearPassportLocation(user.id);
  }
}
