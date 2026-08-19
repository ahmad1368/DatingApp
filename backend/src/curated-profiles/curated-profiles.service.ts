import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { calculateAge } from '../discovery/utils/age';
import { CANDIDATE_POOL_SIZE, DAILY_PICKS_LIMIT, computeWindowStart } from './curated-profiles.constants';

export interface CuratedProfile {
  id: string;
  name: string | null;
  age: number | null;
  profilePhotoUrl: string | null;
  compatibilityPercentage: number | null;
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

  async getDailyPicks(userId: string): Promise<CuratedProfile[]> {
    const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      throw new NotFoundException('User not found.');
    }

    const windowStart = computeWindowStart(new Date());

    let picks: DailyPickRecord[] = await this.prisma.dailyPick.findMany({
      where: { userId, windowStart },
      orderBy: { compatibilityScore: 'desc' },
      select: { candidateId: true, compatibilityScore: true },
    });

    if (picks.length === 0) {
      picks = await this.generatePicks(userId, windowStart);
    }

    if (picks.length === 0) {
      return [];
    }

    return this.toCuratedProfiles(picks);
  }

  private async generatePicks(userId: string, windowStart: Date): Promise<DailyPickRecord[]> {
    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetUserId: true },
    });
    const excludedIds = [userId, ...swiped.map((s) => s.targetUserId)];

    const candidates = await this.prisma.user.findMany({
      where: {
        id: { notIn: excludedIds },
        onboardingCompletedAt: { not: null },
      },
      take: CANDIDATE_POOL_SIZE,
      select: { id: true },
    });

    if (candidates.length === 0) {
      return [];
    }

    const scored = await Promise.all(
      candidates.map(async (candidate) => ({
        candidateId: candidate.id,
        compatibilityScore: (await this.matchingService.getCompatibility(userId, candidate.id))
          .percentage,
      })),
    );

    scored.sort((a, b) => (b.compatibilityScore ?? -1) - (a.compatibilityScore ?? -1));
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
    const candidates = await this.prisma.user.findMany({
      where: { id: { in: picks.map((pick) => pick.candidateId) } },
    });
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
      });
    }
    return profiles;
  }
}
