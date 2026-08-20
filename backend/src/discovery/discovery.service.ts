import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { haversineDistanceKm } from '../location/utils/haversine';
import { computeFirstMessageExpiresAt } from '../messaging/messaging.constants';
import {
  computeBoostExpiresAt,
  DAILY_SUPER_LIKE_LIMIT,
  DEFAULT_DECK_SIZE,
  LIKE_ACTIONS,
  startOfUtcDay,
} from './discovery.constants';
import { calculateAge } from './utils/age';

export interface DeckCard {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  distanceKm: number | null;
  interests: string[];
  relationshipGoal: string | null;
  isSuperLike: boolean;
  isBoosted: boolean;
}

export interface SwipeResult {
  matched: boolean;
  matchId?: string;
}

export interface UndoResult {
  targetUserId: string;
  action: string;
  hadMatch: boolean;
}

export interface IncognitoResult {
  incognitoEnabled: boolean;
}

export interface BoostStatus {
  active: boolean;
  expiresAt: string | null;
  viewCount: number;
}

export interface ActiveModeResult {
  activeMode: string;
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
    const lifestyleWhere = this.buildLifestyleFilterWhere(currentUser);

    const likersOfMe = await this.prisma.swipe.findMany({
      where: {
        targetUserId: userId,
        action: { in: LIKE_ACTIONS },
        swiperId: { notIn: excludedIds },
      },
      select: { swiperId: true, action: true },
    });
    const likedMeIds = likersOfMe.map((s) => s.swiperId);
    const superLikerIdSet = new Set(
      likersOfMe.filter((s) => s.action === 'SUPER_LIKE').map((s) => s.swiperId),
    );

    const activeBoosts = await this.prisma.boost.findMany({
      where: { expiresAt: { gt: new Date() }, userId: { notIn: excludedIds } },
      orderBy: { createdAt: 'asc' },
    });
    const boostedIdSet = new Set(activeBoosts.map((boost) => boost.userId));

    // Boosted profiles get top priority ("pushed to the top"), then anyone
    // who has super-liked the viewer, de-duplicated in that order.
    const priorityIdsOrdered = [
      ...boostedIdSet,
      ...[...superLikerIdSet].filter((id) => !boostedIdSet.has(id)),
    ];

    const priorityCandidatesRaw =
      priorityIdsOrdered.length > 0
        ? await this.prisma.user.findMany({
            where: {
              id: { in: priorityIdsOrdered },
              onboardingCompletedAt: { not: null },
              activeMode: currentUser.activeMode,
              ...lifestyleWhere,
            },
            take: DEFAULT_DECK_SIZE,
          })
        : [];
    const priorityCandidateById = new Map(priorityCandidatesRaw.map((c) => [c.id, c]));
    const priorityCandidates = priorityIdsOrdered
      .map((id) => priorityCandidateById.get(id))
      .filter((candidate): candidate is (typeof priorityCandidatesRaw)[number] => candidate != null)
      .slice(0, DEFAULT_DECK_SIZE);
    const priorityIds = priorityCandidates.map((candidate) => candidate.id);

    const remainingCandidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: [...excludedIds, ...priorityIds] },
        onboardingCompletedAt: { not: null },
        activeMode: currentUser.activeMode,
        OR: [{ incognitoEnabled: false }, { id: { in: likedMeIds } }],
        ...lifestyleWhere,
      },
      take: Math.max(DEFAULT_DECK_SIZE - priorityCandidates.length, 0),
    });

    const candidates = [...priorityCandidates, ...remainingCandidates];

    const shownBoostedIds = priorityIds.filter((id) => boostedIdSet.has(id));
    if (shownBoostedIds.length > 0) {
      await this.prisma.boost.updateMany({
        where: { userId: { in: shownBoostedIds }, expiresAt: { gt: new Date() } },
        data: { viewCount: { increment: 1 } },
      });
    }

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
      isSuperLike: superLikerIdSet.has(candidate.id),
      isBoosted: boostedIdSet.has(candidate.id),
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

    if (action === 'SUPER_LIKE') {
      const superLikesToday = await this.prisma.swipe.count({
        where: { swiperId: userId, action: 'SUPER_LIKE', createdAt: { gte: startOfUtcDay(new Date()) } },
      });
      if (superLikesToday >= DAILY_SUPER_LIKE_LIMIT) {
        throw new BadRequestException('You have used all of your super likes for today.');
      }
    }

    await this.prisma.swipe.create({ data: { swiperId: userId, targetUserId, action } });

    if (!LIKE_ACTIONS.includes(action as (typeof LIKE_ACTIONS)[number])) {
      return { matched: false };
    }

    const reciprocal = await this.prisma.swipe.findUnique({
      where: { swiperId_targetUserId: { swiperId: targetUserId, targetUserId: userId } },
    });

    if (!reciprocal || !LIKE_ACTIONS.includes(reciprocal.action as (typeof LIKE_ACTIONS)[number])) {
      return { matched: false };
    }

    const [userAId, userBId] = [userId, targetUserId].sort();
    const match = await this.prisma.match.create({
      data: { userAId, userBId, firstMessageExpiresAt: computeFirstMessageExpiresAt(new Date()) },
    });

    return { matched: true, matchId: match.id };
  }

  /**
   * Premium "rewind": undoes the current user's most recent swipe so the
   * candidate reappears in the deck. If that swipe formed a match, the
   * match is undone too, unless a conversation already started there.
   */
  async undoLastSwipe(userId: string): Promise<UndoResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    if (!currentUser.isPremium) {
      throw new ForbiddenException('Rewind is a premium feature.');
    }

    const lastSwipe = await this.prisma.swipe.findFirst({
      where: { swiperId: userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastSwipe) {
      throw new BadRequestException('There is no swipe to undo.');
    }

    const [userAId, userBId] = [userId, lastSwipe.targetUserId].sort();
    const match = await this.prisma.match.findUnique({
      where: { userAId_userBId: { userAId, userBId } },
    });

    if (match) {
      if (match.firstMessageSentAt != null) {
        throw new BadRequestException(
          'This swipe already led to a conversation and cannot be undone.',
        );
      }
      await this.prisma.match.delete({ where: { id: match.id } });
    }

    await this.prisma.swipe.delete({ where: { id: lastSwipe.id } });

    return {
      targetUserId: lastSwipe.targetUserId,
      action: lastSwipe.action,
      hadMatch: match != null,
    };
  }

  /**
   * Premium "incognito" mode: hides the user from the main discovery deck,
   * except for profiles the user has actively liked or super-liked (they
   * remain visible to whoever they've swiped right on).
   */
  async setIncognitoMode(userId: string, enabled: boolean): Promise<IncognitoResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    if (enabled && !currentUser.isPremium) {
      throw new ForbiddenException('Incognito mode is a premium feature.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { incognitoEnabled: enabled },
    });

    return { incognitoEnabled: updated.incognitoEnabled };
  }

  /**
   * Premium "boost": puts the user at the top of nearby decks for 30
   * minutes. Priority placement and view-count tracking happen in
   * [getDeck] whenever this boost is still active.
   */
  async activateBoost(userId: string): Promise<BoostStatus> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    if (!currentUser.isPremium) {
      throw new ForbiddenException('Boost is a premium feature.');
    }

    const existing = await this.prisma.boost.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      throw new BadRequestException('You already have an active boost.');
    }

    const boost = await this.prisma.boost.create({
      data: { userId, expiresAt: computeBoostExpiresAt(new Date()) },
    });

    return { active: true, expiresAt: boost.expiresAt.toISOString(), viewCount: boost.viewCount };
  }

  async getBoostStatus(userId: string): Promise<BoostStatus> {
    const boost = await this.prisma.boost.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!boost) {
      return { active: false, expiresAt: null, viewCount: 0 };
    }

    return { active: true, expiresAt: boost.expiresAt.toISOString(), viewCount: boost.viewCount };
  }

  /**
   * Switches which network the user is browsing/discoverable in (dating,
   * BFF, or Bizz) within the same swipe/match architecture: getDeck only
   * surfaces candidates whose own activeMode currently matches the
   * viewer's, so the three modes stay separate without needing parallel
   * swipe/match data.
   */
  async setActiveMode(userId: string, mode: string): Promise<ActiveModeResult> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { activeMode: mode },
    });

    return { activeMode: updated.activeMode };
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
