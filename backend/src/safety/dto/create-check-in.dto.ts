import { IsISO8601, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateCheckInDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsOptional()
  @IsUUID()
  matchId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  notes?: string;
}
