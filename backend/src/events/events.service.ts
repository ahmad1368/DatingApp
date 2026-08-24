import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistanceKm } from '../location/utils/haversine';
import { CreateEventDto } from './dto/create-event.dto';
import { LOCAL_EVENTS_RADIUS_KM } from './events.constants';

export interface LocalEventView {
  id: string;
  title: string;
  description: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  category: string;
  startsAt: string;
  distanceKm: number | null;
  rsvpCount: number;
  isRsvped: boolean;
  checkedInCount: number;
  isCheckedIn: boolean;
}

interface LocatableUser {
  latitude: number | null;
  longitude: number | null;
  passportEnabled: boolean;
  passportLatitude: number | null;
  passportLongitude: number | null;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** App-sponsored events are curated content; only committee members may create them. */
  async createEvent(userId: string, dto: CreateEventDto): Promise<LocalEventView> {
    await this.requireCommitteeMember(userId);

    const event = await this.prisma.localEvent.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        location: dto.location,
        latitude: dto.latitude ?? null,
        longitude: dto.longitude ?? null,
        category: dto.category,
        startsAt: new Date(dto.startsAt),
        createdById: userId,
      },
    });

    return this.toView(event, {
      rsvpCount: 0,
      isRsvped: false,
      distanceKm: null,
      checkedInCount: 0,
      isCheckedIn: false,
    });
  }

  /**
   * A local board scoped to the viewer's metropolitan area: upcoming
   * events farther than LOCAL_EVENTS_RADIUS_KM are dropped (events with no
   * coordinates are kept regardless, since they can't be geo-filtered),
   * nearest-first when the user's location is known.
   */
  async listNearbyEvents(userId: string): Promise<LocalEventView[]> {
    const [user, events] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.localEvent.findMany({
        where: { startsAt: { gte: new Date() } },
        include: { rsvps: true },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const userCoords = user ? this.effectiveCoordinates(user) : null;

    const views = events.map((event) => {
      const distanceKm =
        userCoords && event.latitude != null && event.longitude != null
          ? haversineDistanceKm(userCoords.latitude, userCoords.longitude, event.latitude, event.longitude)
          : null;

      const myRsvp = event.rsvps.find((rsvp) => rsvp.userId === userId);

      return this.toView(event, {
        rsvpCount: event.rsvps.length,
        isRsvped: myRsvp != null,
        distanceKm,
        checkedInCount: event.rsvps.filter((rsvp) => rsvp.checkedInAt != null).length,
        isCheckedIn: myRsvp?.checkedInAt != null,
      });
    });

    if (!userCoords) {
      return views;
    }

    const localViews = views.filter(
      (view) => view.distanceKm == null || view.distanceKm <= LOCAL_EVENTS_RADIUS_KM,
    );

    return localViews.sort((a, b) => {
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  }

  /** Idempotent: RSVPing twice to the same event is a no-op. */
  async rsvpToEvent(userId: string, eventId: string): Promise<{ rsvped: boolean }> {
    await this.getEvent(eventId);

    await this.prisma.localEventRsvp.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: { eventId, userId },
      update: {},
    });

    return { rsvped: true };
  }

  async cancelRsvp(userId: string, eventId: string): Promise<{ cancelled: boolean }> {
    const rsvp = await this.prisma.localEventRsvp.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!rsvp) {
      throw new BadRequestException('You have not RSVPed to this event.');
    }

    await this.prisma.localEventRsvp.delete({ where: { id: rsvp.id } });
    return { cancelled: true };
  }

  /**
   * Confirms physical attendance at an event the user already RSVPed to.
   * Only allowed once the event has actually started, and idempotent - a
   * second check-in doesn't move the original checkedInAt time.
   */
  async checkInToEvent(userId: string, eventId: string): Promise<{ checkedIn: boolean }> {
    const event = await this.getEvent(eventId);

    const rsvp = await this.prisma.localEventRsvp.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    if (!rsvp) {
      throw new BadRequestException('You must RSVP before checking in.');
    }
    if (rsvp.checkedInAt != null) {
      return { checkedIn: true };
    }
    if (event.startsAt.getTime() > Date.now()) {
      throw new BadRequestException('You can only check in once the event has started.');
    }

    await this.prisma.localEventRsvp.update({
      where: { id: rsvp.id },
      data: { checkedInAt: new Date() },
    });

    return { checkedIn: true };
  }

  private async getEvent(eventId: string) {
    const event = await this.prisma.localEvent.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found.');
    }
    return event;
  }

  private async requireCommitteeMember(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isCommitteeMember: true },
    });
    if (!user?.isCommitteeMember) {
      throw new ForbiddenException('Only committee members can create events.');
    }
  }

  private effectiveCoordinates(user: LocatableUser): { latitude: number; longitude: number } | null {
    const latitude = user.passportEnabled ? user.passportLatitude : user.latitude;
    const longitude = user.passportEnabled ? user.passportLongitude : user.longitude;
    if (latitude == null || longitude == null) {
      return null;
    }
    return { latitude, longitude };
  }

  private toView(
    event: {
      id: string;
      title: string;
      description: string | null;
      location: string;
      latitude: number | null;
      longitude: number | null;
      category: string;
      startsAt: Date;
    },
    extra: {
      rsvpCount: number;
      isRsvped: boolean;
      distanceKm: number | null;
      checkedInCount: number;
      isCheckedIn: boolean;
    },
  ): LocalEventView {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      latitude: event.latitude,
      longitude: event.longitude,
      category: event.category,
      startsAt: event.startsAt.toISOString(),
      distanceKm: extra.distanceKm,
      rsvpCount: extra.rsvpCount,
      isRsvped: extra.isRsvped,
      checkedInCount: extra.checkedInCount,
      isCheckedIn: extra.isCheckedIn,
    };
  }
}
