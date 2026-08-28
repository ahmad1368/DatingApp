import { IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_PHOTO_CAPTION_LENGTH } from '../profile-photos.constants';

export class SetPhotoCaptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_PHOTO_CAPTION_LENGTH)
  caption?: string;
}
