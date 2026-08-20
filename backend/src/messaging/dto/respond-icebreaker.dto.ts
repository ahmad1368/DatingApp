import { IsIn } from 'class-validator';

export class RespondIcebreakerDto {
  @IsIn([0, 1])
  optionIndex!: number;
}
