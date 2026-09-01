import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpeningQuestionService } from './opening-question.service';

const USER_ID = 'user-1';

describe('OpeningQuestionService', () => {
  let service: OpeningQuestionService;
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
    service = new OpeningQuestionService(prisma as unknown as PrismaService);
  });

  describe('setOpeningQuestion', () => {
    it('rejects an unknown question id', async () => {
      await expect(service.setOpeningQuestion(USER_ID, 'not-a-real-question')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('persists a known question id and returns the full question', async () => {
      const result = await service.setOpeningQuestion(USER_ID, 'perfect-day');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { openingQuestionId: 'perfect-day' },
      });
      expect(result).toEqual({
        questionId: 'perfect-day',
        question: 'What would our perfect first date look like?',
      });
    });
  });

  describe('clearOpeningQuestion', () => {
    it('clears the stored question id', async () => {
      const result = await service.clearOpeningQuestion(USER_ID);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER_ID },
        data: { openingQuestionId: null },
      });
      expect(result).toEqual({ cleared: true });
    });
  });

  describe('getOpeningQuestion', () => {
    it('throws when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getOpeningQuestion(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns nulls when the user has not selected a question', async () => {
      prisma.user.findUnique.mockResolvedValue({ openingQuestionId: null });

      const result = await service.getOpeningQuestion(USER_ID);

      expect(result).toEqual({ questionId: null, question: null });
    });

    it('returns the selected question text', async () => {
      prisma.user.findUnique.mockResolvedValue({ openingQuestionId: 'karaoke-song' });

      const result = await service.getOpeningQuestion(USER_ID);

      expect(result).toEqual({ questionId: 'karaoke-song', question: "What's your go-to karaoke song?" });
    });
  });
});
