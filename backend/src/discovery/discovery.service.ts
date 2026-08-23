import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import { getMutualConnectionCounts } from '../social-graph/social-graph.utils';
import { haversineDistanceKm } from '../location/utils/haversine';
import { computeFirstMessageExpiresAt, findIcebreakerPrompt } from '../messaging/messaging.constants';
import {
  computeBoostExpiresAt,
  computeDefaultSnoozeUntil,
  computeMaxSnoozeUntil,
  DAILY_SUPER_LIKE_LIMIT,
  DEFAULT_DECK_SIZE,
  LIKE_ACTIONS,
  LikedBySort,
  LIKED_BY_SORT_OPTIONS,
  MIN_SWIPES_FOR_PHOTO_ROTATION,
  SNOOZE_MAX_DURATION_DAYS,
  startOfUtcDay,
  isSuperBoostPeakHour,
  SUPER_BOOST_PEAK_VIEW_MULTIPLIER,
  SUPER_BOOST_OFF_PEAK_VIEW_MULTIPLIER,
} from './discovery.constants';
import { getZodiacSign } from '../matching/zodiac.utils';
import { calculateAge } from './utils/age';
import { MatchingService } from '../matching/matching.service';

export interface DeckCard {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  videoSnippetUrl: string | null;
  voiceIntroUrl: string | null;
  voiceIntroDurationSeconds: number | null;
  distanceKm: number | null;
  interests: string[];
  sharedInterests: string[];
  relationshipGoal: string | null;
  relationshipIntentBadges: string[];
  lifestyleBadges: string[];
  zodiacSign: string | null;
  loveStyleBadges: string[];
  isSuperLike: boolean;
  isBoosted: boolean;
  isPriorityLike: boolean;
  complimentText: string | null;
  complimentTarget: string | null;
  mutualConnectionCount: number;
  communicationBoundaries: string | null;
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
  tier: 'STANDARD' | 'SUPER' | null;
  viewMultiplier: number;
}

export interface ActiveModeResult {
  activeMode: string;
}

export interface SnoozeResult {
  snoozedUntil: string | null;
  statusMessage: string | null;
}

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
  ) {}

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
    // Super Boosts outrank regular Boosts; the sort is stable, so createdAt
    // order is preserved within each tier.
    const orderedBoosts = [...activeBoosts].sort((a, b) =>
      a.tier === b.tier ? 0 : a.tier === 'SUPER' ? -1 : 1,
    );
    const boostedIdSet = new Set(orderedBoosts.map((boost) => boost.userId));
    const viewMultiplierByUserId = new Map(activeBoosts.map((boost) => [boost.userId, boost.viewMultiplier]));

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
      await Promise.all(
        shownBoostedIds.map((id) =>
          this.prisma.boost.updateMany({
            where: { userId: id, expiresAt: { gt: new Date() } },
            data: { viewCount: { increment: viewMultiplierByUserId.get(id) ?? 1 } },
          }),
        ),
      );
    }

    const usingPassport =
      currentUser.passportEnabled &&
      currentUser.passportLatitude != null &&
      currentUser.passportLongitude != null;
    const originLatitude = usingPassport ? currentUser.passportLatitude : currentUser.latitude;
    const originLongitude = usingPassport ? currentUser.passportLongitude : currentUser.longitude;

    const origin = { latitude: originLatitude, longitude: originLongitude };
    const mutualConnectionCounts = await getMutualConnectionCounts(
      this.prisma,
      userId,
      candidates.map((candidate) => candidate.id),
    );

    return candidates.map((candidate) =>
      this.toDeckCard(candidate, now, origin, {
        isSuperLike: superLikerIdSet.has(candidate.id),
        isBoosted: boostedIdSet.has(candidate.id),
        isPriorityLike: priorityLikerIdSet.has(candidate.id),
        complimentText: null,
        complimentTarget: null,
        viewerInterests: currentUser.interests,
        mutualConnectionCount: mutualConnectionCounts.get(candidate.id) ?? 0,
      }),
    );
  }

  /**
   * Premium "who liked you": a grid of everyone who has already swiped
   * right (or super-liked) the current user, so they can match instantly
   * instead of waiting to see them in the main deck. Defaults to most
   * recently liked first; pass PROXIMITY or COMPATIBILITY to re-sort the
   * same backlog by distance or compatibility score instead, so a large
   * backlog of likes stays manageable.
   */
  async getLikedByGrid(userId: string, sortBy: LikedBySort = 'RECENT'): Promise<DeckCard[]> {
    if (!LIKED_BY_SORT_OPTIONS.includes(sortBy)) {
      throw new BadRequestException('Invalid sortBy option.');
    }

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
    const mutualConnectionCounts = await getMutualConnectionCounts(
      this.prisma,
      userId,
      orderedLikers.map((liker) => liker.id),
    );

    const cards = orderedLikers.map((liker) =>
      this.toDeckCard(liker, now, origin, {
        isSuperLike: superLikerIdSet.has(liker.id),
        isBoosted: false,
        isPriorityLike: false,
        complimentText: complimentBySwiperId.get(liker.id)?.text ?? null,
        complimentTarget: complimentBySwiperId.get(liker.id)?.target ?? null,
        viewerInterests: currentUser.interests,
        mutualConnectionCount: mutualConnectionCounts.get(liker.id) ?? 0,
      }),
    );

    if (sortBy === 'PROXIMITY') {
      return [...cards].sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    if (sortBy === 'COMPATIBILITY') {
      const scores = await Promise.all(
        cards.map((card) => this.matchingService.getCompatibility(userId, card.id)),
      );
      const percentageById = new Map(cards.map((card, index) => [card.id, scores[index].percentage]));
      return [...cards].sort(
        (a, b) => (percentageById.get(b.id) ?? -1) - (percentageById.get(a.id) ?? -1),
      );
    }

    return cards;
  }

  private toDeckCard(
    candidate: {
      id: string;
      name: string | null;
      dateOfBirth: Date | null;
      profilePhotoUrl: string | null;
      videoSnippetUrl: string | null;
      voiceIntroUrl: string | null;
      voiceIntroDurationSeconds: number | null;
      latitude: number | null;
      longitude: number | null;
      interests: string[];
      relationshipGoal: string | null;
      relationshipDesires: string[];
      showRelationshipDesiresOnProfile: boolean;
      customRelationshipIntent: string | null;
      showCustomRelationshipIntentOnProfile: boolean;
      communicationBoundaries: string | null;
      showCommunicationBoundariesOnProfile: boolean;
      heightCm: number | null;
      workoutHabit: string | null;
      petOwnership: string | null;
      smokingHabit: string | null;
      drinkingHabit: string | null;
      showLifestyleBadgesOnProfile: boolean;
      showZodiacOnProfile: boolean;
      loveLanguages: string[];
      showLoveLanguagesOnProfile: boolean;
      attachmentStyle: string | null;
      showAttachmentStyleOnProfile: boolean;
    },
    now: Date,
    origin: { latitude: number | null; longitude: number | null },
    flags: {
      isSuperLike: boolean;
      isBoosted: boolean;
      isPriorityLike: boolean;
      complimentText: string | null;
      complimentTarget: string | null;
      viewerInterests: string[];
      mutualConnectionCount: number;
    },
  ): DeckCard {
    return {
      id: candidate.id,
      name: candidate.name,
      age: candidate.dateOfBirth ? calculateAge(candidate.dateOfBirth, now) : null,
      profilePhotoUrl: candidate.profilePhotoUrl,
      videoSnippetUrl: candidate.videoSnippetUrl,
      voiceIntroUrl: candidate.voiceIntroUrl,
      voiceIntroDurationSeconds: candidate.voiceIntroDurationSeconds,
      distanceKm:
        origin.latitude != null &&
        origin.longitude != null &&
        candidate.latitude != null &&
        candidate.longitude != null
          ? haversineDistanceKm(origin.latitude, origin.longitude, candidate.latitude, candidate.longitude)
          : null,
      interests: candidate.interests,
      sharedInterests: candidate.interests.filter((interest) =>
        flags.viewerInterests.includes(interest),
      ),
      relationshipGoal: candidate.relationshipGoal,
      relationshipIntentBadges: this.buildRelationshipIntentBadges(candidate),
      lifestyleBadges: this.buildLifestyleBadges(candidate),
      zodiacSign:
        candidate.showZodiacOnProfile && candidate.dateOfBirth
          ? getZodiacSign(candidate.dateOfBirth)
          : null,
      loveStyleBadges: this.buildLoveStyleBadges(candidate),
      isSuperLike: flags.isSuperLike,
      isBoosted: flags.isBoosted,
      isPriorityLike: flags.isPriorityLike,
      complimentText: flags.complimentText,
      complimentTarget: flags.complimentTarget,
      mutualConnectionCount: flags.mutualConnectionCount,
      communicationBoundaries: candidate.showCommunicationBoundariesOnProfile
        ? candidate.communicationBoundaries
        : null,
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

  /**
   * Love language and attachment style badges - each respects its own
   * display toggle independently, like the relationship-intent badges.
   */
  private buildLoveStyleBadges(candidate: {
    loveLanguages: string[];
    showLoveLanguagesOnProfile: boolean;
    attachmentStyle: string | null;
    showAttachmentStyleOnProfile: boolean;
  }): string[] {
    const badges: string[] = [];
    if (candidate.showLoveLanguagesOnProfile) {
      badges.push(...candidate.loveLanguages);
    }
    if (candidate.showAttachmentStyleOnProfile && candidate.attachmentStyle) {
      badges.push(`${candidate.attachmentStyle} Attachment`);
    }
    return badges;
  }

  async recordSwipe(
    userId: string,
    targetUserId: string,
    action: string,
    complimentText?: string,
    complimentTarget?: string,
    icebreakerPromptId?: string,
    icebreakerOptionIndex?: number,
  ): Promise<SwipeResult> {
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot swipe on yourself.');
    }

    const isLike = LIKE_ACTIONS.includes(action as (typeof LIKE_ACTIONS)[number]);

    if (complimentText && !isLike) {
      throw new BadRequestException('Compliments can only be attached to a like.');
    }

    if ((icebreakerPromptId == null) !== (icebreakerOptionIndex == null)) {
      throw new BadRequestException('icebreakerPromptId and icebreakerOptionIndex must be given together.');
    }
    if (icebreakerPromptId != null) {
      if (!isLike) {
        throw new BadRequestException('An icebreaker answer can only be attached to a like.');
      }
      if (!findIcebreakerPrompt(icebreakerPromptId)) {
        throw new BadRequestException('Unknown icebreaker prompt.');
      }
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
        // A purchased power-up (see PowerUpsService) grants extra super
        // likes beyond the daily free allowance, consumed one at a time.
        const swiper = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { bonusSuperLikes: true },
        });
        if (!swiper || swiper.bonusSuperLikes <= 0) {
          throw new BadRequestException('You have used all of your super likes for today.');
        }
        await this.prisma.user.update({
          where: { id: userId },
          data: { bonusSuperLikes: { decrement: 1 } },
        });
      }
    }

    await this.prisma.swipe.create({
      data: {
        swiperId: userId,
        targetUserId,
        action,
        complimentText: complimentText ?? null,
        complimentTarget: complimentTarget ?? null,
        icebreakerPromptId: icebreakerPromptId ?? null,
        icebreakerOptionIndex: icebreakerOptionIndex ?? null,
      },
    });

    await this.recordPhotoTestOutcome(targetUserId, isLike);

    if (!isLike) {
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

    await this.seedMatchIcebreaker(
      match.id,
      { swiperId: userId, promptId: icebreakerPromptId ?? null, optionIndex: icebreakerOptionIndex ?? null },
      {
        swiperId: reciprocal.swiperId,
        promptId: reciprocal.icebreakerPromptId,
        optionIndex: reciprocal.icebreakerOptionIndex,
      },
    );

    return { matched: true, matchId: match.id };
  }

  /**
   * When a match forms and one or both sides answered an icebreaker while
   * liking, seeds the new match's chat with that icebreaker card so the
   * pair opens on a compared answer instead of a blank thread - each side
   * can still answer it in-chat later via respondToIcebreaker if only one
   * of them had picked one, or if they picked different prompts.
   */
  private async seedMatchIcebreaker(
    matchId: string,
    a: { swiperId: string; promptId: string | null; optionIndex: number | null },
    b: { swiperId: string; promptId: string | null; optionIndex: number | null },
  ): Promise<void> {
    if (a.promptId == null && b.promptId == null) {
      return;
    }

    const chosen = a.promptId != null ? a : b;
    const message = await this.prisma.message.create({
      data: { matchId, senderId: chosen.swiperId, contentType: 'ICEBREAKER', content: chosen.promptId! },
    });

    const responses = [a, b].filter(
      (side) => side.promptId === chosen.promptId && side.optionIndex != null,
    );
    if (responses.length > 0) {
      await this.prisma.icebreakerResponse.createMany({
        data: responses.map((side) => ({
          messageId: message.id,
          userId: side.swiperId,
          optionIndex: side.optionIndex!,
        })),
      });
    }
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
      data: { userId, expiresAt: computeBoostExpiresAt(new Date()), tier: 'STANDARD', viewMultiplier: 1 },
    });

    return this.toBoostStatus(boost);
  }

  /**
   * High-tier premium boost: like [activateBoost], but reserved for
   * Platinum subscribers and worth up to 100x the profile views - the full
   * multiplier only applies during the (fixed, UTC-approximated) local
   * peak-activity window; outside it, Super Boost still beats a regular
   * Boost, just by less.
   */
  async activateSuperBoost(userId: string): Promise<BoostStatus> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    if (currentUser.subscriptionTier !== 'PLATINUM') {
      throw new ForbiddenException('Super Boost requires a Platinum subscription.');
    }

    const existing = await this.prisma.boost.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      throw new BadRequestException('You already have an active boost.');
    }

    const now = new Date();
    const viewMultiplier = isSuperBoostPeakHour(now)
      ? SUPER_BOOST_PEAK_VIEW_MULTIPLIER
      : SUPER_BOOST_OFF_PEAK_VIEW_MULTIPLIER;

    const boost = await this.prisma.boost.create({
      data: { userId, expiresAt: computeBoostExpiresAt(now), tier: 'SUPER', viewMultiplier },
    });

    return this.toBoostStatus(boost);
  }

  async getBoostStatus(userId: string): Promise<BoostStatus> {
    const boost = await this.prisma.boost.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!boost) {
      return { active: false, expiresAt: null, viewCount: 0, tier: null, viewMultiplier: 1 };
    }

    return this.toBoostStatus(boost);
  }

  private toBoostStatus(boost: {
    expiresAt: Date;
    viewCount: number;
    tier: string;
    viewMultiplier: number;
  }): BoostStatus {
    return {
      active: true,
      expiresAt: boost.expiresAt.toISOString(),
      viewCount: boost.viewCount,
      tier: boost.tier as 'STANDARD' | 'SUPER',
      viewMultiplier: boost.viewMultiplier,
    };
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
  async setSnoozeMode(
    userId: string,
    enabled: boolean,
    until?: string,
    statusMessage?: string,
  ): Promise<SnoozeResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    if (!enabled) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { snoozedUntil: null, snoozeStatusMessage: null },
      });
      return { snoozedUntil: null, statusMessage: null };
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
      data: { snoozedUntil, snoozeStatusMessage: statusMessage ?? null },
    });

    return {
      snoozedUntil: updated.snoozedUntil ? updated.snoozedUntil.toISOString() : null,
      statusMessage: updated.snoozeStatusMessage,
    };
  }

  async getSnoozeStatus(userId: string): Promise<SnoozeResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const isActive = currentUser.snoozedUntil != null && currentUser.snoozedUntil.getTime() > Date.now();
    return {
      snoozedUntil: isActive && currentUser.snoozedUntil ? currentUser.snoozedUntil.toISOString() : null,
      statusMessage: isActive ? currentUser.snoozeStatusMessage : null,
    };
  }

  /**
   * Smart photo rotation: attributes this swipe's outcome to whichever
   * photo is currently the target's lead (lowest `position`) photo, then
   * checks whether a better-converting photo should take over the lead
   * slot. Users who haven't added anything to their photo gallery yet have
   * no ProfilePhoto rows, so this is a no-op for them.
   */
  private async recordPhotoTestOutcome(ownerId: string, isRightSwipe: boolean): Promise<void> {
    const leadPhoto = await this.prisma.profilePhoto.findFirst({
      where: { ownerId },
      orderBy: { position: 'asc' },
    });
    if (!leadPhoto) {
      return;
    }

    await this.prisma.profilePhoto.update({
      where: { id: leadPhoto.id },
      data: {
        impressions: { increment: 1 },
        ...(isRightSwipe ? { rightSwipes: { increment: 1 } } : {}),
      },
    });

    await this.maybeRotateLeadPhoto(ownerId);
  }

  private async maybeRotateLeadPhoto(ownerId: string): Promise<void> {
    const photos = await this.prisma.profilePhoto.findMany({
      where: { ownerId },
      orderBy: { position: 'asc' },
    });
    if (photos.length < 2) {
      return;
    }

    const eligible = photos.filter((photo) => photo.impressions >= MIN_SWIPES_FOR_PHOTO_ROTATION);
    if (eligible.length === 0) {
      return;
    }

    const best = eligible.reduce((top, candidate) =>
      candidate.rightSwipes / candidate.impressions > top.rightSwipes / top.impressions ? candidate : top,
    );

    const currentLead = photos[0];
    if (best.id === currentLead.id) {
      return;
    }

    const currentLeadRate =
      currentLead.impressions > 0 ? currentLead.rightSwipes / currentLead.impressions : -1;
    const bestRate = best.rightSwipes / best.impressions;
    if (bestRate <= currentLeadRate) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.profilePhoto.update({
        where: { id: currentLead.id },
        data: { position: best.position },
      }),
      this.prisma.profilePhoto.update({
        where: { id: best.id },
        data: { position: currentLead.position },
      }),
      this.prisma.user.update({ where: { id: ownerId }, data: { profilePhotoUrl: best.mediaUrl } }),
    ]);
  }

  private buildLifestyleFilterWhere(currentUser: {
    filterSmokingHabits: string[];
    filterDrinkingHabits: string[];
    filterEducationLevels: string[];
    filterReligions: string[];
    filterDietaryPreferences: string[];
    filterWantsChildren: string[];
    filterRelationshipGoals: string[];
    filterKinkTags?: string[];
    filterRelationshipDesires?: string[];
    filterSharedInterestsOnly: boolean;
    filterVerifiedOnly?: boolean;
    filterCommunityGroups?: string[];
    interests: string[];
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
    if ((currentUser.filterKinkTags ?? []).length > 0) {
      where.kinkTags = { hasSome: currentUser.filterKinkTags };
    }
    if ((currentUser.filterRelationshipDesires ?? []).length > 0) {
      where.relationshipDesires = { hasSome: currentUser.filterRelationshipDesires };
    }
    if (currentUser.filterSharedInterestsOnly && currentUser.interests.length > 0) {
      where.interests = { hasSome: currentUser.interests };
    }
    if (currentUser.filterVerifiedOnly) {
      where.isVerified = true;
    }
    if ((currentUser.filterCommunityGroups ?? []).length > 0) {
      where.communityGroupIds = { hasSome: currentUser.filterCommunityGroups };
    }

    return where;
  }
}
