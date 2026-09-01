import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findOpeningQuestion } from './opening-question.constants';

export interface OpeningQuestionView {
  questionId: string | null;
  question: string | null;
}

@Injectable()
export class OpeningQuestionService {
  constructor(private readonly prisma: PrismaService) {}

  async setOpeningQuestion(userId: string, questionId: string): Promise<OpeningQuestionView> {
    const question = findOpeningQuestion(questionId);
    if (!question) {
      throw new BadRequestException('Unknown opening question.');
    }

    await this.prisma.user.update({ where: { id: userId }, data: { openingQuestionId: questionId } });

    return { questionId: question.id, question: question.question };
  }

  async clearOpeningQuestion(userId: string): Promise<{ cleared: boolean }> {
    await this.prisma.user.update({ where: { id: userId }, data: { openingQuestionId: null } });

    return { cleared: true };
  }

  async getOpeningQuestion(targetUserId: string): Promise<OpeningQuestionView> {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { openingQuestionId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (!user.openingQuestionId) {
      return { questionId: null, question: null };
    }

    const question = findOpeningQuestion(user.openingQuestionId);
    return { questionId: question?.id ?? null, question: question?.question ?? null };
  }
}
