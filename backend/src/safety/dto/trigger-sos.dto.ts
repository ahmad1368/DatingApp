import { ArrayNotEmpty, IsArray, IsLatitude, IsLongitude, IsOptional, IsUUID } from 'class-validator';

export class TriggerSosDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsUUID()
  matchId?: string;

  /** Which of the caller's emergency contacts to alert; omit to alert all of them. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  contactIds?: string[];
}
