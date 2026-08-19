import { IsString, MinLength } from 'class-validator';

export class SubmitIceCandidateDto {
  @IsString()
  @MinLength(1)
  candidate!: string;
}
