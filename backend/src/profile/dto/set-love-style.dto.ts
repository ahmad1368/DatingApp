import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { ATTACHMENT_STYLES, LOVE_LANGUAGES, MAX_LOVE_LANGUAGE_SELECTIONS } from '../love-style.constants';

export class SetLoveStyleDto {
  @IsArray()
  @ArrayMaxSize(MAX_LOVE_LANGUAGE_SELECTIONS)
  @IsIn(LOVE_LANGUAGES, { each: true })
  loveLanguages!: string[];

  @IsBoolean()
  showLoveLanguagesOnProfile!: boolean;

  @IsOptional()
  @IsIn(ATTACHMENT_STYLES)
  attachmentStyle?: string;

  @IsBoolean()
  showAttachmentStyleOnProfile!: boolean;
}
