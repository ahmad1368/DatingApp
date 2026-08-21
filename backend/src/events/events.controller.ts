import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser, JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEventDto } from './dto/create-event.dto';
import { EVENT_CATEGORIES } from './events.constants';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('categories')
  listCategories() {
    return EVENT_CATEGORIES;
  }

  @Get()
  listNearbyEvents(@CurrentUser() user: AuthenticatedUser) {
    return this.eventsService.listNearbyEvents(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createEvent(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto) {
    return this.eventsService.createEvent(user.id, dto);
  }

  @Post(':eventId/rsvp')
  @HttpCode(HttpStatus.OK)
  rsvpToEvent(@CurrentUser() user: AuthenticatedUser, @Param('eventId') eventId: string) {
    return this.eventsService.rsvpToEvent(user.id, eventId);
  }

  @Post(':eventId/cancel-rsvp')
  @HttpCode(HttpStatus.OK)
  cancelRsvp(@CurrentUser() user: AuthenticatedUser, @Param('eventId') eventId: string) {
    return this.eventsService.cancelRsvp(user.id, eventId);
  }
}
