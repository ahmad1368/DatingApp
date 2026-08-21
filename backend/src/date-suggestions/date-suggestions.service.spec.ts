import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DateSuggestionsService } from './date-suggestions.service';

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const MATCH_ID = 'match-1';

describe('DateSuggestionsService', () => {
  let service: DateSuggestionsService;
  let prisma: { match: { findUnique: jest.Mock }; user: { findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    service = new DateSuggestionsService(prisma as unknown as PrismaService);
  });

  it('throws when the match does not exist', async () => {
    prisma.match.findUnique.mockResolvedValue(null);

    await expect(service.suggestMeetupSpots(USER_ID, MATCH_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws when the user is not part of the match', async () => {
    prisma.match.findUnique.mockResolvedValue({ userAId: 'someone', userBId: 'else' });

    await expect(service.suggestMeetupSpots(USER_ID, MATCH_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects when one side has no location available', async () => {
    prisma.match.findUnique.mockResolvedValue({ userAId: USER_ID, userBId: OTHER_USER_ID });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        latitude: 40.7128,
        longitude: -74.006,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      })
      .mockResolvedValueOnce({
        latitude: null,
        longitude: null,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });

    await expect(service.suggestMeetupSpots(USER_ID, MATCH_ID)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('computes the midpoint and returns venue category suggestions', async () => {
    prisma.match.findUnique.mockResolvedValue({ userAId: USER_ID, userBId: OTHER_USER_ID });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        latitude: 40.0,
        longitude: -74.0,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      })
      .mockResolvedValueOnce({
        latitude: 42.0,
        longitude: -72.0,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });

    const result = await service.suggestMeetupSpots(USER_ID, MATCH_ID);

    expect(result.midpoint).toEqual({ latitude: 41.0, longitude: -73.0 });
    expect(result.distanceKm).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        label: expect.any(String),
        searchQuery: expect.any(String),
        description: expect.any(String),
        mapsSearchUrl: expect.stringContaining('https://www.google.com/maps/search/'),
      }),
    );
    expect(result.suggestions[0].mapsSearchUrl).toContain('@41,-73,15z');
  });

  it('uses passport coordinates instead of real ones when passport mode is enabled', async () => {
    prisma.match.findUnique.mockResolvedValue({ userAId: USER_ID, userBId: OTHER_USER_ID });
    prisma.user.findUnique
      .mockResolvedValueOnce({
        latitude: 0,
        longitude: 0,
        passportEnabled: true,
        passportLatitude: 48.8566,
        passportLongitude: 2.3522,
      })
      .mockResolvedValueOnce({
        latitude: 48.8566,
        longitude: 2.3522,
        passportEnabled: false,
        passportLatitude: null,
        passportLongitude: null,
      });

    const result = await service.suggestMeetupSpots(USER_ID, MATCH_ID);

    expect(result.midpoint.latitude).toBeCloseTo(48.8566, 4);
    expect(result.midpoint.longitude).toBeCloseTo(2.3522, 4);
  });
});
