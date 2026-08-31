import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS } from '../../messaging/messaging.constants';

export class SetProfilePollDto {
  @IsString()
  @Length(1, 200)
  question!: string;

  @IsArray()
  @ArrayMinSize(MIN_POLL_OPTIONS)
  @ArrayMaxSize(MAX_POLL_OPTIONS)
  @IsString({ each: true })
  options!: string[];
}
