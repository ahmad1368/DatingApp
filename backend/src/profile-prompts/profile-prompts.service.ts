import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { findProfilePrompt, ProfilePrompt, PROFILE_PROMPTS } from './profile-prompts.constants';

export interface VoicePromptAnswerView {
  promptId: string;
  question: string;
  audioUrl: string;
  durationSeconds: number;
  createdAt: string;
}

@Injectable()
export class ProfilePromptsService {
  constructor(private readonly prisma: PrismaService) {}

  getPrompts(): ProfilePrompt[] {
    return PROFILE_PROMPTS;
  }

  /** Records or re-records the current user's voice answer to a prompt (one answer per prompt). */
  async recordAnswer(
    userId: string,
    promptId: string,
    audioUrl: string,
    durationSeconds: number,
  ): Promise<VoicePromptAnswerView> {
    const prompt = findProfilePrompt(promptId);
    if (!prompt) {
      throw new BadRequestException('Unknown profile prompt.');
    }

    const answer = await this.prisma.profilePromptVoiceAnswer.upsert({
      where: { userId_promptId: { userId, promptId } },
      create: { userId, promptId, audioUrl, durationSeconds },
      update: { audioUrl, durationSeconds },
    });

    return this.toView(answer, prompt);
  }

  async getAnswers(userId: string): Promise<VoicePromptAnswerView[]> {
    const answers = await this.prisma.profilePromptVoiceAnswer.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    const views: VoicePromptAnswerView[] = [];
    for (const answer of answers) {
      const prompt = findProfilePrompt(answer.promptId);
      if (!prompt) {
        continue;
      }
      views.push(this.toView(answer, prompt));
    }
    return views;
  }

  async deleteAnswer(userId: string, promptId: string): Promise<void> {
    const answer = await this.prisma.profilePromptVoiceAnswer.findUnique({
      where: { userId_promptId: { userId, promptId } },
    });
    if (!answer) {
      throw new NotFoundException('Voice answer not found.');
    }

    await this.prisma.profilePromptVoiceAnswer.delete({
      where: { userId_promptId: { userId, promptId } },
    });
  }

  private toView(
    answer: { promptId: string; audioUrl: string; durationSeconds: number; createdAt: Date },
    prompt: ProfilePrompt,
  ): VoicePromptAnswerView {
    return {
      promptId: answer.promptId,
      question: prompt.question,
      audioUrl: answer.audioUrl,
      durationSeconds: answer.durationSeconds,
      createdAt: answer.createdAt.toISOString(),
    };
  }
}
