import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAnswerDto } from './dto/submit-answer.dto';
import { ANSWER_IMPORTANCE_WEIGHTS, AnswerImportance } from './matching.constants';
import { computeZodiacCompatibilityScore, computeZodiacHarmony, getZodiacElement, getZodiacSign } from './zodiac.utils';

export interface QuestionView {
  id: string;
  text: string;
  options: string[];
}

export interface AnswerView {
  questionId: string;
  answer: string;
  acceptableAnswers: string[];
  importance: string;
}

export interface CompatibilityResult {
  percentage: number | null;
  sharedQuestionCount: number;
  zodiacSign: string | null;
  otherZodiacSign: string | null;
  zodiacHarmony: string | null;
  zodiacElement: string | null;
  otherZodiacElement: string | null;
  zodiacCompatibilityScore: number | null;
}

interface AnswerRecord {
  questionId: string;
  answer: string;
  acceptableAnswers: string[];
  importance: string;
}

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async listQuestions(): Promise<QuestionView[]> {
    const questions = await this.prisma.question.findMany({ orderBy: { createdAt: 'asc' } });
    return questions.map((question) => ({
      id: question.id,
      text: question.text,
      options: question.options,
    }));
  }

  async submitAnswer(userId: string, dto: SubmitAnswerDto): Promise<AnswerView> {
    const question = await this.prisma.question.findUnique({ where: { id: dto.questionId } });
    if (!question) {
      throw new NotFoundException('Question not found.');
    }

    if (!question.options.includes(dto.answer)) {
      throw new BadRequestException('Answer must be one of the question options.');
    }
    if (dto.acceptableAnswers.some((option) => !question.options.includes(option))) {
      throw new BadRequestException('Acceptable answers must be among the question options.');
    }

    const answer = await this.prisma.questionAnswer.upsert({
      where: { userId_questionId: { userId, questionId: dto.questionId } },
      create: {
        userId,
        questionId: dto.questionId,
        answer: dto.answer,
        acceptableAnswers: dto.acceptableAnswers,
        importance: dto.importance,
      },
      update: {
        answer: dto.answer,
        acceptableAnswers: dto.acceptableAnswers,
        importance: dto.importance,
      },
    });

    return {
      questionId: answer.questionId,
      answer: answer.answer,
      acceptableAnswers: answer.acceptableAnswers,
      importance: answer.importance,
    };
  }

  async getCompatibility(userId: string, otherUserId: string): Promise<CompatibilityResult> {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot calculate compatibility with yourself.');
    }

    const [mine, theirs, me, other] = await Promise.all([
      this.prisma.questionAnswer.findMany({ where: { userId } }),
      this.prisma.questionAnswer.findMany({ where: { userId: otherUserId } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { dateOfBirth: true } }),
      this.prisma.user.findUnique({ where: { id: otherUserId }, select: { dateOfBirth: true } }),
    ]);
    const zodiac = this.computeZodiac(me?.dateOfBirth ?? null, other?.dateOfBirth ?? null);

    const theirsByQuestion = new Map(theirs.map((answer) => [answer.questionId, answer]));
    const mineByQuestion = new Map(mine.map((answer) => [answer.questionId, answer]));

    const sharedQuestionCount = mine.filter((answer) => theirsByQuestion.has(answer.questionId))
      .length;

    if (sharedQuestionCount === 0) {
      return { percentage: null, sharedQuestionCount: 0, ...zodiac };
    }

    const mySatisfaction = this.satisfaction(mine, theirsByQuestion);
    const theirSatisfaction = this.satisfaction(theirs, mineByQuestion);
    const percentage = Math.round(Math.sqrt(mySatisfaction * theirSatisfaction) * 100);

    return { percentage, sharedQuestionCount, ...zodiac };
  }

  private computeZodiac(
    dateOfBirth: Date | null,
    otherDateOfBirth: Date | null,
  ): Pick<
    CompatibilityResult,
    'zodiacSign' | 'otherZodiacSign' | 'zodiacHarmony' | 'zodiacElement' | 'otherZodiacElement' | 'zodiacCompatibilityScore'
  > {
    if (!dateOfBirth || !otherDateOfBirth) {
      return {
        zodiacSign: null,
        otherZodiacSign: null,
        zodiacHarmony: null,
        zodiacElement: null,
        otherZodiacElement: null,
        zodiacCompatibilityScore: null,
      };
    }

    const zodiacSign = getZodiacSign(dateOfBirth);
    const otherZodiacSign = getZodiacSign(otherDateOfBirth);
    return {
      zodiacSign,
      otherZodiacSign,
      zodiacHarmony: computeZodiacHarmony(zodiacSign, otherZodiacSign),
      zodiacElement: getZodiacElement(zodiacSign),
      otherZodiacElement: getZodiacElement(otherZodiacSign),
      zodiacCompatibilityScore: computeZodiacCompatibilityScore(zodiacSign, otherZodiacSign),
    };
  }

  private satisfaction(from: AnswerRecord[], to: Map<string, AnswerRecord>): number {
    let totalWeight = 0;
    let earnedWeight = 0;
    let dealbreakerFailed = false;

    for (const answer of from) {
      const theirAnswer = to.get(answer.questionId);
      if (!theirAnswer) {
        continue;
      }

      const weight = ANSWER_IMPORTANCE_WEIGHTS[answer.importance as AnswerImportance];
      totalWeight += weight;

      if (answer.acceptableAnswers.includes(theirAnswer.answer)) {
        earnedWeight += weight;
      } else if (answer.importance === 'MANDATORY') {
        dealbreakerFailed = true;
      }
    }

    if (dealbreakerFailed) {
      return 0;
    }
    if (totalWeight === 0) {
      return 1;
    }
    return earnedWeight / totalWeight;
  }
}
