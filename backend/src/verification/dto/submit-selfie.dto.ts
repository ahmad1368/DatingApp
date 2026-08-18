import { IsNotEmpty, IsString } from 'class-validator';

export class SubmitSelfieDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @IsNotEmpty()
  selfieImageBase64!: string;
}
