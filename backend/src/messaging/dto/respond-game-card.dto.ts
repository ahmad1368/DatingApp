import { IsInt, Max, Min } from 'class-validator';

export class RespondGameCardDto {
  @IsInt()
  @Min(0)
  @Max(3)
  answerIndex!: number;
}
