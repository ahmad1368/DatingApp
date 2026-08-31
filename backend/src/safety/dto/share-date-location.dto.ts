import { ArrayNotEmpty, IsArray, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ShareDateLocationDto {
  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;

  @IsOptional()
  @IsUUID()
  matchId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  destinationAddress?: string;

  /** Which of the caller's emergency contacts to notify; omit to notify all of them. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  contactIds?: string[];
}
