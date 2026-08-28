import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TranscriptionProvider } from './interfaces/transcription-provider.interface';
import { ProfilePromptsService } from './profile-prompts.service';
import { PROFILE_PROMPTS } from './profile-prompts.constants';

const USER_ID = 'user-1';

describe('ProfilePromptsService', () => {
  let service: ProfilePromptsService;
  let prisma: {
    profilePromptVoiceAnswer: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    profilePromptVideoAnswer: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    voicePromptReaction: {
      create: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let transcriptionProvider: { transcribe: jest.Mock };

  beforeEach(() => {
    prisma = {
      profilePromptVoiceAnswer: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      profilePromptVideoAnswer: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      voicePromptReaction: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };
    transcriptionProvider = { transcribe: jest.fn().mockResolvedValue('a transcript') };
    service = new ProfilePromptsService(
      prisma as unknown as PrismaService,
      transcriptionProvider as unknown as TranscriptionProvider,
    );
  });

  describe('getPrompts', () => {
    it('returns the static prompt catalog', () => {
      expect(service.getPrompts()).toEqual(PROFILE_PROMPTS);
    });
  });

  describe('recordAnswer', () => {
    it('rejects an unknown prompt', async () => {
      await expect(
        service.recordAnswer(USER_ID, 'not-a-real-prompt', 'file:///a.m4a', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.profilePromptVoiceAnswer.upsert).not.toHaveBeenCalled();
    });

    it('upserts the voice answer with its generated transcript', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      transcriptionProvider.transcribe.mockResolvedValue('a transcript');
      prisma.profilePromptVoiceAnswer.upsert.mockResolvedValue({
        promptId,
        audioUrl: 'file:///a.m4a',
        durationSeconds: 12,
        transcript: 'a transcript',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.recordAnswer(USER_ID, promptId, 'file:///a.m4a', 12);

      expect(transcriptionProvider.transcribe).toHaveBeenCalledWith('file:///a.m4a');
      expect(prisma.profilePromptVoiceAnswer.upsert).toHaveBeenCalledWith({
        where: { userId_promptId: { userId: USER_ID, promptId } },
        create: {
          userId: USER_ID,
          promptId,
          audioUrl: 'file:///a.m4a',
          durationSeconds: 12,
          transcript: 'a transcript',
        },
        update: { audioUrl: 'file:///a.m4a', durationSeconds: 12, transcript: 'a transcript' },
      });
      expect(result).toEqual({
        promptId,
        question: PROFILE_PROMPTS[0].question,
        audioUrl: 'file:///a.m4a',
        durationSeconds: 12,
        transcript: 'a transcript',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('saves the answer with a null transcript when transcription fails', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      transcriptionProvider.transcribe.mockRejectedValue(new Error('service unavailable'));
      prisma.profilePromptVoiceAnswer.upsert.mockResolvedValue({
        promptId,
        audioUrl: 'file:///a.m4a',
        durationSeconds: 12,
        transcript: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.recordAnswer(USER_ID, promptId, 'file:///a.m4a', 12);

      expect(prisma.profilePromptVoiceAnswer.upsert).toHaveBeenCalledWith({
        where: { userId_promptId: { userId: USER_ID, promptId } },
        create: {
          userId: USER_ID,
          promptId,
          audioUrl: 'file:///a.m4a',
          durationSeconds: 12,
          transcript: null,
        },
        update: { audioUrl: 'file:///a.m4a', durationSeconds: 12, transcript: null },
      });
      expect(result.transcript).toBeNull();
    });
  });

  describe('getAnswers', () => {
    it('hydrates stored answers with their prompt question, skipping unknown prompts', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.profilePromptVoiceAnswer.findMany.mockResolvedValue([
        {
          promptId,
          audioUrl: 'file:///a.m4a',
          durationSeconds: 12,
          transcript: 'a transcript',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          promptId: 'stale-removed-prompt',
          audioUrl: 'file:///b.m4a',
          durationSeconds: 5,
          transcript: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getAnswers(USER_ID);

      expect(result).toEqual([
        {
          promptId,
          question: PROFILE_PROMPTS[0].question,
          audioUrl: 'file:///a.m4a',
          durationSeconds: 12,
          transcript: 'a transcript',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('deleteAnswer', () => {
    it('throws when no answer exists for that prompt', async () => {
      prisma.profilePromptVoiceAnswer.findUnique.mockResolvedValue(null);

      await expect(service.deleteAnswer(USER_ID, PROFILE_PROMPTS[0].id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.profilePromptVoiceAnswer.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing answer', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.profilePromptVoiceAnswer.findUnique.mockResolvedValue({ userId: USER_ID, promptId });

      await service.deleteAnswer(USER_ID, promptId);

      expect(prisma.profilePromptVoiceAnswer.delete).toHaveBeenCalledWith({
        where: { userId_promptId: { userId: USER_ID, promptId } },
      });
    });
  });

  describe('reactToVoicePrompt', () => {
    const promptId = PROFILE_PROMPTS[0].id;
    const OTHER_USER_ID = 'user-2';

    it('rejects reacting to your own voice prompt', async () => {
      await expect(
        service.reactToVoicePrompt(USER_ID, USER_ID, promptId, 'Nice answer!'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.voicePromptReaction.create).not.toHaveBeenCalled();
    });

    it('rejects a reaction with neither a comment nor an audio reply', async () => {
      await expect(
        service.reactToVoicePrompt(USER_ID, OTHER_USER_ID, promptId),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.voicePromptReaction.create).not.toHaveBeenCalled();
    });

    it('throws when the target has no voice answer for that prompt', async () => {
      prisma.profilePromptVoiceAnswer.findUnique.mockResolvedValue(null);

      await expect(
        service.reactToVoicePrompt(USER_ID, OTHER_USER_ID, promptId, 'Nice answer!'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.voicePromptReaction.create).not.toHaveBeenCalled();
    });

    it('creates a text-comment reaction', async () => {
      prisma.profilePromptVoiceAnswer.findUnique.mockResolvedValue({
        userId: OTHER_USER_ID,
        promptId,
      });
      prisma.voicePromptReaction.create.mockResolvedValue({
        id: 'reaction-1',
        fromUserId: USER_ID,
        toUserId: OTHER_USER_ID,
        promptId,
        comment: 'Nice answer!',
        audioReplyUrl: null,
        durationSeconds: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.reactToVoicePrompt(USER_ID, OTHER_USER_ID, promptId, 'Nice answer!');

      expect(prisma.voicePromptReaction.create).toHaveBeenCalledWith({
        data: {
          fromUserId: USER_ID,
          toUserId: OTHER_USER_ID,
          promptId,
          comment: 'Nice answer!',
          audioReplyUrl: null,
          durationSeconds: null,
        },
      });
      expect(result).toEqual({
        id: 'reaction-1',
        fromUserId: USER_ID,
        toUserId: OTHER_USER_ID,
        promptId,
        comment: 'Nice answer!',
        audioReplyUrl: null,
        durationSeconds: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });

    it('creates an audio-reply reaction', async () => {
      prisma.profilePromptVoiceAnswer.findUnique.mockResolvedValue({
        userId: OTHER_USER_ID,
        promptId,
      });
      prisma.voicePromptReaction.create.mockResolvedValue({
        id: 'reaction-2',
        fromUserId: USER_ID,
        toUserId: OTHER_USER_ID,
        promptId,
        comment: null,
        audioReplyUrl: 'file:///tmp/reply.m4a',
        durationSeconds: 8,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.reactToVoicePrompt(
        USER_ID,
        OTHER_USER_ID,
        promptId,
        undefined,
        'file:///tmp/reply.m4a',
        8,
      );

      expect(prisma.voicePromptReaction.create).toHaveBeenCalledWith({
        data: {
          fromUserId: USER_ID,
          toUserId: OTHER_USER_ID,
          promptId,
          comment: null,
          audioReplyUrl: 'file:///tmp/reply.m4a',
          durationSeconds: 8,
        },
      });
      expect(result.audioReplyUrl).toBe('file:///tmp/reply.m4a');
    });
  });

  describe('listReactions', () => {
    it('returns reactions received on the caller’s own voice prompt, most recent first', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.voicePromptReaction.findMany.mockResolvedValue([
        {
          id: 'reaction-1',
          fromUserId: 'user-2',
          toUserId: USER_ID,
          promptId,
          comment: 'Love this!',
          audioReplyUrl: null,
          durationSeconds: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.listReactions(USER_ID, promptId);

      expect(prisma.voicePromptReaction.findMany).toHaveBeenCalledWith({
        where: { toUserId: USER_ID, promptId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].comment).toBe('Love this!');
    });
  });

  describe('recordVideoAnswer', () => {
    it('rejects an unknown prompt', async () => {
      await expect(
        service.recordVideoAnswer(USER_ID, 'not-a-real-prompt', 'file:///a.mp4', 10),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.profilePromptVideoAnswer.upsert).not.toHaveBeenCalled();
    });

    it('upserts the video answer', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.profilePromptVideoAnswer.upsert.mockResolvedValue({
        promptId,
        videoUrl: 'file:///a.mp4',
        durationSeconds: 12,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.recordVideoAnswer(USER_ID, promptId, 'file:///a.mp4', 12);

      expect(prisma.profilePromptVideoAnswer.upsert).toHaveBeenCalledWith({
        where: { userId_promptId: { userId: USER_ID, promptId } },
        create: { userId: USER_ID, promptId, videoUrl: 'file:///a.mp4', durationSeconds: 12 },
        update: { videoUrl: 'file:///a.mp4', durationSeconds: 12 },
      });
      expect(result).toEqual({
        promptId,
        question: PROFILE_PROMPTS[0].question,
        videoUrl: 'file:///a.mp4',
        durationSeconds: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getVideoAnswers', () => {
    it('hydrates stored answers with their prompt question, skipping unknown prompts', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.profilePromptVideoAnswer.findMany.mockResolvedValue([
        {
          promptId,
          videoUrl: 'file:///a.mp4',
          durationSeconds: 12,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          promptId: 'stale-removed-prompt',
          videoUrl: 'file:///b.mp4',
          durationSeconds: 5,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const result = await service.getVideoAnswers(USER_ID);

      expect(result).toEqual([
        {
          promptId,
          question: PROFILE_PROMPTS[0].question,
          videoUrl: 'file:///a.mp4',
          durationSeconds: 12,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('deleteVideoAnswer', () => {
    it('throws when no answer exists for that prompt', async () => {
      prisma.profilePromptVideoAnswer.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteVideoAnswer(USER_ID, PROFILE_PROMPTS[0].id),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.profilePromptVideoAnswer.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing answer', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.profilePromptVideoAnswer.findUnique.mockResolvedValue({ userId: USER_ID, promptId });

      await service.deleteVideoAnswer(USER_ID, promptId);

      expect(prisma.profilePromptVideoAnswer.delete).toHaveBeenCalledWith({
        where: { userId_promptId: { userId: USER_ID, promptId } },
      });
    });
  });
});
