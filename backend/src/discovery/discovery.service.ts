import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import {
  getDirectContactUserIds,
  getMutualConnectionCounts,
  getMutualConnectionHiddenIds,
} from '../social-graph/social-graph.utils';
import { haversineDistanceKm } from '../location/utils/haversine';
import { computeFirstMessageExpiresAt, findIcebreakerPrompt } from '../messaging/messaging.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { DEFAULT_SEARCH_RADIUS_KM, MAX_SEARCH_RADIUS_KM } from '../location/location.constants';
import {
  applyDeckFeedback,
  applyPassReasonFeedback,
  computeBoostExpiresAt,
  computeDefaultSnoozeUntil,
  computeHappyHourWindow,
  computeMaxSnoozeUntil,
  DAILY_SUPER_LIKE_LIMIT,
  DeckFeedbackRating,
  DEFAULT_DECK_SIZE,
  DEFAULT_PROXIMITY_WEIGHT,
  HAPPY_HOUR_BONUS_SUPER_LIKES,
  HAPPY_HOUR_VIEW_MULTIPLIER,
  isHappyHour,
  isHiddenByVisibilitySchedule,
  LIKE_ACTIONS,
  LikedBySort,
  LIKED_BY_SORT_OPTIONS,
  MIN_CANDIDATES_BEFORE_RADIUS_EXPANSION,
  MIN_SWIPES_FOR_PHOTO_ROTATION,
  PASS_REASONS,
  RADIUS_EXPANSION_MULTIPLIER,
  SNOOZE_MAX_DURATION_DAYS,
  startOfUtcDay,
  isSuperBoostPeakHour,
  SUPER_BOOST_PEAK_VIEW_MULTIPLIER,
  SUPER_BOOST_OFF_PEAK_VIEW_MULTIPLIER,
  REMAINING_CANDIDATE_POOL_SIZE,
  computeTrendingWindowStart,
  TRENDING_BONUS_PER_RIGHT_SWIPE,
  TRENDING_BONUS_CAP,
  PROXIMITY_SCORE_DECAY_KM,
  VIDEO_FEED_SIZE,
  MIN_MESSAGES_FOR_RESPONSE_RATE_BADGE,
  VERY_RESPONSIVE_RATE_THRESHOLD,
  RESPONSIVE_RATE_THRESHOLD,
} from './discovery.constants';
import { getZodiacSign } from '../matching/zodiac.utils';
import { calculateAge } from './utils/age';
import { MatchingService } from '../matching/matching.service';
import { findProfilePrompt } from '../profile-prompts/profile-prompts.constants';
import { findCommunityGroup } from '../community-groups/community-groups.constants';

/**
 * "Ethical Non-Monogamy & Poly Partner Linking": a confirmed PartnerLink
 * (see CouplePairingService), surfaced on the deck card as a visible,
 * navigable reference to the linked account - not just the free-text
 * relationshipStructure label below.
 */
export interface LinkedPartnerBadge {
  partnerId: string;
  partnerName: string | null;
}

export interface DeckCard {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  profilePhotoBlurred: boolean;
  videoSnippetUrl: string | null;
  voiceIntroUrl: string | null;
  voiceIntroDurationSeconds: number | null;
  distanceKm: number | null;
  interests: string[];
  sharedInterests: string[];
  sharedCommunityGroups: string[];
  linkedPartners: LinkedPartnerBadge[];
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
  sharedSchool: string | null;
  communicationBoundaries: string | null;
  relationshipStructure: string | null;
  kinkTagBadges: string[];
  responseRateBadge: string | null;
  isTraveling: boolean;
}

/**
 * A single card in the "vertical video feed" (see DiscoveryService.
 * getVideoFeed): only candidates with a video snippet or at least one video
 * prompt answer appear here, so swiping is always on actual video content -
 * a candidate with both shows their snippet, since that's their intended
 * headline clip.
 */
export interface VideoFeedCard {
  id: string;
  name: string | null;
  age: number | null;
  videoUrl: string;
  videoSource: 'SNIPPET' | 'PROMPT_ANSWER';
  promptQuestion: string | null;
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

export interface DeckFeedbackResult {
  discoveryProximityWeight: number;
}

export interface HappyHourStatus {
  active: boolean;
  startsAt: string;
  endsAt: string;
  bonusSuperLikes: number;
  viewMultiplier: number;
}

export interface ActiveModeResult {
  activeMode: string;
}

export interface SnoozeResult {
  snoozedUntil: string | null;
  statusMessage: string | null;
}

export interface VisibilityScheduleResult {
  enabled: boolean;
  hiddenStartHourUtc: number | null;
  hiddenEndHourUtc: number | null;
}

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getDeck(userId: string): Promise<DeckCard[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    // "Extra Profile Views" power-up: a one-time widening of this single
    // fetch, consumed (reset to 0) below once the deck is built - see
    // PowerUpsService.purchaseExtraProfileViews.
    const effectiveDeckSize = DEFAULT_DECK_SIZE + (currentUser.bonusDeckSlots ?? 0);

    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetUserId: true },
    });
    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const jointPartnerSwipedIds = currentUser.activeBrowsingPartnerId
      ? await this.getJointPartnerSwipedIds(userId, currentUser.activeBrowsingPartnerId)
      : [];
    const dealbreakerFailedIds = await this.getMandatoryDealbreakerFailedIds(userId);
    const directContactIds = await getDirectContactUserIds(this.prisma, userId);

    const excludedIds = [
      userId,
      ...swiped.map((s) => s.targetUserId),
      ...blockedIds,
      ...jointPartnerSwipedIds,
      ...dealbreakerFailedIds,
      ...directContactIds,
    ];
    const lifestyleWhere = this.buildLifestyleFilterWhere(currentUser);
    const now = new Date();
    const notSnoozedWhere: Prisma.UserWhereInput = {
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    };

    const usingPassport =
      currentUser.passportEnabled &&
      currentUser.passportLatitude != null &&
      currentUser.passportLongitude != null;
    const origin = {
      latitude: usingPassport ? currentUser.passportLatitude : currentUser.latitude,
      longitude: usingPassport ? currentUser.passportLongitude : currentUser.longitude,
    };

    const likersOfMe = await this.prisma.swipe.findMany({
      where: {
        targetUserId: userId,
        action: { in: LIKE_ACTIONS },
        swiperId: { notIn: excludedIds },
      },
      select: { swiperId: true, action: true, isPriorityLike: true },
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
    // earns a spot near the top, one tier below an outright super like -
    // the same placement a purchased priority-like credit grants a
    // non-premium user's regular like (Swipe.isPriorityLike, spent via
    // recordSwipe/PowerUpsService.purchasePriorityLike).
    const regularLikerIds = likedMeIds.filter((id) => !superLikerIdSet.has(id));
    const paidPriorityLikerIds = likersOfMe
      .filter((s) => s.isPriorityLike && !superLikerIdSet.has(s.swiperId))
      .map((s) => s.swiperId);
    const premiumRegularLikers =
      regularLikerIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: regularLikerIds }, isPremium: true },
            select: { id: true },
          })
        : [];
    const priorityLikerIdSet = new Set([
      ...premiumRegularLikers.map((user) => user.id),
      ...paidPriorityLikerIds,
    ]);

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
            take: effectiveDeckSize,
          })
        : [];
    const priorityCandidatesVisible = this.filterVisibleBySchedule(priorityCandidatesRaw, now);
    const priorityCandidateById = new Map(priorityCandidatesVisible.map((c) => [c.id, c]));
    const priorityCandidates = priorityIdsOrdered
      .map((id) => priorityCandidateById.get(id))
      .filter((candidate): candidate is (typeof priorityCandidatesRaw)[number] => candidate != null)
      .slice(0, effectiveDeckSize);
    const priorityIds = priorityCandidates.map((candidate) => candidate.id);

    const mutualConnectionHiddenIds = await getMutualConnectionHiddenIds(this.prisma, userId);

    const remainingCandidatePool = await this.prisma.user.findMany({
      where: {
        id: { notIn: [...excludedIds, ...priorityIds] },
        onboardingCompletedAt: { not: null },
        activeMode: currentUser.activeMode,
        AND: [
          {
            OR: [
              { incognitoEnabled: false },
              { id: { in: likedMeIds } },
              // A non-premium candidate's a la carte incognito pass (see
              // PowerUpsService.purchaseIncognitoPass) has lapsed - there's
              // no background job to flip incognitoEnabled back off, so
              // this is checked lazily here instead, the same way boosts/
              // matches/etc. expire lazily elsewhere in this codebase.
              {
                AND: [
                  { isPremium: false },
                  { OR: [{ incognitoPassExpiresAt: null }, { incognitoPassExpiresAt: { lte: now } }] },
                ],
              },
            ],
          },
          { OR: [{ id: { notIn: mutualConnectionHiddenIds } }, { id: { in: likedMeIds } }] },
          notSnoozedWhere,
        ],
        ...lifestyleWhere,
      },
      take: REMAINING_CANDIDATE_POOL_SIZE,
    });
    const visibleRemainingCandidatePool = this.filterVisibleBySchedule(remainingCandidatePool, now);
    const radiusFilteredPool = this.filterWithinRadius(visibleRemainingCandidatePool, origin, currentUser);
    const remainingCandidates = await this.rankRemainingCandidates(
      radiusFilteredPool,
      origin,
      Math.max(effectiveDeckSize - priorityCandidates.length, 0),
      currentUser.discoveryProximityWeight ?? DEFAULT_PROXIMITY_WEIGHT,
    );

    const candidates = [...priorityCandidates, ...remainingCandidates];

    if (currentUser.bonusDeckSlots > 0) {
      await this.prisma.user.update({ where: { id: userId }, data: { bonusDeckSlots: 0 } });
    }

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

    const mutualConnectionCounts = await getMutualConnectionCounts(
      this.prisma,
      userId,
      candidates.map((candidate) => candidate.id),
    );
    const linkedPartnersByUserId = await this.getLinkedPartnersByUserIds(
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
        viewerSchool: currentUser.school,
        viewerCommunityGroupIds: currentUser.communityGroupIds,
        mutualConnectionCount: mutualConnectionCounts.get(candidate.id) ?? 0,
        linkedPartners: linkedPartnersByUserId.get(candidate.id) ?? [],
      }),
    );
  }

  /**
   * "Vertical video feed": a discovery surface restricted to candidates who
   * have actual video content (a profile video snippet, or a video answer
   * to a profile prompt) so every card can be swiped directly on video -
   * swiping itself still goes through the normal [recordSwipe], this only
   * changes which candidates are offered and in what order they're shown.
   */
  async getVideoFeed(userId: string): Promise<VideoFeedCard[]> {
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

    const videoAnswers = await this.prisma.profilePromptVideoAnswer.findMany({
      where: { userId: { notIn: excludedIds } },
      distinct: ['userId'],
      orderBy: { createdAt: 'desc' },
    });
    const videoAnswerByUserId = new Map(videoAnswers.map((answer) => [answer.userId, answer]));

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        onboardingCompletedAt: { not: null },
        activeMode: currentUser.activeMode,
        OR: [
          { videoSnippetUrl: { not: null } },
          { id: { in: [...videoAnswerByUserId.keys()] } },
        ],
      },
      take: VIDEO_FEED_SIZE,
    });

    const now = new Date();
    return candidates.map((candidate) => {
      const useSnippet = candidate.videoSnippetUrl != null;
      const promptAnswer = videoAnswerByUserId.get(candidate.id);
      return {
        id: candidate.id,
        name: candidate.name,
        age: candidate.dateOfBirth ? calculateAge(candidate.dateOfBirth, now) : null,
        videoUrl: useSnippet ? candidate.videoSnippetUrl! : promptAnswer!.videoUrl,
        videoSource: useSnippet ? 'SNIPPET' : ('PROMPT_ANSWER' as const),
        promptQuestion: useSnippet ? null : findProfilePrompt(promptAnswer!.promptId)?.question ?? null,
      };
    });
  }

  /**
   * Premium "who liked you": a grid of everyone who has already swiped
   * right (or super-liked) the current user, so they can match instantly
   * instead of waiting to see them in the main deck. Defaults to most
   * recently liked first; pass PROXIMITY or COMPATIBILITY to re-sort the
   * same backlog by distance or compatibility score instead, so a large
   * backlog of likes stays manageable. A non-premium user with a stockpiled
   * a la carte unlock (see PowerUpsService.purchaseSeeWhoLikedYouUnlock)
   * spends one credit per call instead of being blocked outright.
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
      if ((currentUser.bonusSeeWhoLikedYouUnlocks ?? 0) <= 0) {
        throw new ForbiddenException('Seeing who liked you is a premium feature.');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { bonusSeeWhoLikedYouUnlocks: { decrement: 1 } },
      });
    }

    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetUserId: true },
    });
    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const dealbreakerFailedIds = await this.getMandatoryDealbreakerFailedIds(userId);
    const excludedIds = [userId, ...swiped.map((s) => s.targetUserId), ...blockedIds, ...dealbreakerFailedIds];

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
    const linkedPartnersByUserId = await this.getLinkedPartnersByUserIds(
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
        viewerSchool: currentUser.school,
        viewerCommunityGroupIds: currentUser.communityGroupIds,
        mutualConnectionCount: mutualConnectionCounts.get(liker.id) ?? 0,
        linkedPartners: linkedPartnersByUserId.get(liker.id) ?? [],
      }),
    );

    let sorted: DeckCard[];
    if (sortBy === 'PROXIMITY') {
      sorted = [...cards].sort((a, b) => {
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm - b.distanceKm;
      });
    } else if (sortBy === 'COMPATIBILITY') {
      const scores = await Promise.all(
        cards.map((card) => this.matchingService.getCompatibility(userId, card.id)),
      );
      const percentageById = new Map(cards.map((card, index) => [card.id, scores[index].percentage]));
      sorted = [...cards].sort(
        (a, b) => (percentageById.get(b.id) ?? -1) - (percentageById.get(a.id) ?? -1),
      );
    } else {
      sorted = cards;
    }

    // Super Likes now carry a mandatory note or icebreaker response (see
    // recordSwipe) and are meant to stand out from the backlog - pin them to
    // the top of the queue regardless of sort, keeping each group's relative
    // order as the chosen sort produced it.
    return [...sorted.filter((card) => card.isSuperLike), ...sorted.filter((card) => !card.isSuperLike)];
  }

  private toDeckCard(
    candidate: {
      id: string;
      name: string | null;
      dateOfBirth: Date | null;
      profilePhotoUrl: string | null;
      blurPhotosUntilMatch: boolean;
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
      relationshipStructure: string | null;
      showRelationshipStructureOnProfile: boolean;
      kinkTags: string[];
      showKinkTagsOnProfile: boolean;
      heightCm: number | null;
      workoutHabit: string | null;
      petOwnership: string | null;
      petAllergyStatus: string | null;
      smokingHabit: string | null;
      drinkingHabit: string | null;
      showLifestyleBadgesOnProfile: boolean;
      showZodiacOnProfile: boolean;
      loveLanguages: string[];
      showLoveLanguagesOnProfile: boolean;
      attachmentStyle: string | null;
      showAttachmentStyleOnProfile: boolean;
      school: string | null;
      messagesReceivedCount: number;
      messagesRepliedCount: number;
      passportEnabled: boolean;
      communityGroupIds?: string[];
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
      viewerSchool: string | null;
      viewerCommunityGroupIds?: string[];
      mutualConnectionCount: number;
      linkedPartners: LinkedPartnerBadge[];
    },
  ): DeckCard {
    return {
      id: candidate.id,
      name: candidate.name,
      age: candidate.dateOfBirth ? calculateAge(candidate.dateOfBirth, now) : null,
      profilePhotoUrl: candidate.profilePhotoUrl,
      profilePhotoBlurred: candidate.blurPhotosUntilMatch,
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
      sharedCommunityGroups: (candidate.communityGroupIds ?? [])
        .filter((groupId) => (flags.viewerCommunityGroupIds ?? []).includes(groupId))
        .map((groupId) => findCommunityGroup(groupId)?.name)
        .filter((name): name is string => name != null),
      linkedPartners: flags.linkedPartners,
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
      sharedSchool: this.buildSharedSchool(candidate.school, flags.viewerSchool),
      communicationBoundaries: candidate.showCommunicationBoundariesOnProfile
        ? candidate.communicationBoundaries
        : null,
      relationshipStructure: candidate.showRelationshipStructureOnProfile
        ? candidate.relationshipStructure
        : null,
      kinkTagBadges: candidate.showKinkTagsOnProfile ? candidate.kinkTags : [],
      responseRateBadge: this.buildResponseRateBadge(candidate),
      isTraveling: candidate.passportEnabled,
    };
  }

  /**
   * "Very Responsive" / "Responsive" activity badge, based on the share of
   * received messages this candidate has replied to (see
   * MessagingService.trackResponseRate). Requires a minimum message volume
   * so one or two early replies don't produce a misleading label.
   */
  private buildResponseRateBadge(candidate: {
    messagesReceivedCount: number;
    messagesRepliedCount: number;
  }): string | null {
    if (candidate.messagesReceivedCount < MIN_MESSAGES_FOR_RESPONSE_RATE_BADGE) {
      return null;
    }
    const rate = candidate.messagesRepliedCount / candidate.messagesReceivedCount;
    if (rate >= VERY_RESPONSIVE_RATE_THRESHOLD) {
      return 'Very Responsive';
    }
    if (rate >= RESPONSIVE_RATE_THRESHOLD) {
      return 'Responsive';
    }
    return null;
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
    petAllergyStatus: string | null;
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
    if (candidate.petAllergyStatus) {
      badges.push(candidate.petAllergyStatus);
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

  /**
   * "Mutual Friend Network Visualization" - alumni-network half: surfaces
   * the shared school name when the candidate and viewer both claimed the
   * same one, so the app can show "You both went to X" without requiring
   * either side's WorkVerificationService.confirmVerification to have run.
   * Comparison is case/whitespace-insensitive since school is freeform text.
   */
  private buildSharedSchool(candidateSchool: string | null, viewerSchool: string | null): string | null {
    if (!candidateSchool || !viewerSchool) {
      return null;
    }
    return candidateSchool.trim().toLowerCase() === viewerSchool.trim().toLowerCase()
      ? candidateSchool
      : null;
  }

  getPassReasons(): readonly string[] {
    return PASS_REASONS;
  }

  async recordSwipe(
    userId: string,
    targetUserId: string,
    action: string,
    complimentText?: string,
    complimentTarget?: string,
    icebreakerPromptId?: string,
    icebreakerOptionIndex?: number,
    passReason?: string,
    usePriorityLike?: boolean,
  ): Promise<SwipeResult> {
    if (targetUserId === userId) {
      throw new BadRequestException('You cannot swipe on yourself.');
    }

    const isLike = LIKE_ACTIONS.includes(action as (typeof LIKE_ACTIONS)[number]);

    if (usePriorityLike && action !== 'LIKE') {
      throw new BadRequestException('A priority like can only be attached to a regular like.');
    }

    if (complimentText && !isLike) {
      throw new BadRequestException('Compliments can only be attached to a like.');
    }

    if (passReason && action !== 'PASS') {
      throw new BadRequestException('Pass reasons can only be attached to a pass.');
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

    // A Super Like is meant to stand out at the top of the recipient's
    // incoming queue (see getLikedByGrid) - require the attached note or
    // prompt response that makes it worth surfacing prominently.
    if (action === 'SUPER_LIKE' && !complimentText && icebreakerPromptId == null) {
      throw new BadRequestException(
        'A Super Like needs a note or a prompt-response icebreaker attached.',
      );
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
      // Happy Hour: extends today's free allowance rather than granting a
      // separate bucket, so it lapses naturally at midnight like the rest.
      const dailySuperLikeLimit = isHappyHour(new Date())
        ? DAILY_SUPER_LIKE_LIMIT + HAPPY_HOUR_BONUS_SUPER_LIKES
        : DAILY_SUPER_LIKE_LIMIT;
      if (superLikesToday >= dailySuperLikeLimit) {
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

    let isPriorityLike = false;
    if (usePriorityLike) {
      const swiper = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { bonusPriorityLikes: true },
      });
      if (!swiper || swiper.bonusPriorityLikes <= 0) {
        throw new BadRequestException('No priority like credits available. Purchase a priority like pack first.');
      }
      await this.prisma.user.update({
        where: { id: userId },
        data: { bonusPriorityLikes: { decrement: 1 } },
      });
      isPriorityLike = true;
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
        passReason: passReason ?? null,
        isPriorityLike,
      },
    });

    await this.recordPhotoTestOutcome(targetUserId, isLike);

    if (passReason === 'Too far away') {
      const swiper = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { discoveryProximityWeight: true },
      });
      const discoveryProximityWeight = applyPassReasonFeedback(
        swiper?.discoveryProximityWeight ?? DEFAULT_PROXIMITY_WEIGHT,
        passReason,
      );
      await this.prisma.user.update({ where: { id: userId }, data: { discoveryProximityWeight } });
    }

    if (!isLike) {
      return { matched: false };
    }

    if (isHappyHour(new Date())) {
      await this.grantHappyHourBoost(userId);
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

    await this.notifyNewMatch(match.id, userAId, userBId);

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

  /** Notifies both sides of a new match - see NotificationsService for why this is a feed entry, not a push. */
  private async notifyNewMatch(matchId: string, userAId: string, userBId: string): Promise<void> {
    await Promise.all([
      this.notificationsService.notify(userAId, 'NEW_MATCH', "It's a match!", 'You have a new match.', { matchId }),
      this.notificationsService.notify(userBId, 'NEW_MATCH', "It's a match!", 'You have a new match.', { matchId }),
    ]);
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
   * "Incognito" mode: hides the user from the main discovery deck, except
   * for profiles the user has actively liked or super-liked (they remain
   * visible to whoever they've swiped right on). Free for premium
   * subscribers; a non-premium user can also re-enable it here while an
   * a la carte PowerUpsService.purchaseIncognitoPass they bought is still
   * active (purchasing turns it on immediately - this just covers toggling
   * it back on after manually turning it off mid-pass).
   */
  async setIncognitoMode(userId: string, enabled: boolean): Promise<IncognitoResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }
    const hasActiveIncognitoPass =
      currentUser.incognitoPassExpiresAt != null && currentUser.incognitoPassExpiresAt > new Date();
    if (enabled && !currentUser.isPremium && !hasActiveIncognitoPass) {
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

  /** Today's Happy Hour window and whether it's active right now - see [recordSwipe]/[grantHappyHourBoost]. */
  getHappyHourStatus(): HappyHourStatus {
    const now = new Date();
    const { startsAt, endsAt } = computeHappyHourWindow(now);
    return {
      active: isHappyHour(now),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      bonusSuperLikes: HAPPY_HOUR_BONUS_SUPER_LIKES,
      viewMultiplier: HAPPY_HOUR_VIEW_MULTIPLIER,
    };
  }

  /**
   * Happy Hour perk: liking during the daily peak-engagement window grants a
   * temporary visibility Boost on the same mechanism as a purchased one (see
   * activateBoost) - skipped when a boost (paid or otherwise) is already
   * active so this never overwrites it.
   */
  private async grantHappyHourBoost(userId: string): Promise<void> {
    const existing = await this.prisma.boost.findFirst({
      where: { userId, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      return;
    }

    await this.prisma.boost.create({
      data: {
        userId,
        expiresAt: computeBoostExpiresAt(new Date()),
        tier: 'STANDARD',
        viewMultiplier: HAPPY_HOUR_VIEW_MULTIPLIER,
      },
    });
  }

  /**
   * Switches which network the user is browsing/discoverable in (dating,
   * BFF, or Bizz) within the same swipe/match architecture: getDeck only
   * surfaces candidates whose own activeMode currently matches the
   * viewer's, so the three modes stay separate without needing parallel
   * swipe/match data.
   */
  /**
   * Algorithm-driven match quality feedback: the client prompts for a
   * rating every DECK_FEEDBACK_SWIPE_INTERVAL swipes and submits it here.
   * See applyDeckFeedback for how a rating nudges this user's proximity
   * weight, which rankRemainingCandidates applies on the next getDeck call.
   */
  async submitDeckFeedback(userId: string, rating: DeckFeedbackRating): Promise<DeckFeedbackResult> {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { discoveryProximityWeight: true },
    });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const discoveryProximityWeight = applyDeckFeedback(
      currentUser.discoveryProximityWeight ?? DEFAULT_PROXIMITY_WEIGHT,
      rating,
    );

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { discoveryProximityWeight },
    });

    return { discoveryProximityWeight: updated.discoveryProximityWeight };
  }

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
   * "Profile Visibility Schedule": a recurring daily UTC hour window during
   * which this user's card is hidden from other people's swipe decks (see
   * isHiddenByVisibilitySchedule/getDeck) - distinct from the one-off
   * snoozedUntil above, which hides regardless of time of day until turned
   * off or its end date passes.
   */
  async setVisibilitySchedule(
    userId: string,
    enabled: boolean,
    hiddenStartHourUtc?: number,
    hiddenEndHourUtc?: number,
  ): Promise<VisibilityScheduleResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    if (!enabled) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          visibilityScheduleEnabled: false,
          visibilityHiddenStartHourUtc: null,
          visibilityHiddenEndHourUtc: null,
        },
      });
      return { enabled: false, hiddenStartHourUtc: null, hiddenEndHourUtc: null };
    }

    if (hiddenStartHourUtc == null || hiddenEndHourUtc == null) {
      throw new BadRequestException('hiddenStartHourUtc and hiddenEndHourUtc are required when enabling.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        visibilityScheduleEnabled: true,
        visibilityHiddenStartHourUtc: hiddenStartHourUtc,
        visibilityHiddenEndHourUtc: hiddenEndHourUtc,
      },
    });

    return {
      enabled: updated.visibilityScheduleEnabled,
      hiddenStartHourUtc: updated.visibilityHiddenStartHourUtc,
      hiddenEndHourUtc: updated.visibilityHiddenEndHourUtc,
    };
  }

  async getVisibilitySchedule(userId: string): Promise<VisibilityScheduleResult> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    return {
      enabled: currentUser.visibilityScheduleEnabled,
      hiddenStartHourUtc: currentUser.visibilityHiddenStartHourUtc,
      hiddenEndHourUtc: currentUser.visibilityHiddenEndHourUtc,
    };
  }

  /**
   * Dynamic reordering of the non-priority candidate pool: ranks by
   * proximity (closer scores higher, decaying to 0 by
   * PROXIMITY_SCORE_DECAY_KM, then scaled by this viewer's proximityWeight -
   * see submitDeckFeedback/applyDeckFeedback) plus a recent right-swipe
   * "trending" bonus, then trims to the number of slots actually needed.
   * Re-running this on every deck fetch is what makes the order genuinely
   * dynamic as the viewer's location, feedback, or a candidate's recent
   * engagement changes, rather than a fixed DB row order.
   */
  /**
   * Restricts the "remaining" candidate pool to User.searchRadiusKm. If that
   * would leave fewer than MIN_CANDIDATES_BEFORE_RADIUS_EXPANSION and the
   * viewer has auto-expand on, widens the radius for this one fetch only -
   * nothing is persisted, so the next fetch tries the normal radius again
   * first. Candidates with no location set are always kept, matching
   * [proximityScore]'s null handling.
   */
  /** Drops candidates currently inside their own recurring hidden window - see isHiddenByVisibilitySchedule. */
  private filterVisibleBySchedule<
    T extends {
      visibilityScheduleEnabled: boolean;
      visibilityHiddenStartHourUtc: number | null;
      visibilityHiddenEndHourUtc: number | null;
    },
  >(candidates: T[], now: Date): T[] {
    return candidates.filter((candidate) => !isHiddenByVisibilitySchedule(candidate, now));
  }

  private filterWithinRadius<T extends { latitude: number | null; longitude: number | null }>(
    candidates: T[],
    origin: { latitude: number | null; longitude: number | null },
    currentUser: { searchRadiusKm: number; autoExpandRadiusEnabled: boolean },
  ): T[] {
    if (origin.latitude == null || origin.longitude == null) {
      return candidates;
    }

    const radiusKm = currentUser.searchRadiusKm ?? DEFAULT_SEARCH_RADIUS_KM;
    const withinRadius = candidates.filter((candidate) => this.isWithinRadius(origin, candidate, radiusKm));

    const excludedSome = withinRadius.length < candidates.length;
    if (
      excludedSome &&
      withinRadius.length < MIN_CANDIDATES_BEFORE_RADIUS_EXPANSION &&
      currentUser.autoExpandRadiusEnabled
    ) {
      const expandedRadiusKm = Math.min(radiusKm * RADIUS_EXPANSION_MULTIPLIER, MAX_SEARCH_RADIUS_KM);
      return candidates.filter((candidate) => this.isWithinRadius(origin, candidate, expandedRadiusKm));
    }

    return withinRadius;
  }

  private isWithinRadius(
    origin: { latitude: number | null; longitude: number | null },
    candidate: { latitude: number | null; longitude: number | null },
    radiusKm: number,
  ): boolean {
    if (candidate.latitude == null || candidate.longitude == null) {
      return true;
    }
    return (
      haversineDistanceKm(origin.latitude!, origin.longitude!, candidate.latitude, candidate.longitude) <= radiusKm
    );
  }

  private async rankRemainingCandidates<
    T extends { id: string; latitude: number | null; longitude: number | null },
  >(
    candidates: T[],
    origin: { latitude: number | null; longitude: number | null },
    limit: number,
    proximityWeight: number = DEFAULT_PROXIMITY_WEIGHT,
  ): Promise<T[]> {
    if (candidates.length === 0 || limit <= 0) {
      return [];
    }

    const candidateIds = candidates.map((candidate) => candidate.id);
    const recentRightSwipes = await this.prisma.swipe.findMany({
      where: {
        targetUserId: { in: candidateIds },
        action: { in: LIKE_ACTIONS },
        createdAt: { gte: computeTrendingWindowStart(new Date()) },
      },
      select: { targetUserId: true },
    });
    const trendingCounts = new Map<string, number>();
    for (const swipe of recentRightSwipes) {
      trendingCounts.set(swipe.targetUserId, (trendingCounts.get(swipe.targetUserId) ?? 0) + 1);
    }

    const scored = candidates.map((candidate) => ({
      candidate,
      score:
        this.proximityScore(origin, candidate) * proximityWeight +
        Math.min(
          (trendingCounts.get(candidate.id) ?? 0) * TRENDING_BONUS_PER_RIGHT_SWIPE,
          TRENDING_BONUS_CAP,
        ),
    }));
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((entry) => entry.candidate);
  }

  private proximityScore(
    origin: { latitude: number | null; longitude: number | null },
    candidate: { latitude: number | null; longitude: number | null },
  ): number {
    if (
      origin.latitude == null ||
      origin.longitude == null ||
      candidate.latitude == null ||
      candidate.longitude == null
    ) {
      return 0;
    }
    const distanceKm = haversineDistanceKm(
      origin.latitude,
      origin.longitude,
      candidate.latitude,
      candidate.longitude,
    );
    return Math.max(0, PROXIMITY_SCORE_DECAY_KM - distanceKm);
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

  /**
   * "Ethical Non-Monogamy & Poly Partner Linking": every candidate's
   * confirmed PartnerLink(s) (see CouplePairingService.listPartners),
   * batched for a page of deck candidates so each card can show a visible
   * reference to the linked account(s) - a candidate may have more than
   * one link to support polyamorous relationship structures.
   */
  private async getLinkedPartnersByUserIds(
    candidateIds: string[],
  ): Promise<Map<string, LinkedPartnerBadge[]>> {
    if (candidateIds.length === 0) {
      return new Map();
    }

    const links = await this.prisma.partnerLink.findMany({
      where: { OR: [{ userAId: { in: candidateIds } }, { userBId: { in: candidateIds } }] },
    });
    if (links.length === 0) {
      return new Map();
    }

    const partnerIds = [...new Set(links.map((link) => [link.userAId, link.userBId]).flat())];
    const partners = await this.prisma.user.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(partners.map((partner) => [partner.id, partner.name]));

    const byCandidateId = new Map<string, LinkedPartnerBadge[]>();
    for (const link of links) {
      for (const [ownerId, partnerId] of [
        [link.userAId, link.userBId],
        [link.userBId, link.userAId],
      ]) {
        if (!candidateIds.includes(ownerId)) {
          continue;
        }
        const badges = byCandidateId.get(ownerId) ?? [];
        badges.push({ partnerId, partnerName: nameById.get(partnerId) ?? null });
        byCandidateId.set(ownerId, badges);
      }
    }

    return byCandidateId;
  }

  /**
   * "Couple & Group Profile Browsing Switch": when browsing jointly (User.
   * activeBrowsingPartnerId, set via CouplePairingService.
   * setActiveBrowsingPartner), candidates the partner has already swiped on
   * are excluded here too, so the couple's joint deck never repeats a card
   * either side has already acted on. Falls back to no extra exclusions if
   * joint browsing was turned off on the link after the switch was set.
   */
  private async getJointPartnerSwipedIds(userId: string, partnerId: string): Promise<string[]> {
    const link = await this.prisma.partnerLink.findFirst({
      where: {
        jointBrowsingEnabled: true,
        OR: [
          { userAId: userId, userBId: partnerId },
          { userAId: partnerId, userBId: userId },
        ],
      },
    });
    if (!link) {
      return [];
    }

    const partnerSwiped = await this.prisma.swipe.findMany({
      where: { swiperId: partnerId },
      select: { targetUserId: true },
    });
    return partnerSwiped.map((swipe) => swipe.targetUserId);
  }

  /**
   * "Dealbreaker Filter Constraints": a MANDATORY-importance compatibility
   * question (see MatchingService/matching.constants.ts) already zeroes the
   * *displayed* compatibility score when the other side's answer isn't
   * acceptable, but until now that never kept them out of the deck itself -
   * only the fixed lifestyle filters (filterSmokingHabits etc.) actually
   * excluded candidates. This closes that gap by treating a MANDATORY
   * answer the same way: anyone who answered one of the current user's
   * MANDATORY questions with a value outside its acceptableAnswers is
   * excluded outright, everywhere excludedIds is used. Someone who simply
   * hasn't answered the question isn't penalized, matching how
   * MatchingService.satisfaction only scores questions both sides answered.
   */
  private async getMandatoryDealbreakerFailedIds(userId: string): Promise<string[]> {
    const mandatoryAnswers = await this.prisma.questionAnswer.findMany({
      where: { userId, importance: 'MANDATORY' },
      select: { questionId: true, acceptableAnswers: true },
    });
    if (mandatoryAnswers.length === 0) {
      return [];
    }

    const acceptableByQuestion = new Map(
      mandatoryAnswers.map((answer) => [answer.questionId, new Set(answer.acceptableAnswers)]),
    );
    const theirAnswers = await this.prisma.questionAnswer.findMany({
      where: {
        questionId: { in: [...acceptableByQuestion.keys()] },
        userId: { not: userId },
      },
      select: { userId: true, questionId: true, answer: true },
    });

    const failedUserIds = new Set<string>();
    for (const theirAnswer of theirAnswers) {
      const acceptable = acceptableByQuestion.get(theirAnswer.questionId);
      if (acceptable && !acceptable.has(theirAnswer.answer)) {
        failedUserIds.add(theirAnswer.userId);
      }
    }
    return [...failedUserIds];
  }

  private buildLifestyleFilterWhere(currentUser: {
    filterSmokingHabits: string[];
    filterDrinkingHabits: string[];
    filterWorkoutHabits?: string[];
    filterMinHeightCm?: number | null;
    filterMaxHeightCm?: number | null;
    filterEducationLevels: string[];
    filterReligions: string[];
    filterReligiousPracticeLevels?: string[];
    filterDietaryPreferences: string[];
    filterWantsChildren: string[];
    filterRelationshipGoals: string[];
    filterKinkTags?: string[];
    filterRelationshipDesires?: string[];
    filterBoundaryTags?: string[];
    filterPetOwnership?: string[];
    filterPetAllergyStatus?: string[];
    filterPoliticalOrientations?: string[];
    filterSharedInterestsOnly: boolean;
    filterVerifiedOnly?: boolean;
    filterCommunityGroups?: string[];
    filterSameCampusOnly?: boolean;
    interests: string[];
    school: string | null;
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};

    if (currentUser.filterSmokingHabits.length > 0) {
      where.smokingHabit = { in: currentUser.filterSmokingHabits };
    }
    if (currentUser.filterDrinkingHabits.length > 0) {
      where.drinkingHabit = { in: currentUser.filterDrinkingHabits };
    }
    if ((currentUser.filterWorkoutHabits ?? []).length > 0) {
      where.workoutHabit = { in: currentUser.filterWorkoutHabits };
    }
    if (currentUser.filterMinHeightCm != null || currentUser.filterMaxHeightCm != null) {
      where.heightCm = {
        ...(currentUser.filterMinHeightCm != null ? { gte: currentUser.filterMinHeightCm } : {}),
        ...(currentUser.filterMaxHeightCm != null ? { lte: currentUser.filterMaxHeightCm } : {}),
      };
    }
    if (currentUser.filterEducationLevels.length > 0) {
      where.education = { in: currentUser.filterEducationLevels };
    }
    if (currentUser.filterReligions.length > 0) {
      where.religion = { in: currentUser.filterReligions };
    }
    if ((currentUser.filterReligiousPracticeLevels ?? []).length > 0) {
      where.religiousPracticeLevel = { in: currentUser.filterReligiousPracticeLevels };
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
    if ((currentUser.filterBoundaryTags ?? []).length > 0) {
      where.boundaryTags = { hasSome: currentUser.filterBoundaryTags };
    }
    if ((currentUser.filterPetOwnership ?? []).length > 0) {
      where.petOwnership = { in: currentUser.filterPetOwnership };
    }
    if ((currentUser.filterPetAllergyStatus ?? []).length > 0) {
      where.petAllergyStatus = { in: currentUser.filterPetAllergyStatus };
    }
    if ((currentUser.filterPoliticalOrientations ?? []).length > 0) {
      where.politicalOrientation = { in: currentUser.filterPoliticalOrientations };
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
    if (currentUser.filterSameCampusOnly && currentUser.school) {
      where.school = currentUser.school;
      where.isEducationVerified = true;
    }

    return where;
  }
}
