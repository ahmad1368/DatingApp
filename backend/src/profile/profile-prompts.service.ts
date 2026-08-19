import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ProfilePromptResult {
  question: string;
  answer: string;
  position: number;
}

@Injectable()
export class ProfilePromptsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPrompts(userId: string): Promise<ProfilePromptResult[]> {
    const prompts = await this.prisma.profilePrompt.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
    });

    return prompts.map((prompt) => ({
      question: prompt.question,
      answer: prompt.answer,
      position: prompt.position,
    }));
  }

  async setPrompts(
    userId: string,
    prompts: { question: string; answer: string }[],
  ): Promise<ProfilePromptResult[]> {
    const uniqueQuestions = new Set(prompts.map((prompt) => prompt.question));
    if (uniqueQuestions.size !== prompts.length) {
      throw new BadRequestException('Each prompt question can only be used once.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.profilePrompt.deleteMany({ where: { userId } });
      await tx.profilePrompt.createMany({
        data: prompts.map((prompt, index) => ({
          userId,
          question: prompt.question,
          answer: prompt.answer,
          position: index,
        })),
      });

      const saved = await tx.profilePrompt.findMany({
        where: { userId },
        orderBy: { position: 'asc' },
      });

      return saved.map((prompt) => ({
        question: prompt.question,
        answer: prompt.answer,
        position: prompt.position,
      }));
    });
  }
}
