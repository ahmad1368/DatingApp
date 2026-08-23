import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  };

  beforeEach(() => {
    prisma = {
      profilePromptVoiceAnswer: {
        upsert: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ProfilePromptsService(prisma as unknown as PrismaService);
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

    it('upserts the voice answer for a known prompt', async () => {
      const promptId = PROFILE_PROMPTS[0].id;
      prisma.profilePromptVoiceAnswer.upsert.mockResolvedValue({
        promptId,
        audioUrl: 'file:///a.m4a',
        durationSeconds: 12,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.recordAnswer(USER_ID, promptId, 'file:///a.m4a', 12);

      expect(prisma.profilePromptVoiceAnswer.upsert).toHaveBeenCalledWith({
        where: { userId_promptId: { userId: USER_ID, promptId } },
        create: { userId: USER_ID, promptId, audioUrl: 'file:///a.m4a', durationSeconds: 12 },
        update: { audioUrl: 'file:///a.m4a', durationSeconds: 12 },
      });
      expect(result).toEqual({
        promptId,
        question: PROFILE_PROMPTS[0].question,
        audioUrl: 'file:///a.m4a',
        durationSeconds: 12,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
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
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          promptId: 'stale-removed-prompt',
          audioUrl: 'file:///b.m4a',
          durationSeconds: 5,
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
});
