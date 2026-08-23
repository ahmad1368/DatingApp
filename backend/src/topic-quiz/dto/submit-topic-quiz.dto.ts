import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { TOPIC_QUIZ_QUESTIONS, TOPIC_QUIZ_STANCES } from '../topic-quiz.constants';

export class TopicQuizResponseDto {
  @IsString()
  questionId!: string;

  @IsIn(TOPIC_QUIZ_STANCES)
  stance!: string;
}

export class SubmitTopicQuizDto {
  @IsArray()
  @ArrayMinSize(TOPIC_QUIZ_QUESTIONS.length)
  @ArrayMaxSize(TOPIC_QUIZ_QUESTIONS.length)
  @ValidateNested({ each: true })
  @Type(() => TopicQuizResponseDto)
  responses!: TopicQuizResponseDto[];
}
