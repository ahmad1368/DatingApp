import { IsString } from 'class-validator';

export class SendIcebreakerDto {
  @IsString()
  promptId!: string;
}
