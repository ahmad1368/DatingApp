import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import { haversineDistanceKm } from '../location/utils/haversine';
import { computeFirstMessageExpiresAt } from '../messaging/messaging.constants';
import {
  computeBoostExpiresAt,
  computeDefaultSnoozeUntil,
  computeMaxSnoozeUntil,
  DAILY_SUPER_LIKE_LIMIT,
  DEFAULT_DECK_SIZE,
  LIKE_ACTIONS,
  SNOOZE_MAX_DURATION_DAYS,
  startOfUtcDay,
} from './discovery.constants';
import { getZodiacSign } from '../matching/zodiac.utils';
import { calculateAge } from './utils/age';

export interface DeckCard {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  videoSnippetUrl: string | null;
  distanceKm: number | null;
  interests: string[];
  relationshipGoal: string | null;
  relationshipIntentBadges: string[];
  lifestyleBadges: string[];
  zodiacSign: string | null;
  isSuperLike: boolean;
  isBoosted: boolean;
  isPriorityLike: boolean;
  complimentText: string | null;
  complimentTarget: string | null;
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

export interface SnoozeResult {
  snoozedUntil: string | null;
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
    const blockedIds = await getBlockedUserIds(this.prisma, userId);

    const excludedIds = [userId, ...swiped.map((s) => s.targetUserId), ...blockedIds];
    const lifestyleWhere = this.buildLifestyleFilterWhere(currentUser);
    const now = new Date();
    const notSnoozedWhere: Prisma.UserWhereInput = {
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    };

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

    // "Priority likes": a premium user's regular (non-super) like also
    // earns a spot near the top, one tier below an outright super like.
    const regularLikerIds = likedMeIds.filter((id) => !superLikerIdSet.has(id));
    const premiumRegularLikers =
      regularLikerIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: regularLikerIds }, isPremium: true },
            select: { id: true },
          })
        : [];
    const priorityLikerIdSet = new Set(premiumRegularLikers.map((user) => user.id));

    // Boosted profiles get top priority ("pushed to the top"), then anyone
    // who has super-liked the viewer, then premium priority likes -
    // de-duplicated in that order.
    const priorityIdsOrdered = [
      ...boostedIdSet,
      ...[...superLikerIdSet].filter((id) => !boostedIdSet.has(id)),
      ...[...priorityLikerIdSet].filter((id) => !boostedIdSet.has(id) && !superLikerIdSet.has(id)),
    ];

    const priorityCandidatesRaw =
      priorityIdsOrdered.length > 0
        ? await this.prisma.user.findMany({
            where: {
              id: { in: priorityIdsOrdered },
              onboardingCompletedAt: { not: null },
              activeMode: currentUser.activeMode,
              ...notSnoozedWhere,
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
        AND: [
          { OR: [{ incognitoEnabled: false }, { id: { in: likedMeIds } }] },
          notSnoozedWhere,
        ],
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

    const origin = { latitude: originLatitude, longitude: originLongitude };

    return candidates.map((candidate) =>
      this.toDeckCard(candidate, now, origin, {
        isSuperLike: superLikerIdSet.has(candidate.id),
        isBoosted: boostedIdSet.has(candidate.id),
        isPriorityLike: priorityLikerIdSet.has(candidate.id),
        complimentText: null,
        complimentTarget: null,
      }),
    );
  }

  /**
   * Premium "who liked you": a grid of everyone who has already swiped
   * right (or super-liked) the current user, most recent first, so they
   * can match instantly instead of waiting to see them in the main deck.
   */
  async getLikedByGrid(userId: string): Promise<DeckCard[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    if (!currentUser.isPremium) {
      throw new ForbiddenException('Seeing who liked you is a premium feature.');
    }

    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetUserId: true },
    });
    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const excludedIds = [userId, ...swiped.map((s) => s.targetUserId), ...blockedIds];

    const likersOfMe = await this.prisma.swipe.findMany({
      where: {
        targetUserId: userId,
        action: { in: LIKE_ACTIONS },
        swiperId: { notIn: excludedIds },
      },
      select: { swiperId: true, action: true, complimentText: true, complimentTarget: true },
      orderBy: { createdAt: 'desc' },
    });
    const likerIdsOrdered = likersOfMe.map((s) => s.swiperId);
    const superLikerIdSet = new Set(
      likersOfMe.filter((s) => s.action === 'SUPER_LIKE').map((s) => s.swiperId),
    );
    const complimentBySwiperId = new Map(
      likersOfMe.map((s) => [s.swiperId, { text: s.complimentText, target: s.complimentTarget }]),
    );

    const lifestyleWhere = this.buildLifestyleFilterWhere(currentUser);
    const likers =
      likerIdsOrdered.length > 0
        ? await this.prisma.user.findMany({
            where: {
              id: { in: likerIdsOrdered },
              onboardingCompletedAt: { not: null },
              activeMode: currentUser.activeMode,
              ...lifestyleWhere,
            },
          })
        : [];
    const likerById = new Map(likers.map((liker) => [liker.id, liker]));
    const orderedLikers = likerIdsOrdered
      .map((id) => likerById.get(id))
      .filter((liker): liker is (typeof likers)[number] => liker != null);

    const usingPassport =
      currentUser.passportEnabled &&
      currentUser.passportLatitude != null &&
      currentUser.passportLongitude != null;
    const origin = {
      latitude: usingPassport ? currentUser.passportLatitude : currentUser.latitude,
      longitude: usingPassport ? currentUser.passportLongitude : currentUser.longitude,
    };
    const now = new Date();

    return orderedLikers.map((liker) =>
      this.toDeckCard(liker, now, origin, {
        isSuperLike: superLikerIdSet.has(liker.id),
        isBoosted: false,
        isPriorityLike: false,
        complimentText: complimentBySwiperId.get(liker.id)?.text ?? null,
        complimentTarget: complimentBySwiperId.get(liker.id)?.target ?? null,
      }),
    );
  }

  private toDeckCard(
    candidate: {
      id: string;
      name: string | null;
      dateOfBirth: Date | null;
      profilePhotoUrl: string | null;
      videoSnippetUrl: string | null;
      latitude: number | null;
      longitude: number | null;
      interests: string[];
      relationshipGoal: string | null;
      relationshipDesires: string[];
      showRelationshipDesiresOnProfile: boolean;
      customRelationshipIntent: string | null;
      showCustomRelationshipIntentOnProfile: boolean;
      heightCm: number | null;
      workoutHabit: string | null;
      petOwnership: string | null;
      smokingHabit: string | null;
      drinkingHabit: string | null;
      showLifestyleBadgesOnProfile: boolean;
      showZodiacOnProfile: boolean;
    },
    now: Date,
    origin: { latitude: number | null; longitude: number | null },
    flags: {
      isSuperLike: boolean;
      isBoosted: boolean;
      isPriorityLike: boolean;
      complimentText: string | null;
      complimentTarget: string | null;
    },
  ): DeckCard {
    return {
      id: candidate.id,
      name: candidate.name,
      age: candidate.dateOfBirth ? calculateAge(candidate.dateOfBirth, now) : null,
      profilePhotoUrl: candidate.profilePhotoUrl,
      videoSnippetUrl: candidate.videoSnippetUrl,
      distanceKm:
        origin.latitude != null &&
        origin.longitude != null &&
        candidate.latitude != null &&
        candidate.longitude != null
          ? haversineDistanceKm(origin.latitude, origin.longitude, candidate.latitude, candidate.longitude)
          : null,
      interests: candidate.interests,
      relationshipGoal: candidate.relationshipGoal,
      relationshipIntentBadges: this.buildRelationshipIntentBadges(candidate),
      lifestyleBadges: this.buildLifestyleBadges(candidate),
      zodiacSign:
        candidate.showZodiacOnProfile && candidate.dateOfBirth
          ? getZodiacSign(candidate.dateOfBirth)
          : null,
      isSuperLike: flags.isSuperLike,
      isBoosted: flags.isBoosted,
      isPriorityLike: flags.isPriorityLike,
      complimentText: flags.complimentText,
      complimentTarget: flags.complimentTarget,
    };
  }

  /**
   * Explicit "relationship intent" badges shown on a profile: the curated
   * tags they've chosen to display, plus one freeform custom badge - each
   * respects its own visibility toggle independently.
   */
  private buildRelationshipIntentBadges(candidate: {
    relationshipDesires: string[];
    showRelationshipDesiresOnProfile: boolean;
    customRelationshipIntent: string | null;
    showCustomRelationshipIntentOnProfile: boolean;
  }): string[] {
    const badges: string[] = [];
    if (candidate.showRelationshipDesiresOnProfile) {
      badges.push(...candidate.relationshipDesires);
    }
    if (candidate.showCustomRelationshipIntentOnProfile && candidate.customRelationshipIntent) {
      badges.push(candidate.customRelationshipIntent);
    }
    return badges;
  }

  /**
   * Compact lifestyle badges (height, workout, pets, smoking, drinking),
   * gated by the candidate's own display toggle.
   */
  private buildLifestyleBadges(candidate: {
    heightCm: number | null;
    workoutHabit: string | null;
    petOwnership: string | null;
    smokingHabit: string | null;
    drinkingHabit: string | null;
    showLifestyleBadgesOnProfile: boolean;
  }): string[] {
    if (!candidate.showLifestyleBadgesOnProfile) {
      return [];
    }
    const badges: string[] = [];
    if (candidate.heightCm != null) {
      badges.push(`${candidate.heightCm} cm`);
    }
    if (candidate.workoutHabit) {
      badges.push(`Workout: ${candidate.workoutHabit}`);
    }
    if (candidate.petOwnership) {
      badges.push(candidate.petOwnership);
    }
    if (candidate.smokingHabit) {
      badges.push(`Smoking: ${candidate.smokingHabit}`);
    }
    if (candidate.drinkingHabit) {
      badges.push(`Drinking: ${candidate.drinkingHabit}`);
    }
    return badges;
  }

  async recordSwipe(
    userId: string,
    targetUserId: string,
    action: string,
    complimentText?: string,
    complimentTarget?: string,
  ): Promise<SwipeResult> {
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot swipe on yourself.');
    }

    if (complimentText && !LIKE_ACTIONS.includes(action as (typeof LIKE_ACTIONS)[number])) {
      throw new BadRequestException('Compliments can only be attached to a like.');
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

    await this.prisma.swipe.create({
      data: {
        swiperId: userId,
        targetUserId,
        action,
        complimentText: complimentText ?? null,
        complimentTarget: complimentTarget ?? null,
      },
    });

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

  /**
   * "Snooze"/travel mode: temporarily hides the user from other people's
   * discovery decks and the daily picks feed (see [getDeck] and
   * CuratedProfilesService) without touching their existing swipes or
   * matches, so a paused user can still message and browse normally.
   */
  async setSnoozeMode(userId: string, enabled: boolean, until?: string): Promise<SnoozeResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    if (!enabled) {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { snoozedUntil: null },
      });
      return { snoozedUntil: updated.snoozedUntil?.toISOString() ?? null };
    }

    const now = new Date();
    const snoozedUntil = until ? new Date(until) : computeDefaultSnoozeUntil(now);
    if (snoozedUntil.getTime() <= now.getTime()) {
      throw new BadRequestException('Snooze end time must be in the future.');
    }
    if (snoozedUntil.getTime() > computeMaxSnoozeUntil(now).getTime()) {
      throw new BadRequestException(`Snooze cannot be longer than ${SNOOZE_MAX_DURATION_DAYS} days.`);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { snoozedUntil },
    });

    return { snoozedUntil: updated.snoozedUntil ? updated.snoozedUntil.toISOString() : null };
  }

  async getSnoozeStatus(userId: string): Promise<SnoozeResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const isActive = currentUser.snoozedUntil != null && currentUser.snoozedUntil.getTime() > Date.now();
    return { snoozedUntil: isActive && currentUser.snoozedUntil ? currentUser.snoozedUntil.toISOString() : null };
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
