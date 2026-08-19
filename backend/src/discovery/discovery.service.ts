import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistanceKm } from '../location/utils/haversine';
import { computeFirstMessageExpiresAt } from '../messaging/messaging.constants';
import { DEFAULT_DECK_SIZE } from './discovery.constants';
import { calculateAge } from './utils/age';

export interface DeckCard {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  distanceKm: number | null;
  interests: string[];
  relationshipGoal: string | null;
}

export interface SwipeResult {
  matched: boolean;
  matchId?: string;
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async getDeck(userId: string): Promise<DeckCard[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetUserId: true },
    });

    const excludedIds = [userId, ...swiped.map((s) => s.targetUserId)];

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        onboardingCompletedAt: { not: null },
        ...this.buildLifestyleFilterWhere(currentUser),
      },
      take: DEFAULT_DECK_SIZE,
    });

    const usingPassport =
      currentUser.passportEnabled &&
      currentUser.passportLatitude != null &&
      currentUser.passportLongitude != null;
    const originLatitude = usingPassport ? currentUser.passportLatitude : currentUser.latitude;
    const originLongitude = usingPassport ? currentUser.passportLongitude : currentUser.longitude;

    const now = new Date();

    return candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      age: candidate.dateOfBirth ? calculateAge(candidate.dateOfBirth, now) : null,
      profilePhotoUrl: candidate.profilePhotoUrl,
      distanceKm:
        originLatitude != null &&
        originLongitude != null &&
        candidate.latitude != null &&
        candidate.longitude != null
          ? haversineDistanceKm(originLatitude, originLongitude, candidate.latitude, candidate.longitude)
          : null,
      interests: candidate.interests,
      relationshipGoal: candidate.relationshipGoal,
    }));
  }

  async recordSwipe(userId: string, targetUserId: string, action: string): Promise<SwipeResult> {
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot swipe on yourself.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    const existing = await this.prisma.swipe.findUnique({
      where: { swiperId_targetUserId: { swiperId: userId, targetUserId } },
    });
    if (existing) {
      throw new BadRequestException('You have already swiped on this user.');
    }

    await this.prisma.swipe.create({ data: { swiperId: userId, targetUserId, action } });

    if (action !== 'LIKE') {
      return { matched: false };
    }

    const reciprocal = await this.prisma.swipe.findUnique({
      where: { swiperId_targetUserId: { swiperId: targetUserId, targetUserId: userId } },
    });

    if (!reciprocal || reciprocal.action !== 'LIKE') {
      return { matched: false };
    }

    const [userAId, userBId] = [userId, targetUserId].sort();
    const match = await this.prisma.match.create({
      data: { userAId, userBId, firstMessageExpiresAt: computeFirstMessageExpiresAt(new Date()) },
    });

    return { matched: true, matchId: match.id };
  }

  private buildLifestyleFilterWhere(currentUser: {
    filterSmokingHabits: string[];
    filterDrinkingHabits: string[];
    filterEducationLevels: string[];
    filterReligions: string[];
    filterDietaryPreferences: string[];
    filterWantsChildren: string[];
    filterRelationshipGoals: string[];
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (currentUser.filterSmokingHabits.length > 0) {
      where.smokingHabit = { in: currentUser.filterSmokingHabits };
    }
    if (currentUser.filterDrinkingHabits.length > 0) {
      where.drinkingHabit = { in: currentUser.filterDrinkingHabits };
    }
    if (currentUser.filterEducationLevels.length > 0) {
      where.education = { in: currentUser.filterEducationLevels };
    }
    if (currentUser.filterReligions.length > 0) {
      where.religion = { in: currentUser.filterReligions };
    }
    if (currentUser.filterDietaryPreferences.length > 0) {
      where.dietaryPreference = { in: currentUser.filterDietaryPreferences };
    }
    if (currentUser.filterWantsChildren.length > 0) {
      where.wantsChildren = { in: currentUser.filterWantsChildren };
    }
    if (currentUser.filterRelationshipGoals.length > 0) {
      where.relationshipGoal = { in: currentUser.filterRelationshipGoals };
    }

    return where;
  }
}
