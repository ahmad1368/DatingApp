import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { getBlockedUserIds } from '../blocking/blocking.utils';
import { LIKE_ACTIONS } from '../discovery/discovery.constants';
import { calculateAge } from '../discovery/utils/age';
import {
  CANDIDATE_POOL_SIZE,
  DAILY_PICKS_LIMIT,
  STANDOUT_ENGAGEMENT_BONUS_CAP,
  STANDOUT_ENGAGEMENT_BONUS_PER_LIKE,
  STANDOUT_ENGAGEMENT_THRESHOLD,
  computeEngagementWindowStart,
  computeWindowStart,
} from './curated-profiles.constants';

export interface CuratedProfile {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  compatibilityPercentage: number | null;
  isStandout: boolean;
}

interface DailyPickRecord {
  candidateId: string;
  compatibilityScore: number | null;
}

@Injectable()
export class CuratedProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
  ) {}

  /**
   * A pick that's already been rated (via the normal swipe endpoint - rating
   * a curated pick is just a regular Like/Pass swipe) drops out of the
   * batch for the rest of the window, so the user must act on all of
   * today's picks before the next 24-hour cycle brings new ones.
   */
  async getDailyPicks(userId: string): Promise<CuratedProfile[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const windowStart = computeWindowStart(new Date());
    const swipedTargetIds = await this.getSwipedTargetIds(userId);

    let picks: DailyPickRecord[] = await this.prisma.dailyPick.findMany({
      where: { userId, windowStart },
      orderBy: { compatibilityScore: 'desc' },
      select: { candidateId: true, compatibilityScore: true },
    });

    if (picks.length === 0) {
      picks = await this.generatePicks(userId, windowStart, swipedTargetIds);
    }

    const unratedPicks = picks.filter((pick) => !swipedTargetIds.has(pick.candidateId));
    if (unratedPicks.length === 0) {
      return [];
    }

    return this.toCuratedProfiles(unratedPicks);
  }

  private async getSwipedTargetIds(userId: string): Promise<Set<string>> {
    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetUserId: true },
    });
    return new Set(swiped.map((s) => s.targetUserId));
  }

  private async generatePicks(
    userId: string,
    windowStart: Date,
    swipedTargetIds: Set<string>,
  ): Promise<DailyPickRecord[]> {
    const blockedIds = await getBlockedUserIds(this.prisma, userId);
    const excludedIds = [userId, ...swipedTargetIds, ...blockedIds];

    // Mirrors DiscoveryService.getDeck: an incognito user stays out of this
    // curated batch too, unless they've already liked the viewer.
    const likersOfMe = await this.prisma.swipe.findMany({
      where: { targetUserId: userId, action: { in: LIKE_ACTIONS }, swiperId: { notIn: excludedIds } },
      select: { swiperId: true },
    });
    const likedMeIds = likersOfMe.map((s) => s.swiperId);

    const now = new Date();
    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        onboardingCompletedAt: { not: null },
        AND: [
          { OR: [{ incognitoEnabled: false }, { id: { in: likedMeIds } }] },
          { OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }] },
        ],
      },
      take: CANDIDATE_POOL_SIZE,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return [];
    }

    const candidateIds = candidates.map((candidate) => candidate.id);
    const engagementCounts = await this.getEngagementCounts(candidateIds);

    const scored = await Promise.all(
      candidates.map(async (candidate) => ({
        candidateId: candidate.id,
        compatibilityScore: (await this.matchingService.getCompatibility(userId, candidate.id))
          .percentage,
      })),
    );

    // Rank by compatibility first, but give a swipe-engagement bonus so
    // candidates who are highly liked by others ("standouts") surface too,
    // without letting engagement alone override a poor compatibility match.
    scored.sort((a, b) => {
      const scoreA = (a.compatibilityScore ?? -1) + this.engagementBonus(engagementCounts.get(a.candidateId) ?? 0);
      const scoreB = (b.compatibilityScore ?? -1) + this.engagementBonus(engagementCounts.get(b.candidateId) ?? 0);
      return scoreB - scoreA;
    });
    const top = scored.slice(0, DAILY_PICKS_LIMIT);

    await this.prisma.dailyPick.createMany({
      data: top.map((pick) => ({
        userId,
        candidateId: pick.candidateId,
        windowStart,
        compatibilityScore: pick.compatibilityScore,
      })),
      skipDuplicates: true,
    });

    return top;
  }

  private async toCuratedProfiles(picks: DailyPickRecord[]): Promise<CuratedProfile[]> {
    const candidateIds = picks.map((pick) => pick.candidateId);
    const [candidates, engagementCounts] = await Promise.all([
      this.prisma.user.findMany({ where: { id: { in: candidateIds } } }),
      this.getEngagementCounts(candidateIds),
    ]);
    const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const now = new Date();

    const profiles: CuratedProfile[] = [];
    for (const pick of picks) {
      const candidate = candidateById.get(pick.candidateId);
      if (!candidate) {
        continue;
      }
      profiles.push({
        id: candidate.id,
        name: candidate.name,
        age: candidate.dateOfBirth ? calculateAge(candidate.dateOfBirth, now) : null,
        profilePhotoUrl: candidate.profilePhotoUrl,
        compatibilityPercentage: pick.compatibilityScore,
        isStandout: (engagementCounts.get(pick.candidateId) ?? 0) >= STANDOUT_ENGAGEMENT_THRESHOLD,
      });
    }
    return profiles;
  }

  /** Recent like/super-like counts received by each candidate, used both to
   *  rank the daily batch and to flag standouts once the picks are read. */
  private async getEngagementCounts(candidateIds: string[]): Promise<Map<string, number>> {
    if (candidateIds.length === 0) {
      return new Map();
    }

    const recentLikes = await this.prisma.swipe.findMany({
      where: {
        targetUserId: { in: candidateIds },
        action: { in: LIKE_ACTIONS },
        createdAt: { gte: computeEngagementWindowStart(new Date()) },
      },
      select: { targetUserId: true },
    });

    const counts = new Map<string, number>();
    for (const like of recentLikes) {
      counts.set(like.targetUserId, (counts.get(like.targetUserId) ?? 0) + 1);
    }
    return counts;
  }

  private engagementBonus(likeCount: number): number {
    return Math.min(likeCount * STANDOUT_ENGAGEMENT_BONUS_PER_LIKE, STANDOUT_ENGAGEMENT_BONUS_CAP);
  }
}
