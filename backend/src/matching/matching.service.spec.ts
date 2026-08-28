import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MatchingService } from './matching.service';

const USER_ID = 'user-a';
const OTHER_ID = 'user-b';
const QUESTION_ID = 'question-1';

describe('MatchingService', () => {
  let service: MatchingService;
  let prisma: {
    question: { findMany: jest.Mock; findUnique: jest.Mock };
    questionAnswer: { upsert: jest.Mock; findMany: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      question: { findMany: jest.fn(), findUnique: jest.fn() },
      questionAnswer: { upsert: jest.fn(), findMany: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue({ dateOfBirth: null }) },
    };
    service = new MatchingService(prisma as unknown as PrismaService);
  });

  describe('listQuestions', () => {
    it('maps questions to their public view', async () => {
      prisma.question.findMany.mockResolvedValue([
        { id: QUESTION_ID, text: 'Do you want kids?', options: ['Yes', 'No'], createdAt: new Date() },
      ]);

      const questions = await service.listQuestions();

      expect(questions).toEqual([
        { id: QUESTION_ID, text: 'Do you want kids?', options: ['Yes', 'No'] },
      ]);
    });
  });

  describe('submitAnswer', () => {
    const dto = {
      questionId: QUESTION_ID,
      answer: 'Yes',
      acceptableAnswers: ['Yes'],
      importance: 'VERY_IMPORTANT',
    };

    it('throws when the question does not exist', async () => {
      prisma.question.findUnique.mockResolvedValue(null);

      await expect(service.submitAnswer(USER_ID, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an answer that is not one of the question options', async () => {
      prisma.question.findUnique.mockResolvedValue({
        id: QUESTION_ID,
        options: ['Yes', 'No'],
      });

      await expect(
        service.submitAnswer(USER_ID, { ...dto, answer: 'Maybe' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.questionAnswer.upsert).not.toHaveBeenCalled();
    });

    it('rejects acceptable answers outside the question options', async () => {
      prisma.question.findUnique.mockResolvedValue({
        id: QUESTION_ID,
        options: ['Yes', 'No'],
      });

      await expect(
        service.submitAnswer(USER_ID, { ...dto, acceptableAnswers: ['Maybe'] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('upserts a valid answer', async () => {
      prisma.question.findUnique.mockResolvedValue({ id: QUESTION_ID, options: ['Yes', 'No'] });
      prisma.questionAnswer.upsert.mockResolvedValue({
        questionId: QUESTION_ID,
        answer: 'Yes',
        acceptableAnswers: ['Yes'],
        importance: 'VERY_IMPORTANT',
      });

      const result = await service.submitAnswer(USER_ID, dto);

      expect(prisma.questionAnswer.upsert).toHaveBeenCalledWith({
        where: { userId_questionId: { userId: USER_ID, questionId: QUESTION_ID } },
        create: {
          userId: USER_ID,
          questionId: QUESTION_ID,
          answer: 'Yes',
          acceptableAnswers: ['Yes'],
          importance: 'VERY_IMPORTANT',
        },
        update: {
          answer: 'Yes',
          acceptableAnswers: ['Yes'],
          importance: 'VERY_IMPORTANT',
        },
      });
      expect(result).toEqual({
        questionId: QUESTION_ID,
        answer: 'Yes',
        acceptableAnswers: ['Yes'],
        importance: 'VERY_IMPORTANT',
      });
    });
  });

  describe('getCompatibility', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(service.getCompatibility(USER_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns null when the two users have no shared answered questions', async () => {
      prisma.questionAnswer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result).toEqual({
        percentage: null,
        sharedQuestionCount: 0,
        zodiacSign: null,
        otherZodiacSign: null,
        zodiacHarmony: null,
        zodiacElement: null,
        otherZodiacElement: null,
        zodiacCompatibilityScore: null,
      });
    });

    it('computes 100% when both sides fully satisfy each other', async () => {
      prisma.questionAnswer.findMany
        .mockResolvedValueOnce([
          {
            questionId: QUESTION_ID,
            answer: 'Yes',
            acceptableAnswers: ['Yes'],
            importance: 'VERY_IMPORTANT',
          },
        ])
        .mockResolvedValueOnce([
          {
            questionId: QUESTION_ID,
            answer: 'Yes',
            acceptableAnswers: ['Yes'],
            importance: 'IRRELEVANT',
          },
        ]);

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result).toEqual({
        percentage: 100,
        sharedQuestionCount: 1,
        zodiacSign: null,
        otherZodiacSign: null,
        zodiacHarmony: null,
        zodiacElement: null,
        otherZodiacElement: null,
        zodiacCompatibilityScore: null,
      });
    });

    it('zeroes out compatibility when a mandatory dealbreaker is unmet', async () => {
      prisma.questionAnswer.findMany
        .mockResolvedValueOnce([
          {
            questionId: QUESTION_ID,
            answer: 'No',
            acceptableAnswers: ['Yes'],
            importance: 'MANDATORY',
          },
        ])
        .mockResolvedValueOnce([
          {
            questionId: QUESTION_ID,
            answer: 'No',
            acceptableAnswers: ['No'],
            importance: 'SOMEWHAT_IMPORTANT',
          },
        ]);

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result).toEqual({
        percentage: 0,
        sharedQuestionCount: 1,
        zodiacSign: null,
        otherZodiacSign: null,
        zodiacHarmony: null,
        zodiacElement: null,
        otherZodiacElement: null,
        zodiacCompatibilityScore: null,
      });
    });

    it('only counts questions both users have answered', async () => {
      prisma.questionAnswer.findMany
        .mockResolvedValueOnce([
          {
            questionId: QUESTION_ID,
            answer: 'Yes',
            acceptableAnswers: ['Yes'],
            importance: 'MANDATORY',
          },
          {
            questionId: 'question-2',
            answer: 'No',
            acceptableAnswers: ['Yes'],
            importance: 'MANDATORY',
          },
        ])
        .mockResolvedValueOnce([
          {
            questionId: QUESTION_ID,
            answer: 'Yes',
            acceptableAnswers: ['Yes'],
            importance: 'MANDATORY',
          },
        ]);

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result.sharedQuestionCount).toBe(1);
      expect(result.percentage).toBe(100);
    });

    it('computes zodiac signs and harmony when both users have a date of birth', async () => {
      prisma.questionAnswer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findUnique
        .mockResolvedValueOnce({ dateOfBirth: new Date(Date.UTC(1995, 6, 25)) }) // Leo
        .mockResolvedValueOnce({ dateOfBirth: new Date(Date.UTC(1997, 2, 25)) }); // Aries

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result.zodiacSign).toBe('Leo');
      expect(result.otherZodiacSign).toBe('Aries');
      expect(result.zodiacHarmony).toBe('Highly Compatible');
      expect(result.zodiacElement).toBe('Fire');
      expect(result.otherZodiacElement).toBe('Fire');
      expect(result.zodiacCompatibilityScore).toBe(90);
    });

    it('leaves zodiac fields null when either user has no date of birth', async () => {
      prisma.questionAnswer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      prisma.user.findUnique
        .mockResolvedValueOnce({ dateOfBirth: new Date(Date.UTC(1995, 6, 25)) })
        .mockResolvedValueOnce({ dateOfBirth: null });

      const result = await service.getCompatibility(USER_ID, OTHER_ID);

      expect(result.zodiacSign).toBeNull();
      expect(result.otherZodiacSign).toBeNull();
      expect(result.zodiacHarmony).toBeNull();
      expect(result.zodiacElement).toBeNull();
      expect(result.otherZodiacElement).toBeNull();
      expect(result.zodiacCompatibilityScore).toBeNull();
    });
  });
});
