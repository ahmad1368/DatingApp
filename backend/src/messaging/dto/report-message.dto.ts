import { IsString, Length } from 'class-validator';

export class ReportMessageDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
