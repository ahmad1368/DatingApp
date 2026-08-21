import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistanceKm } from '../location/utils/haversine';
import { VENUE_CATEGORIES, VenueCategory } from './date-suggestions.constants';
import { computeMidpoint, Coordinates } from './utils/midpoint';

export interface VenueSuggestion extends VenueCategory {
  mapsSearchUrl: string;
}

export interface MeetupSuggestionsResult {
  midpoint: Coordinates;
  distanceKm: number;
  suggestions: VenueSuggestion[];
}

interface LocatableUser {
  latitude: number | null;
  longitude: number | null;
  passportEnabled: boolean;
  passportLatitude: number | null;
  passportLongitude: number | null;
}

@Injectable()
export class DateSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestMeetupSpots(userId: string, matchId: string): Promise<MeetupSuggestionsResult> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }

    const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
    const [currentUser, otherUser] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.user.findUnique({ where: { id: otherUserId } }),
    ]);
    if (!currentUser || !otherUser) {
      throw new NotFoundException('User not found.');
    }

    const currentCoords = this.effectiveCoordinates(currentUser);
    const otherCoords = this.effectiveCoordinates(otherUser);
    if (!currentCoords || !otherCoords) {
      throw new BadRequestException('Location is not available for one or both users.');
    }

    const midpoint = computeMidpoint(currentCoords, otherCoords);
    const distanceKm = haversineDistanceKm(
      currentCoords.latitude,
      currentCoords.longitude,
      otherCoords.latitude,
      otherCoords.longitude,
    );

    return {
      midpoint,
      distanceKm,
      suggestions: VENUE_CATEGORIES.map((category) => ({
        ...category,
        mapsSearchUrl: this.buildMapsSearchUrl(category.searchQuery, midpoint),
      })),
    };
  }

  private effectiveCoordinates(user: LocatableUser): Coordinates | null {
    const latitude = user.passportEnabled ? user.passportLatitude : user.latitude;
    const longitude = user.passportEnabled ? user.passportLongitude : user.longitude;
    if (latitude == null || longitude == null) {
      return null;
    }
    return { latitude, longitude };
  }

  private buildMapsSearchUrl(query: string, center: Coordinates): string {
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${center.latitude},${center.longitude},15z`;
  }
}
