import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnswerTopicQuizQuestionDto } from './dto/answer-topic-quiz-question.dto';
import { SubmitTopicQuizDto } from './dto/submit-topic-quiz.dto';
import {
  categoryForQuestion,
  TOPIC_QUIZ_QUESTIONS,
  TopicQuizCategory,
  TopicQuizStance,
} from './topic-quiz.constants';

export interface TopicQuizQuestionView {
  id: string;
  category: TopicQuizCategory;
  statement: string;
}

export interface TopicQuizProfileView {
  responses: Record<string, TopicQuizStance>;
  completedAt: string;
}

export type TopicAgreement = 'AGREE' | 'PARTIAL' | 'DISAGREE';

export interface TopicAlignmentItem {
  questionId: string;
  category: TopicQuizCategory | 'Other';
  statement: string;
  myStance: TopicQuizStance;
  theirStance: TopicQuizStance;
  agreement: TopicAgreement;
}

export interface TopicAlignmentResult {
  alignmentPercentage: number | null;
  sharedTopicCount: number;
  items: TopicAlignmentItem[];
}

@Injectable()
export class TopicQuizService {
  constructor(private readonly prisma: PrismaService) {}

  getQuestions(): TopicQuizQuestionView[] {
    return TOPIC_QUIZ_QUESTIONS.map(({ id, category, statement }) => ({ id, category, statement }));
  }

  async submitQuiz(userId: string, dto: SubmitTopicQuizDto): Promise<TopicQuizProfileView> {
    const questionIds = new Set(TOPIC_QUIZ_QUESTIONS.map((question) => question.id));

    const seenQuestionIds = new Set<string>();
    for (const response of dto.responses) {
      if (!questionIds.has(response.questionId)) {
        throw new BadRequestException(`Unknown quiz question: ${response.questionId}`);
      }
      if (seenQuestionIds.has(response.questionId)) {
        throw new BadRequestException(`Duplicate response for question: ${response.questionId}`);
      }
      seenQuestionIds.add(response.questionId);
    }
    if (seenQuestionIds.size !== TOPIC_QUIZ_QUESTIONS.length) {
      throw new BadRequestException('The quiz must be answered in full.');
    }

    const responses: Record<string, TopicQuizStance> = {};
    for (const response of dto.responses) {
      responses[response.questionId] = response.stance as TopicQuizStance;
    }

    const profile = await this.prisma.topicQuizProfile.upsert({
      where: { userId },
      create: { userId, responses },
      update: { responses, completedAt: new Date() },
    });

    return this.toView(profile);
  }

  async getMyResponses(userId: string): Promise<TopicQuizProfileView> {
    const profile = await this.prisma.topicQuizProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new NotFoundException("You haven't taken the topic quiz yet.");
    }
    return this.toView(profile);
  }

  /**
   * Answers a single question at a time - unlike submitQuiz's all-at-once
   * survey flow, this lets the quiz be taken incrementally (e.g. one prompt
   * surfaced per discovery session) while immediately counting toward
   * getAlignment for any candidate who already answered the same question.
   * Doesn't touch completedAt, which only submitQuiz's full-survey flow sets.
   */
  async answerQuestion(userId: string, dto: AnswerTopicQuizQuestionDto): Promise<TopicQuizProfileView> {
    if (!TOPIC_QUIZ_QUESTIONS.some((question) => question.id === dto.questionId)) {
      throw new BadRequestException(`Unknown quiz question: ${dto.questionId}`);
    }

    const existing = await this.prisma.topicQuizProfile.findUnique({ where: { userId } });
    const responses = {
      ...((existing?.responses as Record<string, TopicQuizStance>) ?? {}),
      [dto.questionId]: dto.stance as TopicQuizStance,
    };

    const profile = await this.prisma.topicQuizProfile.upsert({
      where: { userId },
      create: { userId, responses },
      update: { responses },
    });

    return this.toView(profile);
  }

  /** The first quiz question this user hasn't answered yet, or null once all are done. */
  async getNextQuestion(userId: string): Promise<TopicQuizQuestionView | null> {
    const profile = await this.prisma.topicQuizProfile.findUnique({ where: { userId } });
    const answeredIds = new Set(Object.keys((profile?.responses as Record<string, TopicQuizStance>) ?? {}));

    const next = TOPIC_QUIZ_QUESTIONS.find((question) => !answeredIds.has(question.id));
    if (!next) {
      return null;
    }
    return { id: next.id, category: next.category, statement: next.statement };
  }

  /**
   * Side-by-side agree/disagree/partial indicators for every topic both
   * users answered, plus an overall alignment percentage (AGREE = 1,
   * PARTIAL = 0.5, DISAGREE = 0) - deliberately discrete, unlike the
   * continuous similarity scoring in PersonalityTestService.
   */
  async getAlignment(userId: string, otherUserId: string): Promise<TopicAlignmentResult> {
    if (userId === otherUserId) {
      throw new BadRequestException('Cannot calculate alignment with yourself.');
    }

    const [mine, theirs] = await Promise.all([
      this.prisma.topicQuizProfile.findUnique({ where: { userId } }),
      this.prisma.topicQuizProfile.findUnique({ where: { userId: otherUserId } }),
    ]);

    if (!mine || !theirs) {
      return { alignmentPercentage: null, sharedTopicCount: 0, items: [] };
    }

    const myResponses = mine.responses as Record<string, TopicQuizStance>;
    const theirResponses = theirs.responses as Record<string, TopicQuizStance>;
    const questionById = new Map(TOPIC_QUIZ_QUESTIONS.map((question) => [question.id, question]));

    const sharedQuestionIds = Object.keys(myResponses).filter(
      (questionId) => questionId in theirResponses,
    );
    if (sharedQuestionIds.length === 0) {
      return { alignmentPercentage: null, sharedTopicCount: 0, items: [] };
    }

    const items: TopicAlignmentItem[] = sharedQuestionIds.map((questionId) => {
      const myStance = myResponses[questionId];
      const theirStance = theirResponses[questionId];
      return {
        questionId,
        category: categoryForQuestion(questionId),
        statement: questionById.get(questionId)?.statement ?? '',
        myStance,
        theirStance,
        agreement: this.compareStances(myStance, theirStance),
      };
    });

    const scoreByAgreement: Record<TopicAgreement, number> = { AGREE: 1, PARTIAL: 0.5, DISAGREE: 0 };
    const totalScore = items.reduce((sum, item) => sum + scoreByAgreement[item.agreement], 0);

    return {
      alignmentPercentage: Math.round((totalScore / items.length) * 100),
      sharedTopicCount: items.length,
      items,
    };
  }

  private compareStances(myStance: TopicQuizStance, theirStance: TopicQuizStance): TopicAgreement {
    if (myStance === theirStance) {
      return 'AGREE';
    }
    if (myStance === 'NEUTRAL' || theirStance === 'NEUTRAL') {
      return 'PARTIAL';
    }
    return 'DISAGREE';
  }

  private toView(profile: { responses: unknown; completedAt: Date }): TopicQuizProfileView {
    return {
      responses: profile.responses as Record<string, TopicQuizStance>,
      completedAt: profile.completedAt.toISOString(),
    };
  }
}
