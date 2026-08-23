import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TopicQuizService } from './topic-quiz.service';
import { TOPIC_QUIZ_QUESTIONS } from './topic-quiz.constants';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';

function fullValidResponses(overrides: Record<string, string> = {}) {
  return TOPIC_QUIZ_QUESTIONS.map((question) => ({
    questionId: question.id,
    stance: overrides[question.id] ?? 'NEUTRAL',
  }));
}

describe('TopicQuizService', () => {
  let service: TopicQuizService;
  let prisma: { topicQuizProfile: { upsert: jest.Mock; findUnique: jest.Mock } };

  beforeEach(() => {
    prisma = { topicQuizProfile: { upsert: jest.fn(), findUnique: jest.fn() } };
    service = new TopicQuizService(prisma as unknown as PrismaService);
  });

  describe('getQuestions', () => {
    it('exposes all 12 questions without leaking any stance', () => {
      const questions = service.getQuestions();

      expect(questions).toHaveLength(12);
      expect(questions[0]).toEqual({
        id: TOPIC_QUIZ_QUESTIONS[0].id,
        category: TOPIC_QUIZ_QUESTIONS[0].category,
        statement: TOPIC_QUIZ_QUESTIONS[0].statement,
      });
    });
  });

  describe('submitQuiz', () => {
    it('rejects a response for an unknown question', async () => {
      const responses = [{ questionId: 'not-a-real-question', stance: 'AGREE' }];

      await expect(service.submitQuiz(USER_ID, { responses })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.topicQuizProfile.upsert).not.toHaveBeenCalled();
    });

    it('rejects a duplicate response for the same question', async () => {
      const responses = [
        { questionId: TOPIC_QUIZ_QUESTIONS[0].id, stance: 'AGREE' },
        { questionId: TOPIC_QUIZ_QUESTIONS[0].id, stance: 'DISAGREE' },
      ];

      await expect(service.submitQuiz(USER_ID, { responses })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an incomplete submission', async () => {
      const responses = [{ questionId: TOPIC_QUIZ_QUESTIONS[0].id, stance: 'AGREE' }];

      await expect(service.submitQuiz(USER_ID, { responses })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('stores a full submission keyed by question id', async () => {
      const responses = fullValidResponses({
        [TOPIC_QUIZ_QUESTIONS[0].id]: 'AGREE',
      });
      prisma.topicQuizProfile.upsert.mockResolvedValue({
        responses: { [TOPIC_QUIZ_QUESTIONS[0].id]: 'AGREE' },
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      await service.submitQuiz(USER_ID, { responses });

      const upsertCall = prisma.topicQuizProfile.upsert.mock.calls[0][0];
      expect(upsertCall.where).toEqual({ userId: USER_ID });
      expect(upsertCall.create.responses[TOPIC_QUIZ_QUESTIONS[0].id]).toBe('AGREE');
    });
  });

  describe('getMyResponses', () => {
    it('throws when the user has not taken the quiz', async () => {
      prisma.topicQuizProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyResponses(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the stored responses', async () => {
      prisma.topicQuizProfile.findUnique.mockResolvedValue({
        responses: { 'climate-policy': 'AGREE' },
        completedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.getMyResponses(USER_ID);

      expect(result).toEqual({
        responses: { 'climate-policy': 'AGREE' },
        completedAt: '2026-01-01T00:00:00.000Z',
      });
    });
  });

  describe('getAlignment', () => {
    it('rejects comparing a user with themselves', async () => {
      await expect(service.getAlignment(USER_ID, USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns null alignment when either user has not taken the quiz', async () => {
      prisma.topicQuizProfile.findUnique
        .mockResolvedValueOnce({ responses: { 'climate-policy': 'AGREE' } })
        .mockResolvedValueOnce(null);

      const result = await service.getAlignment(USER_ID, OTHER_ID);

      expect(result).toEqual({ alignmentPercentage: null, sharedTopicCount: 0, items: [] });
    });

    it('builds agree/partial/disagree indicators across shared topics', async () => {
      prisma.topicQuizProfile.findUnique
        .mockResolvedValueOnce({
          responses: { 'climate-policy': 'AGREE', 'astrology-belief': 'DISAGREE', 'big-wedding': 'NEUTRAL' },
        })
        .mockResolvedValueOnce({
          responses: { 'climate-policy': 'AGREE', 'astrology-belief': 'AGREE', 'big-wedding': 'DISAGREE' },
        });

      const result = await service.getAlignment(USER_ID, OTHER_ID);

      expect(result.sharedTopicCount).toBe(3);
      // AGREE=1, DISAGREE=0, PARTIAL(neutral)=0.5 -> (1 + 0 + 0.5) / 3 = 50%
      expect(result.alignmentPercentage).toBe(50);
      expect(result.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ questionId: 'climate-policy', agreement: 'AGREE' }),
          expect.objectContaining({ questionId: 'astrology-belief', agreement: 'DISAGREE' }),
          expect.objectContaining({ questionId: 'big-wedding', agreement: 'PARTIAL' }),
        ]),
      );
    });
  });
});
