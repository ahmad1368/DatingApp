import { IsIn, IsString } from 'class-validator';
import { TOPIC_QUIZ_STANCES } from '../topic-quiz.constants';

export class AnswerTopicQuizQuestionDto {
  @IsString()
  questionId!: string;

  @IsIn(TOPIC_QUIZ_STANCES)
  stance!: string;
}
