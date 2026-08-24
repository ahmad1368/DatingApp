import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '../messaging.constants';

export class SendPollDto {
  @IsString()
  @Length(1, 300)
  question!: string;

  @IsArray()
  @ArrayMinSize(MIN_POLL_OPTIONS)
  @ArrayMaxSize(MAX_POLL_OPTIONS)
  @IsString({ each: true })
  @Length(1, 100, { each: true })
  options!: string[];
}
