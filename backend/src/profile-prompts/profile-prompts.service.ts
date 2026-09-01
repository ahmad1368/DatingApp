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

export interface TextPromptAnswerView {
  promptId: string;
  question: string;
  answer: string;
  createdAt: string;
}

export interface VoicePromptReactionView {
  id: string;
  fromUserId: string;
  toUserId: string;
  promptId: string | null;
  photoId: string | null;
  comment: string | null;
  audioReplyUrl: string | null;
  durationSeconds: number | null;
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
   * Reacts to someone else's voice prompt answer with a text comment, a
   * recorded audio reply, or both - a direct, targeted counterpart to the
   * generic profile-item like/comment (ProfileItemLikeService), scoped to
   * one specific prompt rather than the whole profile.
   */
  async reactToVoicePrompt(
    fromUserId: string,
    toUserId: string,
    promptId: string,
    comment?: string,
    audioReplyUrl?: string,
    durationSeconds?: number,
  ): Promise<VoicePromptReactionView> {
    if (fromUserId === toUserId) {
      throw new BadRequestException('You cannot react to your own voice prompt.');
    }
    if (!comment && !audioReplyUrl) {
      throw new BadRequestException('Include a comment, an audio reply, or both.');
    }

    const targetAnswer = await this.prisma.profilePromptVoiceAnswer.findUnique({
      where: { userId_promptId: { userId: toUserId, promptId } },
    });
    if (!targetAnswer) {
      throw new NotFoundException('This user has no voice answer for that prompt.');
    }

    const reaction = await this.prisma.voicePromptReaction.create({
      data: {
        fromUserId,
        toUserId,
        promptId,
        comment: comment ?? null,
        audioReplyUrl: audioReplyUrl ?? null,
        durationSeconds: durationSeconds ?? null,
      },
    });

    return this.toReactionView(reaction);
  }

  /** Reactions received on one of the caller's own voice prompt answers. */
  async listReactions(userId: string, promptId: string): Promise<VoicePromptReactionView[]> {
    const reactions = await this.prisma.voicePromptReaction.findMany({
      where: { toUserId: userId, promptId },
      orderBy: { createdAt: 'desc' },
    });

    return reactions.map((reaction) => this.toReactionView(reaction));
  }

  /**
   * Reacts to one of someone else's profile photos with a text comment, a
   * recorded audio reply, or both - the same targeted reaction mechanism as
   * [reactToVoicePrompt], scoped to a specific photo instead of a specific
   * voice prompt answer.
   */
  async reactToPhoto(
    fromUserId: string,
    toUserId: string,
    photoId: string,
    comment?: string,
    audioReplyUrl?: string,
    durationSeconds?: number,
  ): Promise<VoicePromptReactionView> {
    if (fromUserId === toUserId) {
      throw new BadRequestException('You cannot react to your own photo.');
    }
    if (!comment && !audioReplyUrl) {
      throw new BadRequestException('Include a comment, an audio reply, or both.');
    }

    const targetPhoto = await this.prisma.profilePhoto.findUnique({ where: { id: photoId } });
    if (!targetPhoto || targetPhoto.ownerId !== toUserId) {
      throw new NotFoundException('This user has no photo with that id.');
    }

    const reaction = await this.prisma.voicePromptReaction.create({
      data: {
        fromUserId,
        toUserId,
        photoId,
        comment: comment ?? null,
        audioReplyUrl: audioReplyUrl ?? null,
        durationSeconds: durationSeconds ?? null,
      },
    });

    return this.toReactionView(reaction);
  }

  /** Reactions received on one of the caller's own profile photos. */
  async listPhotoReactions(userId: string, photoId: string): Promise<VoicePromptReactionView[]> {
    const reactions = await this.prisma.voicePromptReaction.findMany({
      where: { toUserId: userId, photoId },
      orderBy: { createdAt: 'desc' },
    });

    return reactions.map((reaction) => this.toReactionView(reaction));
  }

  private toReactionView(reaction: {
    id: string;
    fromUserId: string;
    toUserId: string;
    promptId: string | null;
    photoId: string | null;
    comment: string | null;
    audioReplyUrl: string | null;
    durationSeconds: number | null;
    createdAt: Date;
  }): VoicePromptReactionView {
    return {
      id: reaction.id,
      fromUserId: reaction.fromUserId,
      toUserId: reaction.toUserId,
      promptId: reaction.promptId,
      photoId: reaction.photoId,
      comment: reaction.comment,
      audioReplyUrl: reaction.audioReplyUrl,
      durationSeconds: reaction.durationSeconds,
      createdAt: reaction.createdAt.toISOString(),
    };
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

  /**
   * Records or re-records the current user's written answer to a prompt
   * (one answer per prompt), independent of any voice/video answer to the
   * same prompt.
   */
  async recordTextAnswer(userId: string, promptId: string, answer: string): Promise<TextPromptAnswerView> {
    const prompt = findProfilePrompt(promptId);
    if (!prompt) {
      throw new BadRequestException('Unknown profile prompt.');
    }

    const saved = await this.prisma.profilePromptTextAnswer.upsert({
      where: { userId_promptId: { userId, promptId } },
      create: { userId, promptId, answer },
      update: { answer },
    });

    return this.toTextView(saved, prompt);
  }

  async getTextAnswers(userId: string): Promise<TextPromptAnswerView[]> {
    const answers = await this.prisma.profilePromptTextAnswer.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    const views: TextPromptAnswerView[] = [];
    for (const answer of answers) {
      const prompt = findProfilePrompt(answer.promptId);
      if (!prompt) {
        continue;
      }
      views.push(this.toTextView(answer, prompt));
    }
    return views;
  }

  async deleteTextAnswer(userId: string, promptId: string): Promise<void> {
    const answer = await this.prisma.profilePromptTextAnswer.findUnique({
      where: { userId_promptId: { userId, promptId } },
    });
    if (!answer) {
      throw new NotFoundException('Text answer not found.');
    }

    await this.prisma.profilePromptTextAnswer.delete({
      where: { userId_promptId: { userId, promptId } },
    });
  }

  private toTextView(
    answer: { promptId: string; answer: string; createdAt: Date },
    prompt: ProfilePrompt,
  ): TextPromptAnswerView {
    return {
      promptId: answer.promptId,
      question: prompt.question,
      answer: answer.answer,
      createdAt: answer.createdAt.toISOString(),
    };
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
