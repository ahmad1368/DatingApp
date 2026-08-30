import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_PROXIMITY_WEIGHT } from '../discovery/discovery.constants';
import {
  applyMatchQualityFeedback,
  containsPhoneNumberLikeText,
  daysSince,
  LONG_CHAT_MESSAGE_THRESHOLD,
  MatchQualityRating,
  SURVEY_PROMPT_DELAY_DAYS,
} from './post-match-survey.constants';

export interface PostMatchSurveyView {
  matchId: string;
  metInPerson: boolean;
  matchQuality: string | null;
  createdAt: string;
}

export type SurveyPromptReason = 'PHONE_NUMBER_EXCHANGE' | 'LONG_CHAT_STREAK';

export interface DueSurveyPrompt {
  matchId: string;
  reason: SurveyPromptReason;
  otherUserId: string;
  otherUserName: string | null;
}

interface MessageSignal {
  reason: SurveyPromptReason;
  at: Date;
}

/**
 * A private "did you actually meet up, and was it worthwhile" survey per
 * match, plus the two pieces built on top of it: [listDuePrompts] surfaces
 * a discreet "how did it go?" prompt once a match's chat shows a real sign
 * a date may have happened, and a GREAT/GOOD/OK/POOR answer feeds back into
 * DiscoveryService's ranking via the same discoveryProximityWeight knob
 * pre-date deck feedback uses (see post-match-survey.constants.ts).
 */
@Injectable()
export class PostMatchSurveyService {
  constructor(private readonly prisma: PrismaService) {}

  async submitSurvey(
    userId: string,
    matchId: string,
    metInPerson: boolean,
    matchQuality?: string,
  ): Promise<PostMatchSurveyView> {
    await this.getMatchForUser(userId, matchId);

    if (metInPerson && !matchQuality) {
      throw new BadRequestException('matchQuality is required when you met in person.');
    }
    const effectiveQuality = metInPerson ? (matchQuality ?? null) : null;

    const survey = await this.prisma.postMatchSurvey.upsert({
      where: { matchId_userId: { matchId, userId } },
      create: { matchId, userId, metInPerson, matchQuality: effectiveQuality },
      update: { metInPerson, matchQuality: effectiveQuality },
    });

    if (metInPerson && effectiveQuality) {
      await this.applyAlgorithmTraining(userId, effectiveQuality as MatchQualityRating);
    }

    return this.toView(survey);
  }

  async getMySurvey(userId: string, matchId: string): Promise<PostMatchSurveyView | null> {
    await this.getMatchForUser(userId, matchId);

    const survey = await this.prisma.postMatchSurvey.findUnique({
      where: { matchId_userId: { matchId, userId } },
    });

    return survey ? this.toView(survey) : null;
  }

  /**
   * The "discreet notification" trigger: this codebase has no background
   * job runner, so - like MessagingService's ghosting-prompt flag - this is
   * computed on demand rather than pushed. The client polls it (e.g. on app
   * open) and surfaces a local prompt for whichever matches come back.
   */
  async listDuePrompts(userId: string): Promise<DueSurveyPrompt[]> {
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });
    if (matches.length === 0) {
      return [];
    }
    const matchIds = matches.map((match) => match.id);

    const [messages, existingSurveys] = await Promise.all([
      this.prisma.message.findMany({
        where: { matchId: { in: matchIds } },
        orderBy: { createdAt: 'asc' },
        select: { matchId: true, content: true, createdAt: true },
      }),
      this.prisma.postMatchSurvey.findMany({ where: { matchId: { in: matchIds }, userId } }),
    ]);
    const surveyedMatchIds = new Set(existingSurveys.map((survey) => survey.matchId));

    const messagesByMatch = new Map<string, { content: string | null; createdAt: Date }[]>();
    for (const message of messages) {
      const existing = messagesByMatch.get(message.matchId) ?? [];
      existing.push(message);
      messagesByMatch.set(message.matchId, existing);
    }

    const now = new Date();
    const due: { matchId: string; reason: SurveyPromptReason; otherUserId: string }[] = [];
    for (const match of matches) {
      if (surveyedMatchIds.has(match.id)) {
        continue;
      }
      const signal = this.findSurveySignal(messagesByMatch.get(match.id) ?? []);
      if (!signal || daysSince(signal.at, now) < SURVEY_PROMPT_DELAY_DAYS) {
        continue;
      }
      due.push({
        matchId: match.id,
        reason: signal.reason,
        otherUserId: match.userAId === userId ? match.userBId : match.userAId,
      });
    }
    if (due.length === 0) {
      return [];
    }

    const otherUsers = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(due.map((prompt) => prompt.otherUserId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(otherUsers.map((user) => [user.id, user.name]));

    return due.map((prompt) => ({ ...prompt, otherUserName: nameById.get(prompt.otherUserId) ?? null }));
  }

  /** Earliest of the two prompt signals for a thread, in chronological order. */
  private findSurveySignal(messages: { content: string | null; createdAt: Date }[]): MessageSignal | null {
    const signals: MessageSignal[] = [];

    const phoneNumberMessage = messages.find((message) => containsPhoneNumberLikeText(message.content ?? ''));
    if (phoneNumberMessage) {
      signals.push({ reason: 'PHONE_NUMBER_EXCHANGE', at: phoneNumberMessage.createdAt });
    }
    if (messages.length >= LONG_CHAT_MESSAGE_THRESHOLD) {
      signals.push({ reason: 'LONG_CHAT_STREAK', at: messages[LONG_CHAT_MESSAGE_THRESHOLD - 1].createdAt });
    }
    if (signals.length === 0) {
      return null;
    }

    return signals.reduce((earliest, signal) => (signal.at < earliest.at ? signal : earliest));
  }

  private async applyAlgorithmTraining(userId: string, rating: MatchQualityRating): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { discoveryProximityWeight: true },
    });
    const discoveryProximityWeight = applyMatchQualityFeedback(
      user?.discoveryProximityWeight ?? DEFAULT_PROXIMITY_WEIGHT,
      rating,
    );
    await this.prisma.user.update({ where: { id: userId }, data: { discoveryProximityWeight } });
  }

  private async getMatchForUser(userId: string, matchId: string) {
    const match = await this.prisma.match.findUnique({ where: { id: matchId } });
    if (!match || (match.userAId !== userId && match.userBId !== userId)) {
      throw new NotFoundException('Match not found.');
    }
    return match;
  }

  private toView(survey: {
    matchId: string;
    metInPerson: boolean;
    matchQuality: string | null;
    createdAt: Date;
  }): PostMatchSurveyView {
    return {
      matchId: survey.matchId,
      metInPerson: survey.metInPerson,
      matchQuality: survey.matchQuality,
      createdAt: survey.createdAt.toISOString(),
    };
  }
}
