import { IsBoolean } from 'class-validator';

export class SetBlurUntilMatchDto {
  @IsBoolean()
  enabled!: boolean;
}
