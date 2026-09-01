import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LIKE_ACTIONS } from '../discovery/discovery.constants';

/**
 * Self-facing "Post-Match Conversion Analytics Dashboard": how often this
 * user's likes turn into matches, and how quickly they send the first
 * message once matched. Like PASS_REASONS elsewhere in this codebase, this
 * is captured/surfaced signal only - there's no retraining pipeline in this
 * codebase to actually feed it back into ranking, unlike
 * discoveryProximityWeight's deck-feedback loop.
 */
export interface MatchInsightsView {
  totalLikesSent: number;
  totalMatches: number;
  /** totalMatches / totalLikesSent - null until the user has sent a like. */
  likeAcceptanceRate: number | null;
  /**
   * Average seconds between a match forming and this user's first message
   * in it, across matches where they've sent at least one - null until
   * they have.
   */
  averageMessageInitiationSeconds: number | null;
}

@Injectable()
export class MatchAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMatchInsights(userId: string): Promise<MatchInsightsView> {
    const totalLikesSent = await this.prisma.swipe.count({
      where: { swiperId: userId, action: { in: LIKE_ACTIONS } },
    });

    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { id: true, createdAt: true },
    });

    const likeAcceptanceRate = totalLikesSent > 0 ? matches.length / totalLikesSent : null;

    if (matches.length === 0) {
      return {
        totalLikesSent,
        totalMatches: 0,
        likeAcceptanceRate,
        averageMessageInitiationSeconds: null,
      };
    }

    const messagesSentInThoseMatches = await this.prisma.message.findMany({
      where: { matchId: { in: matches.map((match) => match.id) }, senderId: userId },
      orderBy: { createdAt: 'asc' },
      select: { matchId: true, createdAt: true },
    });
    const firstMessageAtByMatchId = new Map<string, Date>();
    for (const message of messagesSentInThoseMatches) {
      if (!firstMessageAtByMatchId.has(message.matchId)) {
        firstMessageAtByMatchId.set(message.matchId, message.createdAt);
      }
    }

    const initiationDelaysSeconds: number[] = [];
    for (const match of matches) {
      const firstMessageAt = firstMessageAtByMatchId.get(match.id);
      if (firstMessageAt) {
        initiationDelaysSeconds.push((firstMessageAt.getTime() - match.createdAt.getTime()) / 1000);
      }
    }

    return {
      totalLikesSent,
      totalMatches: matches.length,
      likeAcceptanceRate,
      averageMessageInitiationSeconds:
        initiationDelaysSeconds.length > 0
          ? initiationDelaysSeconds.reduce((sum, delay) => sum + delay, 0) / initiationDelaysSeconds.length
          : null,
    };
  }
}
