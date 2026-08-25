import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TRANSCRIPTION_PROVIDER, TranscriptionProvider } from './interfaces/transcription-provider.interface';
import { findProfilePrompt, ProfilePrompt, PROFILE_PROMPTS } from './profile-prompts.constants';

export interface VoicePromptAnswerView {
  promptId: string;
  question: string;
  audioUrl: string;
  durationSeconds: number;
  transcript: string | null;
  createdAt: string;
}

export interface VideoPromptAnswerView {
  promptId: string;
  question: string;
  videoUrl: string;
  durationSeconds: number;
  createdAt: string;
}

@Injectable()
export class ProfilePromptsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly transcriptionProvider: TranscriptionProvider,
  ) {}

  getPrompts(): ProfilePrompt[] {
    return PROFILE_PROMPTS;
  }

  /**
   * Records or re-records the current user's voice answer to a prompt (one
   * answer per prompt). Also generates a caption/transcript for
   * accessibility and silent browsing - a transcription failure never blocks
   * saving the recording itself, it just leaves the transcript null.
   */
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

    const transcript = await this.transcribeSafely(audioUrl);

    const answer = await this.prisma.profilePromptVoiceAnswer.upsert({
      where: { userId_promptId: { userId, promptId } },
      create: { userId, promptId, audioUrl, durationSeconds, transcript },
      update: { audioUrl, durationSeconds, transcript },
    });

    return this.toView(answer, prompt);
  }

  private async transcribeSafely(audioUrl: string): Promise<string | null> {
    try {
      return await this.transcriptionProvider.transcribe(audioUrl);
    } catch {
      return null;
    }
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

  /**
   * Records or re-records the current user's short video answer to a prompt
   * (one answer per prompt, independent of any voice answer to the same
   * prompt).
   */
  async recordVideoAnswer(
    userId: string,
    promptId: string,
    videoUrl: string,
    durationSeconds: number,
  ): Promise<VideoPromptAnswerView> {
    const prompt = findProfilePrompt(promptId);
    if (!prompt) {
      throw new BadRequestException('Unknown profile prompt.');
    }

    const answer = await this.prisma.profilePromptVideoAnswer.upsert({
      where: { userId_promptId: { userId, promptId } },
      create: { userId, promptId, videoUrl, durationSeconds },
      update: { videoUrl, durationSeconds },
    });

    return this.toVideoView(answer, prompt);
  }

  async getVideoAnswers(userId: string): Promise<VideoPromptAnswerView[]> {
    const answers = await this.prisma.profilePromptVideoAnswer.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    const views: VideoPromptAnswerView[] = [];
    for (const answer of answers) {
      const prompt = findProfilePrompt(answer.promptId);
      if (!prompt) {
        continue;
      }
      views.push(this.toVideoView(answer, prompt));
    }
    return views;
  }

  async deleteVideoAnswer(userId: string, promptId: string): Promise<void> {
    const answer = await this.prisma.profilePromptVideoAnswer.findUnique({
      where: { userId_promptId: { userId, promptId } },
    });
    if (!answer) {
      throw new NotFoundException('Video answer not found.');
    }

    await this.prisma.profilePromptVideoAnswer.delete({
      where: { userId_promptId: { userId, promptId } },
    });
  }

  private toVideoView(
    answer: { promptId: string; videoUrl: string; durationSeconds: number; createdAt: Date },
    prompt: ProfilePrompt,
  ): VideoPromptAnswerView {
    return {
      promptId: answer.promptId,
      question: prompt.question,
      videoUrl: answer.videoUrl,
      durationSeconds: answer.durationSeconds,
      createdAt: answer.createdAt.toISOString(),
    };
  }

  private toView(
    answer: {
      promptId: string;
      audioUrl: string;
      durationSeconds: number;
      transcript?: string | null;
      createdAt: Date;
    },
    prompt: ProfilePrompt,
  ): VoicePromptAnswerView {
    return {
      promptId: answer.promptId,
      question: prompt.question,
      audioUrl: answer.audioUrl,
      durationSeconds: answer.durationSeconds,
      transcript: answer.transcript ?? null,
      createdAt: answer.createdAt.toISOString(),
    };
  }
}
