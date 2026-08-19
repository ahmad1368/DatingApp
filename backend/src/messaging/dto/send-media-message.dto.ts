import { IsIn, IsUrl } from 'class-validator';
import { MEDIA_CONTENT_TYPES } from '../messaging.constants';

export class SendMediaMessageDto {
  @IsIn(MEDIA_CONTENT_TYPES)
  contentType!: string;

  @IsUrl()
  mediaUrl!: string;
}
