import { IsString, Length } from 'class-validator';

export class ConfirmWorkVerificationDto {
  @IsString()
  @Length(1, 10)
  code!: string;
}
