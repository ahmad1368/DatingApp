import { ArrayMaxSize, IsArray, IsOptional, IsUrl } from 'class-validator';
import { MAX_SOCIAL_LINKS } from '../vetting.constants';

export class SubmitApplicationDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SOCIAL_LINKS)
  @IsUrl({}, { each: true })
  socialLinks?: string[];
}
