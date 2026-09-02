import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { findProfilePrompt } from '../profile-prompts/profile-prompts.constants';
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
      matchProfilePromptAnswers: matchOverlap?.profilePromptAnswers ?? [],
    };

    return this.coachProvider.generateSuggestions(context);
  }

  /** Just the opening-line suggestions from [getTips], for embedding inline in a chat thread. */
  async getIcebreakerSuggestions(userId: string, matchId: string): Promise<string[]> {
    const { conversationOpeners } = await this.getTips(userId, matchId);
    return conversationOpeners;
  }

  /**
   * "In-Chat AI Smart Reply Suggestions": short, tappable reply options for
   * the other side's most recent message - the mid-conversation
   * counterpart to [getIcebreakerSuggestions], which only helps start one.
   * Empty (rather than an error) when there's nothing to reply to yet: no
   * messages, the caller sent the last one, or it has no text content
   * (e.g. an image/GIF).
   */
  async getSmartReplies(userId: string, matchId: string): Promise<string[]> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }

    const lastMessage = await this.prisma.message.findFirst({
      where: { matchId },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastMessage || lastMessage.senderId === userId || !lastMessage.content) {
      return [];
    }

    return this.coachProvider.generateSmartReplies(lastMessage.content);
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
   * The three halves of what makes a good, specific opener: shared *stated*
   * interests, shared *questionnaire* overlap (how many compatibility
   * questions both sides answered, and how compatible those answers are)
   * via MatchingService.getCompatibility, and the match's own profile
   * prompt answers to reference directly.
   */
  private async matchOverlapForMatch(
    userId: string,
    matchId: string,
    userInterests: string[],
  ): Promise<{
    sharedInterests: string[];
    sharedQuestionCount: number;
    compatibilityPercentage: number | null;
    profilePromptAnswers: { question: string; answer: string }[];
  }> {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }

    const otherUserId = match.userAId === userId ? match.userBId : match.userAId;
    const [otherUser, compatibility, voicePromptAnswers] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: otherUserId } }),
      this.matchingService.getCompatibility(userId, otherUserId),
      this.prisma.profilePromptVoiceAnswer.findMany({ where: { userId: otherUserId } }),
    ]);

    const otherInterests = new Set(otherUser?.interests ?? []);
    const sharedInterests = userInterests.filter((interest) => otherInterests.has(interest));

    const profilePromptAnswers: { question: string; answer: string }[] = [];
    for (const answer of voicePromptAnswers) {
      const prompt = findProfilePrompt(answer.promptId);
      if (prompt && answer.transcript) {
        profilePromptAnswers.push({ question: prompt.question, answer: answer.transcript });
      }
    }

    return {
      sharedInterests,
      sharedQuestionCount: compatibility.sharedQuestionCount,
      compatibilityPercentage: compatibility.percentage,
      profilePromptAnswers,
    };
  }
}
