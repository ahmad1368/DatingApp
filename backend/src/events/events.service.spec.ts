import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const EVENT_ID = 'event-1';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    localEvent: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
    localEventRsvp: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      localEvent: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      localEventRsvp: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    service = new EventsService(prisma as unknown as PrismaService);
  });

  const dto: CreateEventDto = {
    title: 'Singles Mixer',
    location: 'Downtown Bar',
    category: 'MIXER',
    startsAt: '2026-02-01T18:00:00.000Z',
  };

  describe('createEvent', () => {
    it('rejects creation from a non-committee member', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: false });

      await expect(service.createEvent(USER_ID, dto)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.localEvent.create).not.toHaveBeenCalled();
    });

    it('creates the event for a committee member', async () => {
      prisma.user.findUnique.mockResolvedValue({ isCommitteeMember: true });
      prisma.localEvent.create.mockResolvedValue({
        id: EVENT_ID,
        title: dto.title,
        description: null,
        location: dto.location,
        latitude: null,
        longitude: null,
        category: dto.category,
        startsAt: new Date(dto.startsAt),
        priceCoins: 0,
      });

      const result = await service.createEvent(USER_ID, dto);

      expect(prisma.localEvent.create).toHaveBeenCalledWith({
        data: {
          title: dto.title,
          description: null,
          location: dto.location,
          latitude: null,
          longitude: null,
          category: dto.category,
          startsAt: new Date(dto.startsAt),
          priceCoins: 0,
          createdById: USER_ID,
        },
      });
      expect(result).toEqual({
        id: EVENT_ID,
        title: dto.title,
        description: null,
        location: dto.location,
        latitude: null,
        longitude: null,
        category: dto.category,
        startsAt: dto.startsAt,
        priceCoins: 0,
        distanceKm: null,
        rsvpCount: 0,
        isRsvped: false,
        checkedInCount: 0,
        isCheckedIn: false,
      });
    });
  });

  describe('listNearbyEvents', () => {
    it('returns rsvp state and count without distances when the user has no location', async () => {
      prisma.user.findUnique.mockResolvedValue({
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });
      prisma.localEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Singles Mixer',
          description: null,
          location: 'Downtown Bar',
          latitude: null,
          longitude: null,
          category: 'MIXER',
          startsAt: new Date('2026-02-01T18:00:00.000Z'),
          priceCoins: 5,
          rsvps: [{ userId: USER_ID }, { userId: OTHER_USER_ID }],
        },
      ]);

      const result = await service.listNearbyEvents(USER_ID);

      expect(result).toEqual([
        {
          id: EVENT_ID,
          title: 'Singles Mixer',
          description: null,
          location: 'Downtown Bar',
          latitude: null,
          longitude: null,
          category: 'MIXER',
          startsAt: '2026-02-01T18:00:00.000Z',
          priceCoins: 5,
          distanceKm: null,
          rsvpCount: 2,
          isRsvped: true,
          checkedInCount: 0,
          isCheckedIn: false,
        },
      ]);
    });

    it('sorts events nearest-first, within the metro area, when the user location is known', async () => {
      prisma.user.findUnique.mockResolvedValue({
        latitude: 40.7128,
        longitude: -74.006,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });
      prisma.localEvent.findMany.mockResolvedValue([
        {
          id: 'far-event',
          title: 'Far Meetup',
          description: null,
          location: 'Newark, NJ',
          latitude: 40.7357,
          longitude: -74.1724,
          category: 'MEETUP',
          startsAt: new Date('2026-02-01T18:00:00.000Z'),
          rsvps: [],
        },
        {
          id: 'near-event',
          title: 'Near Meetup',
          description: null,
          location: 'Nearby',
          latitude: 40.73,
          longitude: -73.99,
          category: 'MEETUP',
          startsAt: new Date('2026-02-02T18:00:00.000Z'),
          rsvps: [],
        },
      ]);

      const result = await service.listNearbyEvents(USER_ID);

      expect(result.map((event) => event.id)).toEqual(['near-event', 'far-event']);
    });

    it('excludes events outside the metro-area radius', async () => {
      prisma.user.findUnique.mockResolvedValue({
        latitude: 40.7128,
        longitude: -74.006,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });
      prisma.localEvent.findMany.mockResolvedValue([
        {
          id: 'near-event',
          title: 'Near Meetup',
          description: null,
          location: 'Nearby',
          latitude: 40.73,
          longitude: -73.99,
          category: 'MEETUP',
          startsAt: new Date('2026-02-02T18:00:00.000Z'),
          rsvps: [],
        },
        {
          id: 'other-continent-event',
          title: 'London Meetup',
          description: null,
          location: 'London',
          latitude: 51.5074,
          longitude: -0.1278,
          category: 'MEETUP',
          startsAt: new Date('2026-02-01T18:00:00.000Z'),
          rsvps: [],
        },
      ]);

      const result = await service.listNearbyEvents(USER_ID);

      expect(result.map((event) => event.id)).toEqual(['near-event']);
    });

    it('keeps events with no coordinates even when the user location is known', async () => {
      prisma.user.findUnique.mockResolvedValue({
        latitude: 40.7128,
        longitude: -74.006,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });
      prisma.localEvent.findMany.mockResolvedValue([
        {
          id: 'virtual-event',
          title: 'Virtual Mixer',
          description: null,
          location: 'Online',
          latitude: null,
          longitude: null,
          category: 'MIXER',
          startsAt: new Date('2026-02-01T18:00:00.000Z'),
          rsvps: [],
        },
      ]);

      const result = await service.listNearbyEvents(USER_ID);

      expect(result.map((event) => event.id)).toEqual(['virtual-event']);
    });
  });

  describe('rsvpToEvent', () => {
    it('throws when the event does not exist', async () => {
      prisma.localEvent.findUnique.mockResolvedValue(null);

      await expect(service.rsvpToEvent(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.localEventRsvp.create).not.toHaveBeenCalled();
    });

    it('creates a free rsvp without touching the coin balance', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({ id: EVENT_ID, priceCoins: 0 });
      prisma.localEventRsvp.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 40 });

      const result = await service.rsvpToEvent(USER_ID, EVENT_ID);

      expect(prisma.localEventRsvp.create).toHaveBeenCalledWith({
        data: { eventId: EVENT_ID, userId: USER_ID },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ rsvped: true, coinBalance: 40 });
    });

    it('rsvping twice is a no-op and never re-charges', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({ id: EVENT_ID, priceCoins: 20 });
      prisma.localEventRsvp.findUnique.mockResolvedValue({ id: 'rsvp-1', coinsSpent: 20 });
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 30 });

      const result = await service.rsvpToEvent(USER_ID, EVENT_ID);

      expect(prisma.localEventRsvp.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ rsvped: true, coinBalance: 30 });
    });

    it('deducts the access-pass price and snapshots it onto the rsvp for a paid event', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({ id: EVENT_ID, priceCoins: 20 });
      prisma.localEventRsvp.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 50 });
      prisma.user.update.mockResolvedValue({ giftTokenBalance: 30 });
      prisma.localEventRsvp.create.mockResolvedValue({ id: 'rsvp-1' });

      const result = await service.rsvpToEvent(USER_ID, EVENT_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { giftTokenBalance: { decrement: 20 } },
      });
      expect(prisma.localEventRsvp.create).toHaveBeenCalledWith({
        data: { eventId: EVENT_ID, userId: USER_ID, coinsSpent: 20 },
      });
      expect(result).toEqual({ rsvped: true, coinBalance: 30 });
    });

    it('rejects a paid rsvp when the user does not have enough coins', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({ id: EVENT_ID, priceCoins: 20 });
      prisma.localEventRsvp.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 5 });

      await expect(service.rsvpToEvent(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.localEventRsvp.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cancelRsvp', () => {
    it('rejects cancelling an rsvp that does not exist', async () => {
      prisma.localEventRsvp.findUnique.mockResolvedValue(null);

      await expect(service.cancelRsvp(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deletes a free rsvp without touching the coin balance', async () => {
      prisma.localEventRsvp.findUnique.mockResolvedValue({ id: 'rsvp-1', coinsSpent: 0 });
      prisma.user.findUnique.mockResolvedValue({ giftTokenBalance: 40 });

      const result = await service.cancelRsvp(USER_ID, EVENT_ID);

      expect(prisma.localEventRsvp.delete).toHaveBeenCalledWith({ where: { id: 'rsvp-1' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ cancelled: true, coinBalance: 40 });
    });

    it('refunds the snapshotted coin cost when cancelling a paid rsvp', async () => {
      prisma.localEventRsvp.findUnique.mockResolvedValue({ id: 'rsvp-1', coinsSpent: 20 });
      prisma.user.update.mockResolvedValue({ giftTokenBalance: 50 });

      const result = await service.cancelRsvp(USER_ID, EVENT_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { giftTokenBalance: { increment: 20 } },
      });
      expect(prisma.localEventRsvp.delete).toHaveBeenCalledWith({ where: { id: 'rsvp-1' } });
      expect(result).toEqual({ cancelled: true, coinBalance: 50 });
    });
  });

  describe('checkInToEvent', () => {
    it('throws when the event does not exist', async () => {
      prisma.localEvent.findUnique.mockResolvedValue(null);

      await expect(service.checkInToEvent(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects checking in without an rsvp', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({
        id: EVENT_ID,
        startsAt: new Date('2020-01-01T00:00:00.000Z'),
      });
      prisma.localEventRsvp.findUnique.mockResolvedValue(null);

      await expect(service.checkInToEvent(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.localEventRsvp.update).not.toHaveBeenCalled();
    });

    it('rejects checking in before the event has started', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({
        id: EVENT_ID,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      prisma.localEventRsvp.findUnique.mockResolvedValue({ id: 'rsvp-1', checkedInAt: null });

      await expect(service.checkInToEvent(USER_ID, EVENT_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.localEventRsvp.update).not.toHaveBeenCalled();
    });

    it('records the check-in once the event has started', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({
        id: EVENT_ID,
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      prisma.localEventRsvp.findUnique.mockResolvedValue({ id: 'rsvp-1', checkedInAt: null });

      const result = await service.checkInToEvent(USER_ID, EVENT_ID);

      expect(prisma.localEventRsvp.update).toHaveBeenCalledWith({
        where: { id: 'rsvp-1' },
        data: { checkedInAt: expect.any(Date) },
      });
      expect(result).toEqual({ checkedIn: true });
    });

    it('is idempotent and does not overwrite an existing check-in', async () => {
      prisma.localEvent.findUnique.mockResolvedValue({
        id: EVENT_ID,
        startsAt: new Date(Date.now() - 60 * 60 * 1000),
      });
      prisma.localEventRsvp.findUnique.mockResolvedValue({
        id: 'rsvp-1',
        checkedInAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.checkInToEvent(USER_ID, EVENT_ID);

      expect(prisma.localEventRsvp.update).not.toHaveBeenCalled();
      expect(result).toEqual({ checkedIn: true });
    });
  });
});
