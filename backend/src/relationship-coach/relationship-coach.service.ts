import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import {
  AI_COACH_PROVIDER,
  AiCoachProvider,
  CoachEngagementContext,
  CoachSuggestions,
} from './interfaces/ai-coach-provider.interface';

interface ProfileCompletenessFields {
  profilePhotoUrl: string | null;
  interests: string[];
  voiceIntroUrl: string | null;
  videoSnippetUrl: string | null;
  kinkTags: string[];
  loveLanguages: string[];
}

@Injectable()
export class RelationshipCoachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matchingService: MatchingService,
    @Inject(AI_COACH_PROVIDER) private readonly coachProvider: AiCoachProvider,
  ) {}

  async getTips(userId: string, matchId?: string): Promise<CoachSuggestions> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      include: { messages: true },
    });

    let staleMatchesCount = 0;
    let messagesSent = 0;
    let messagesReceived = 0;
    for (const match of matches) {
      if (match.messages.length === 0) {
        staleMatchesCount += 1;
      }
      for (const message of match.messages) {
        if (message.senderId === userId) {
          messagesSent += 1;
        } else {
          messagesReceived += 1;
        }
      }
    }

    const matchOverlap = matchId ? await this.matchOverlapForMatch(userId, matchId, user.interests) : null;

    const context: CoachEngagementContext = {
      totalMatches: matches.length,
      staleMatchesCount,
      messagesSent,
      messagesReceived,
      missingProfileFields: this.findMissingProfileFields(user),
      sharedInterestsWithMatch: matchOverlap?.sharedInterests ?? [],
      sharedQuestionCount: matchOverlap?.sharedQuestionCount ?? 0,
      compatibilityPercentage: matchOverlap?.compatibilityPercentage ?? null,
    };

    return this.coachProvider.generateSuggestions(context);
  }

  /** Just the opening-line suggestions from [getTips], for embedding inline in a chat thread. */
  async getIcebreakerSuggestions(userId: string, matchId: string): Promise<string[]> {
    const { conversationOpeners } = await this.getTips(userId, matchId);
    return conversationOpeners;
  }

  private findMissingProfileFields(user: ProfileCompletenessFields): string[] {
    const missing: string[] = [];
    if (!user.profilePhotoUrl) {
      missing.push('profile photo');
    }
    if (user.interests.length === 0) {
      missing.push('interests');
    }
    if (!user.voiceIntroUrl) {
      missing.push('voice intro');
    }
    if (!user.videoSnippetUrl) {
      missing.push('video snippet');
    }
    if (user.kinkTags.length === 0) {
      missing.push('kink tags');
    }
    if (user.loveLanguages.length === 0) {
      missing.push('love languages');
    }
    return missing;
  }

  /**
   * Both halves of what makes a good opener: shared *stated* interests, plus
   * shared *questionnaire* overlap (how many compatibility questions both
   * sides answered, and how compatible those answers are) via
   * MatchingService.getCompatibility.
   */
  private async matchOverlapForMatch(
    userId: string,
    matchId: string,
    userInterests: string[],
  ): Promise<{ sharedInterests: string[]; sharedQuestionCount: number; compatibilityPercentage: number | null }> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }

    const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
    const [otherUser, compatibility] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: otherUserId } }),
      this.matchingService.getCompatibility(userId, otherUserId),
    ]);

    const otherInterests = new Set(otherUser?.interests ?? []);
    const sharedInterests = userInterests.filter((interest) => otherInterests.has(interest));

    return {
      sharedInterests,
      sharedQuestionCount: compatibility.sharedQuestionCount,
      compatibilityPercentage: compatibility.percentage,
    };
  }
}
