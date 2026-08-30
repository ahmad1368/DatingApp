import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistanceKm } from '../location/utils/haversine';
import { VENUE_CATEGORIES, VENUE_CATEGORY_IDS, VenueCategory } from './date-suggestions.constants';
import { computeMidpoint, Coordinates } from './utils/midpoint';

export interface VenueSuggestion extends VenueCategory {
  mapsSearchUrl: string;
  isMyPick: boolean;
  isPartnerPick: boolean;
}

export interface MeetupSuggestionsResult {
  midpoint: Coordinates;
  distanceKm: number;
  suggestions: VenueSuggestion[];
  mutualPickCategoryId: string | null;
}

export interface PickVenueCategoryResult {
  categoryId: string;
  isMutualPick: boolean;
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

    const [myPick, partnerPick] = await Promise.all([
      this.prisma.meetupSpotPick.findUnique({ where: { matchId_userId: { matchId, userId } } }),
      this.prisma.meetupSpotPick.findUnique({
        where: { matchId_userId: { matchId, userId: otherUserId } },
      }),
    ]);
    const mutualPickCategoryId =
      myPick && partnerPick && myPick.categoryId === partnerPick.categoryId ? myPick.categoryId : null;

    const suggestions = VENUE_CATEGORIES.map((category) => ({
      ...category,
      mapsSearchUrl: this.buildMapsSearchUrl(category.searchQuery, midpoint),
      isMyPick: myPick?.categoryId === category.id,
      isPartnerPick: partnerPick?.categoryId === category.id,
    })).sort((a, b) => Number(b.isMyPick || b.isPartnerPick) - Number(a.isMyPick || a.isPartnerPick));

    return { midpoint, distanceKm, suggestions, mutualPickCategoryId };
  }

  /**
   * Lets a user flag which suggested category they'd actually like to meet
   * at for this match - surfaced back to both sides in suggestMeetupSpots
   * (isMyPick/isPartnerPick, sorted to the top) so a shared pick stands out
   * as the "curated, high-rated" choice the pair converged on rather than
   * just another item in a static list. Changeable at any time.
   */
  async pickVenueCategory(
    userId: string,
    matchId: string,
    categoryId: string,
  ): Promise<PickVenueCategoryResult> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }
    if (!VENUE_CATEGORY_IDS.includes(categoryId)) {
      throw new BadRequestException('Unknown venue category.');
    }

    await this.prisma.meetupSpotPick.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: { matchId, userId, categoryId },
      update: { categoryId },
    });

    const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
    const partnerPick = await this.prisma.meetupSpotPick.findUnique({
      where: { matchId_userId: { matchId, userId: otherUserId } },
    });

    return { categoryId, isMutualPick: partnerPick?.categoryId === categoryId };
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
