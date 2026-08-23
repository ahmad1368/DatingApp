import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PostMatchSurveyView {
  matchId: string;
  metInPerson: boolean;
  matchQuality: string | null;
  createdAt: string;
}

/**
 * A private "did you actually meet up, and was it worthwhile" survey per
 * match. Kept as a standalone signal for now - feeding it back into
 * ranking/recommendation logic is a separate future concern, not this
 * issue's job.
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

    return this.toView(survey);
  }

  async getMySurvey(userId: string, matchId: string): Promise<PostMatchSurveyView | null> {
    await this.getMatchForUser(userId, matchId);

    const survey = await this.prisma.postMatchSurvey.findUnique({
      where: { matchId_userId: { matchId, userId } },
    });

    return survey ? this.toView(survey) : null;
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
