import { IsBoolean } from 'class-validator';

export class DecideRoundDto {
  @IsBoolean()
  wantsMatch!: boolean;
}
