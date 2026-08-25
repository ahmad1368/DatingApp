import { IsBoolean } from 'class-validator';

export class SetMediaBlurPreferenceDto {
  @IsBoolean()
  enabled!: boolean;
}
