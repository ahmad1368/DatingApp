import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfilePromptsService } from './profile-prompts.service';

const USER_ID = 'user-1';

describe('ProfilePromptsService', () => {
  let service: ProfilePromptsService;
  let prisma: {
    profilePrompt: { findMany: jest.Mock; deleteMany: jest.Mock; createMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      profilePrompt: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    service = new ProfilePromptsService(prisma as unknown as PrismaService);
  });

  describe('getPrompts', () => {
    it('returns the user prompts ordered by position', async () => {
      prisma.profilePrompt.findMany.mockResolvedValue([
        { question: 'Q1', answer: 'A1', position: 0 },
        { question: 'Q2', answer: 'A2', position: 1 },
      ]);

      const result = await service.getPrompts(USER_ID);

      expect(prisma.profilePrompt.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        orderBy: { position: 'asc' },
      });
      expect(result).toEqual([
        { question: 'Q1', answer: 'A1', position: 0 },
        { question: 'Q2', answer: 'A2', position: 1 },
      ]);
    });
  });

  describe('setPrompts', () => {
    it('rejects duplicate questions in the same submission', async () => {
      await expect(
        service.setPrompts(USER_ID, [
          { question: 'Q1', answer: 'A1' },
          { question: 'Q1', answer: 'A2' },
          { question: 'Q3', answer: 'A3' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('replaces the existing prompts within a transaction', async () => {
      const input = [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
        { question: 'Q3', answer: 'A3' },
      ];
      prisma.profilePrompt.deleteMany.mockResolvedValue({});
      prisma.profilePrompt.createMany.mockResolvedValue({});
      prisma.profilePrompt.findMany.mockResolvedValue(
        input.map((p, index) => ({ ...p, position: index })),
      );

      const result = await service.setPrompts(USER_ID, input);

      expect(prisma.profilePrompt.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.profilePrompt.createMany).toHaveBeenCalledWith({
        data: input.map((p, index) => ({
          userId: USER_ID,
          question: p.question,
          answer: p.answer,
          position: index,
        })),
      });
      expect(result).toEqual(input.map((p, index) => ({ ...p, position: index })));
    });
  });
});
